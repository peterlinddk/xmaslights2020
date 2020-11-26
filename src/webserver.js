var http = require("http").createServer(handler); //require http server, and create server with function handler()
var fs = require("fs"); //require filesystem module

http.listen(8080); //listen to port 8080

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
