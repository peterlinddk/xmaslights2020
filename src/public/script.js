"use strict";

window.addEventListener("DOMContentLoaded", loaded);

function loaded() {
  console.log("Start");
  buildSVG();
  positionSpans();
  window.addEventListener("resize", resize);

  document.querySelectorAll("[data-action]").forEach(button => button.addEventListener("click", performAction));

  scroller.init();
}

function resize() {
  console.log("resize");
  buildSVG();
  positionSpans();
}

let zoomFactor = 1;

function buildSVG() {
  const svg = document.querySelector("#timecodes svg");

  const width = svg.clientWidth;
  // one hour is width/24 - one minute is width/1440
  const hourWidth = width / 24 * zoomFactor;
  const minuteWidth = hourWidth / 60;

  // set viewBox
  svg.setAttribute("viewBox", `0 0 ${width} 20`);

  const ruler = svg.querySelector("#ruler");
  // remove everything inside the ruler
  ruler.innerHTML = "";

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
    const width = timeline.clientWidth * zoomFactor;
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

function performAction(event) {
  // find action to perform
  let target = event.target;
  let action;

  // Find the actual action - the target might be a child of the element with the action
  while (!action) {
    action = target.dataset.action;
    target = target.parentElement;
  }

//  console.log(`Do action: ${action}`);
  switch (action) {
    case "zoom_in":
      zoomIn();
      break;
    case "zoom_out":
      zoomOut();
      break;
  }
}

function zoomIn() {
  console.log("zoom in");
  zoomFactor += .2;
  resize();
}

function zoomOut() {
  console.log("zoom out");
  zoomFactor -= .2;
  if (zoomFactor < 1) {
    zoomFactor = 1;
  }
  resize();
}



/* scroller */

const scroller = {

  init() {
    this.scrollbar = document.querySelector("#scrollbar");
    this.scrollarea = document.querySelector("#scroller");

    this.scrollBarX = 0;
    this.scrollBarW = this.scrollarea.clientWidth;

    this.updateScrollBar();

    // add eventlisteners - only mousedown for starters
    this.scrollbar.addEventListener("mousedown", this);
  },
  handleEvent(event) {
    // console.log(`Event type: ${event.type}`);
    if (event.type === "mouseup" || event.type === "mouseleave") {
      this.release(event);
    }
    if (event.type === "mousedown") {
      this.grab(event);
    }
    if (event.type === "mousemove") {
      this.move(event);
    }
  },
  grab(event) {
    // console.log("Grab!");
    // console.log(event);
    this.grabbing = true;
    this.scrollbar.classList.add("grabbing");
    this.scrollarea.addEventListener("mousemove", this);
    this.scrollarea.addEventListener("mouseup", this);
    this.scrollarea.addEventListener("mouseleave", this);

    // Find click point relative to scrollarea
    this.startX = event.clientX - this.scrollarea.offsetLeft;

    // Find click point relative to scrollbar
    this.controlPoint = event.layerX;

    // Find remainder of scrollbar, after the controlpoint - used for calculating width change
    this.remainder = this.scrollbar.clientWidth - this.controlPoint;

    // figure out which element is grabbed
    if (this.controlPoint < 16) {
      this.grabbedElement = "start";
    } else if (this.controlPoint > this.scrollbar.clientWidth - 16) {
      this.grabbedElement = "end";
    } else {
      this.grabbedElement = "scrollbar";
    }

    // console.log(`Grab: ${this.grabbedElement} @ ${this.controlPoint} ~ ${this.startX} + ${this.remainder} remaining`);
  },
  release(event) {
    // console.log("Release!");
    this.grabbing = false;
    this.scrollbar.classList.remove("grabbing");
    this.scrollarea.removeEventListener("mousemove", this);
    this.scrollarea.removeEventListener("mouseup", this);
    this.scrollarea.removeEventListener("mouseleave", this);
    
    this.grabbedElement = null;
  },
  move(event) {
    // console.log("move");
    // console.log(event);

    // limits
    const maxWidth = this.scrollarea.clientWidth - this.scrollbar.offsetLeft + this.scrollarea.offsetLeft;
    const minWidth = 16 * 3;
    const maxX = this.scrollarea.clientWidth - this.scrollbar.clientWidth;

    // Find drag point relative to scrollarea
    this.dragX = event.clientX - this.scrollarea.offsetLeft;

    // console.log(`Moved from ${this.startX} to ${this.dragX}`);

    if (this.grabbedElement === "scrollbar") {
      // move entire scrollbar to the dragged position (with the controlPoint!)
      let newX = this.dragX - this.controlPoint; 

      // Prevent moving to far to the left
      if (newX < 0) {
        newX = 0;
      }

      // Prevent moving to far to the right
      if (newX > maxX  ) {
        newX = maxX;
      }
        
      this.scrollBarX = newX;
    } else if (this.grabbedElement === "end") {
      // move end by setting the width to match the new dragX position
      let newW = this.controlPoint + this.remainder + (this.dragX - this.startX);
      
      // Prevent moving to far to the right
      if (newW > maxWidth ) {
        newW = maxWidth;
      }
      // Prevent moving to far to the left
      if (newW < minWidth) {
        newW = minWidth;
      }

      this.scrollBarW = newW;
    } else if (this.grabbedElement === "start") {
      // move start first by setting the newX to the dragged position
      let newX = this.dragX - this.controlPoint; 

      if (newX < 0) {
        newX = 0;
      }
      // Only recalculate if scrollbar has moved - and isn't dragged around 0
      if (newX !== 0 || this.scrollBarX !== 0) {
        // Then calculate the new width, to avoid moving the end-point
        let newW = this.controlPoint + this.remainder - (this.dragX - this.startX);

        // Prevent moving to far to the left
        if (newW + newX > this.scrollarea.clientWidth) {
          newW = this.scrollarea.clientWidth - newX;
        }
        // Prevent moving to far to the right
        if (newW < minWidth) {
          // Do NOT modify scrollbarX or W if the scrollbar has been moved to be to small 
          newW = this.scrollBarW;
          newX = this.scrollBarX;
        }
        this.scrollBarW = newW;
      }      
      
      this.scrollBarX = newX;
    }

    this.updateScrollBar();

  },
  updateScrollBar() {
    this.scrollbar.style.left = this.scrollBarX + "px";
    this.scrollbar.style.width = this.scrollBarW + "px";
  }

}