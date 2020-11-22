var http = require('http').createServer(handler); //require http server, and create server with function handler()
var fs = require('fs'); //require filesystem module

http.listen(8080); //listen to port 8080

function handler(req, res) { 
  let url = req.url;
  if (url === "/") {
    url = "/index.html";
  }
  const filetype = url.substring(url.lastIndexOf(".") + 1);

  fs.readFile(__dirname + '/public' + url, function(err, data) { //read file  in public folder
    if (err) {
      res.writeHead(404, {'Content-Type': 'text/html'}); //display 404 on error
      return res.end("404 Not Found");
    }

    console.log(`Filetype: ${filetype}`);
    switch (filetype) {
      case "html":
        res.writeHead(200, { 'Content-Type': 'text/html' }); //write HTML
        break;
      case "css":
        res.writeHead(200, { 'Content-Type': 'text/css' }); //write CSS
        break;
      case "js":
          res.writeHead(200, { 'Content-Type': 'text/javascript' }); //write JS
          break;
      default:
        res.writeHead(200, { 'Content-Type': 'text/plain' }); //write plain text
    }
    
    res.write(data); //write data from file
    return res.end();
  });
} 