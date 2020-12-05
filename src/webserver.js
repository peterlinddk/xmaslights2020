"use strict";
import http from "http"; // http is the server
import fs from "fs"; // require filesystem module
import path from 'path'; // need path to get __dirname
import { Server } from 'socket.io';
import { Player } from "./player.js";


const server = http.createServer(handler); // Create HTTP server that calls the function 'handler' on requests
server.listen(8080); //listen to port 8080

// Create socket.io for the same server ...
const io = new Server(server);

const __dirname = `${path.resolve()}/src`;

function handler(req, res) {
  
  let url = req.url;

  if (req.method === "POST") {
    // Receive POST data
    let body = "";
    req.on("data", chunk => {
      body += chunk.toString();
    });
    req.on("end", () => {
      console.log("Received sequence from client");
      
      // rename existing sequence.json to sequence_DATETIME.backup
      const d = new Date();
      const DATETIME = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}${String(d.getSeconds()).padStart(2, "0")}`;

      const backupName = `sequence_${DATETIME}.backup`;

      fs.rename(`${__dirname}/public/sequence.json`, `${__dirname}/public/${backupName}`, function (err) {
        if (err) {
          console.log("ERROR: ", err);
        } else {
          console.log(`Renamed old sequence to ${backupName}`);
          // Write new sequence.json
          fs.writeFile(`${__dirname}/public/sequence.json`, body, function (err) {
            if (err) throw err;
            console.log("Saved new file succesfully");
            // Send JSON response back to client.
            const result = {
              "received": "OK",
              "renamedOldTo": `${backupName}`
            };
            res.writeHead(200, { "Content-Type": "application/json" });
            res.write(JSON.stringify(result));
            res.end();

            // Inform player, and get it to reload the sequence!
            player.reloadSequence();

          });
        }
      });
    })

  } else {
    // Normal GET request
    // console.log("GET");

    if (url === "/") {
      url = "/index.html";
    }
    const filetype = url.substring(url.lastIndexOf(".") + 1);

    fs.readFile(__dirname + "/public" + url, function (err, data) {
      //read file  in public folder
      if (err) {
        res.writeHead(404, { "Content-Type": "text/html" }); //display 404 on error
        return res.end("404 Not Found");
      }

      switch (filetype) {
        case "html":
          res.writeHead(200, { "Content-Type": "text/html; charset=UTF-8" }); //write HTML
          break;
        case "css":
          res.writeHead(200, { "Content-Type": "text/css; charset=UTF-8" }); //write CSS
          break;
        case "js":
          res.writeHead(200, { "Content-Type": "text/javascript; charset=UTF-8" }); //write JS
          break;
        case "json":
          res.writeHead(200, { "Content-Type": "application/json" }); //write JSON
          break;
        default:
          console.log(`Unhandled filetype: ${filetype}`);
          res.writeHead(200, { "Content-Type": "text/plain" }); //write plain text
      }

      res.write(data); //write data from file
      return res.end();
    });
  }
}

const player = new Player();
player.loadSequence(function () {
  player.setPlayerMode("realtime"); // Start playing when done loading (this should be the default)  
});


// Listen for play-state changes from the client - starts and stops the player
io.sockets.on("connection", function (socket) {
  player.addEventListener("play", updatePlayState);
  player.addEventListener("pause", updatePlayState);
  player.addEventListener("timeupdate", updatePlayerTime);
  player.addEventListener("statechange", updateStateInfo);
  player.addEventListener("modechange", updatePlayerMode);
  player.addEventListener("speedchange", updatePlayerSpeed);

  // on initial connection, send current play-mode and play-state to client
  player.updateAllListeners();

  // TODO: Missing some settings when opening in multiple windows ... push for later revisions!

  // then wait for client data
  socket.on("play-state", function (data) {
    if (data === "play") {
      player.play();
      // sending play-state back to the client will be handled by the listener
    } else if (data === "pause") {
      player.pause();
      // sending play-state back to the client will be handled by the listener
    }
  });

  socket.on("play-time", function (data) {
    console.log(`Play time has been updated to ${data} from the client!`);
    player.setCurrentTime(data);
  });

  socket.on("play-mode", function (data) {
    console.log(`Play mode has been set to ${data} by the client!`);
    player.setPlayerMode(data);
  });

  socket.on("play-speed", function(data) {
    console.log(`Play speed has been set to: ${data} by the client!`);
    player.setPlayerSpeed(Number.parseInt(data));
  });

  function updatePlayState(playing) {
    if (playing) {
      socket.emit("play-state", "playing");
    } else {
      socket.emit("play-state", "paused");
    }
  }

  function updatePlayerSpeed(speed) {
    socket.emit("play-speed", speed);
  }

  // update player currentTime
  function updatePlayerTime(time) { // TODO: Maybe get actual event here ...
    socket.emit("play-time", time.timecode)
  }

  function updatePlayerMode(mode) {
    socket.emit("play-mode", mode);
  }

  // update LED states
  function updateStateInfo( track, state ) {
    socket.emit("play-change", { track: track.index, state });
  }

});

process.on("SIGINT", function () {
  console.log("Process stopped by user with ctrl+c");
  // TODO: Stop socket??? - inform client?

  // stop player
  player.pause();
  // Unexport GPIOs
  player.releaseGPIO()
  // stop server - but don't wait ...
  server.close();
  // clear/end stdout
  process.stdout.end();
  console.log("\nServer has closed down");
  process.exit();  
})

