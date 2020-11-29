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
    // console.log("POST");
    let body = "";
    req.on("data", chunk => {
      body += chunk.toString();
    });
    req.on("end", () => {
      console.log("Done receiving POST");
      
      // rename existing sequence.json to sequence_DATETIME.backup
      const d = new Date();
      const DATETIME = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}${String(d.getSeconds()).padStart(2, "0")}`;

      fs.rename(`${__dirname}/public/sequence.json`, `${__dirname}/public/sequence_${DATETIME}.backup`, function (err) {
        if (err) {
          console.log("ERROR: ", err);
        } else {
          console.log("Renamed old sequence to backup");
          // Write new sequence.json
          fs.writeFile(`${__dirname}/public/sequence.json`, body, function (err) {
            if (err) throw err;
            console.log("Saved file succesfully");
            // Send JSON response back to client.
            const result = {
              "received": "OK",
              "renamedOldTo": `${__dirname}/public/sequence_${DATETIME}.backup`
            };
            res.writeHead(200, { "Content-Type": "application/json" });
            res.write(JSON.stringify(result));
            res.end();

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
player.loadSequence();  // TODO: Make player configurable to re-load the sequence when asked (or when re-exported)

// Listen for play-state changes from the client - starts and stops the player
io.sockets.on("connection", function (socket) {
  // on initial connection, send play-state paused to client
  socket.emit("play-state", "paused");

  // otherwise wait for client data
  socket.on("play-state", function (data) {

    // update player currentTime
    function updatePlayerTime(time) { // TODO: Maybe get actual event here ...
      socket.emit("play-time", time.timecode)
    }

    function updateStateInfo( track, state ) {
      socket.emit("play-change", { track: track.index, state });
    }

    console.log(`Playing: ${data}`);
    if (data === "play") {
      player.play();
      player.addEventListener("timeupdate", updatePlayerTime);
      player.addEventListener("statechange", updateStateInfo)

      // send play-state back to the client
      socket.emit("play-state", "playing");

    } else if (data === "pause") {
      player.pause();

      // send play-state (paused) back to the client
      socket.emit("play-state", "paused");
    }
  });

  socket.on("play-time", function (data) {
    console.log(`Play time has been updated to ${data} from the client!`);
    player.setCurrentTime(data);
  });

});

process.on("SIGINT", function () {
  console.log("Process stopped by user with ctrl+c");
  // TODO: Unexport GPIOs

  // TODO: Stop socket???

  // stop player
  player.pause();
  process.stdout.end();
  process.exit();
})

