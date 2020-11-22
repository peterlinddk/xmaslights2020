"use strict";

window.addEventListener("DOMContentLoaded", loaded);

function loaded() {
  console.log("Start");
  positionSpans();
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
      console.log(span);
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