"use strict";

window.addEventListener("DOMContentLoaded", loaded);

function loaded() {
  console.log("Start");
  buildSVG();
  positionSpans();
}

function buildSVG() {
  const svg = document.querySelector("#timecodes svg");

  const width = svg.clientWidth;
  // one hour is width/24 - one minute is width/1440
  const hourWidth = width / 24;
  const minuteWidth = hourWidth / 60;

  // set viewBox
  svg.setAttribute("viewBox", `0 0 ${width} 20`);

  const ruler = svg.querySelector("#ruler");

  // draw hour-lines
  for (let h = 0; h < 25; h++) {
    // add hour-line
    addLine(h * hourWidth, 10);

    // Add text below ruler
    if (h > 0 && h < 24) {
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.classList.add("small");
      text.setAttribute("x", h*hourWidth); // TODO: Find correct pixel-width
      text.setAttribute("y", 20);
      text.textContent = `${h.toString().padStart(2," ")}:00`;
      ruler.append(text);
    }

    // add half-hour-line
    addLine(h * hourWidth + hourWidth / 2, 6);
    // add quarter-line 1
    addLine(h * hourWidth + hourWidth / 4, 3);
    // add quarter-line 2
    addLine(h*hourWidth+hourWidth/4+hourWidth/2,3);
  }

  function addLine(x, height) {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", x);
    line.setAttribute("x2", x);
    line.setAttribute("y1", 0);
    line.setAttribute("y1", height);
    ruler.append(line);
  }
}

function positionSpans() {
  // find all spans in all timelines, and set their left and width depending on start and end-time
  document.querySelectorAll(".timeline").forEach(timeline => {
  
    // Find width of this timeline - should be the same for all of them
    const width = timeline.clientWidth;
    // one hour is width/24 - one minute is width/1440
    const hourWidth = width / 24;
    const minuteWidth = hourWidth / 60;
    
    
    timeline.querySelectorAll("span").forEach(span => {
      const startTime = span.dataset.startTime;
      const endTime = span.dataset.endTime;

      let [hour, minute] = startTime.split(":").map(val => Number(val));
      
      const pixelStart = hour * hourWidth + minute * minuteWidth;
      span.style.left = pixelStart + "px";

      [hour, minute] = endTime.split(":").map(val => Number(val));

      const pixelWidth = hour * hourWidth + minute * minuteWidth - pixelStart;
      span.style.width = pixelWidth + "px";

      
      
      
    });
  });
    
}