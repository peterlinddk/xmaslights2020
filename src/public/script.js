"use strict";

window.addEventListener("DOMContentLoaded", start);

let sequence = null;

async function start() {
  console.log("Start");
  sequence = await loadSequence();
  buildSequence();
  loaded();
}

async function loadSequence() {
  const resp = await fetch("sequence.json");
  const data = await resp.json();

  // create new objects for everything
  const objseq = new Sequence();
  data.tracks.forEach((track) => {
    objseq.addTrack(track);
  });

  return objseq;
}

function exportSequence() {
  const json = JSON.stringify(sequence.export());

  console.log("Export: " + json);
  // TODO: Send json to server, using fetch
  fetch("/", {
    method: "post",
    body: json,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    }
  })
    .then(res => res.json())
    .then(data => {
      console.log("Received data:");
      console.log(data);
  })

}

function buildSequence() {
  console.log("Build sequence");
  console.log(sequence);

  const tracks = document.querySelector("#tracks");
  // NOTE: Tracks isn't cleared - maybe that should be an option for loading other sequences
  const controls = document.querySelector("#tracks #controls");

  /*
    // A Track looks like this: (two divs, one for info, another for the timeline with dynamically created spans)
    <div id="track1_id">NAME</div>
    <div id="track1_timeline" class="timeline">
      <span data-start-time="0:00" data-end-time="3:00" data-value="on"></span>
      <span data-start-time="4:00" data-end-time="5:00" data-value="on"></span>
      <span data-start-time="5:30" data-end-time="5:45" data-value="on"></span>
    </div>
  */
  sequence.tracks.forEach((track) => {
    const infodiv = document.createElement("div");
    infodiv.id = `track${track.index}_id`;
    infodiv.textContent = track.name;

    tracks.insertBefore(infodiv, controls);

    const timelinediv = document.createElement("div");
    timelinediv.id = `track${track.index}_timeline`;
    timelinediv.classList.add("timeline");
    timelinediv.dataset.uuid = track.timeline.uuid;

    track.timeline.element = timelinediv;

    // create timeline and spans
    track.timeline.timespans.forEach((timeSpan) => {
      const span = timeSpan.createElement();
      timelinediv.append(span);
    });
    tracks.insertBefore(timelinediv, controls);
  });
}

function loaded() {
  console.log("Loaded");
  scroller.init();
  buildSVG();
  positionSpans();
  window.addEventListener("resize", resize);

  // add editor-feature to spans
  document.querySelectorAll(".timeline span").forEach((span) => span.addEventListener("mousedown", timespanEditor));
  document.querySelectorAll(".timeline span").forEach((span) => span.addEventListener("mouseenter", showTimeSpanInfo));

  document.querySelectorAll(".timeline").forEach((timeline) => timeline.addEventListener("click", createTimeSpan));

  // add other button actions (none implemented at the moment)
  document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", performAction));
}

function resize() {
  console.log("resize");
  scroller.resize();
  redraw();
}

function redraw() {
  buildSVG();
  positionSpans();
}

let zoomFactor = 1;

function buildSVG() {
  const svg = document.querySelector("#timecodes svg");

  const width = svg.clientWidth;
  // one hour is width/24 - one minute is width/1440
  const hourWidth = (width / 24) * zoomFactor;
  const minuteWidth = hourWidth / 60;

  // set viewBox
  svg.setAttribute("viewBox", `${width * scroller.getOffset() * zoomFactor} 0 ${width} 20`);

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
      text.setAttribute("x", h * hourWidth);
      text.setAttribute("y", 20);
      text.textContent = `${h.toString().padStart(2, " ")}:00`;
      ruler.append(text);
    }

    // add half-hour-line
    addLine(h * hourWidth + hourWidth / 2, 6);
    // add quarter-line 1
    addLine(h * hourWidth + hourWidth / 4, 3);
    // add quarter-line 2
    addLine(h * hourWidth + hourWidth / 4 + hourWidth / 2, 3);
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
  sequence.tracks.forEach((track) => {
    const timeline = track.timeline;
    timeline.timespans.forEach((timeSpan) => timeSpan.position());
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

  console.log(`Do action: ${action}`);
  switch (action) {
    case "export":
      exportSequence();
      break;
    case "zoom_in":
      // zoomIn();
      break;
    case "zoom_out":
      // zoomOut();
      break;
  }
}

function setZoom(zoom) {
  if (zoom < 1) {
    zoom = 1;
  }
  zoomFactor = zoom;
  redraw();
}

/* scroller */

const scroller = {
  init() {
    this.scrollbar = document.querySelector("#scrollbar");
    this.scrollarea = document.querySelector("#scroller");

    this.scrollWidth = this.scrollarea.clientWidth;
    this.scrollBarX = 0;
    this.scrollBarW = this.scrollWidth;

    this.updateScrollBar();

    // add eventlisteners - only mousedown for starters
    this.scrollbar.addEventListener("mousedown", this);
  },
  resize() {
    // called when the screen resizes - and the scrollarea has a new size!
    const o_zoom = this.getZoomFactor();
    const o_offset = this.getOffset();

    // set new scrollWidth
    this.scrollWidth = this.scrollarea.clientWidth;

    // Re-calculate the Bar width and X values with the new scrollWidth
    this.scrollBarW = this.scrollWidth / o_zoom;
    this.scrollBarX = this.scrollWidth * o_offset;
    this.updateScrollBar();
  },
  getZoomFactor() {
    return this.scrollWidth / this.scrollBarW;
  },
  getOffset() {
    return this.scrollBarX / this.scrollWidth;
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
    const maxWidth = this.scrollWidth - this.scrollbar.offsetLeft;
    const minWidth = 16 * 3;
    const maxX = this.scrollWidth - this.scrollbar.clientWidth;

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
      if (newX > maxX) {
        newX = maxX;
      }

      this.scrollBarX = newX;
    } else if (this.grabbedElement === "end") {
      // move end by setting the width to match the new dragX position
      let newW = this.controlPoint + this.remainder + (this.dragX - this.startX);

      // Prevent moving to far to the right
      if (newW > maxWidth) {
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
        if (newW + newX > this.scrollWidth) {
          newW = this.scrollWidth - newX;
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

    setZoom(this.getZoomFactor());
  },
  updateScrollBar() {
    this.scrollbar.style.left = this.scrollBarX + "px";
    this.scrollbar.style.width = this.scrollBarW + "px";
  },
};

function getTimeSpanFromUuid(uuid) {
  let timeSpan = null;
  for (let i = 0; i < sequence.tracks.length; i++) {
    timeSpan = sequence.tracks[i].timeline.timespans.find((span) => span.uuid === uuid);
    if (timeSpan) {
      break;
    }
  }
  return timeSpan;
}

/* timeline edit */
function showTimeSpanInfo(event) {
  // find timespan object
  const timeSpan = getTimeSpanFromUuid(event.target.dataset.uuid);
  const timeLineElement = timeSpan.element.parentElement;  
  // find popup
  const popup = document.querySelector("#popup");

  // position popup
  let left = event.clientX - popup.getBoundingClientRect().width / 2

  // if positioned too far to the right - move it in
  if (left > timeLineElement.clientWidth + timeLineElement.offsetLeft - 70) { 
    left = timeLineElement.clientWidth + timeLineElement.offsetLeft - 70;
    // 70 pixels is the hardcoded approximate width of the popup - it has display none, and thus 0 width until displayed!
  }

  popup.style.left = left + "px";
  popup.style.top = timeSpan.element.parentElement.offsetTop - 20 + "px";

  // Write info in popup
  updatePopup(timeSpan);

  timeSpan.element.addEventListener("mouseleave", hideTimeSpanInfo);

  function hideTimeSpanInfo(event) {
    popup.classList.remove("show");
    timeSpan.element.removeEventListener("mouseleave", hideTimeSpanInfo);
  }

  // show popup
  popup.classList.add("show");
}

function updatePopup(timeSpan) {
  const popup = document.querySelector("#popup");
  popup.querySelector("#start-time").textContent = timeSpan.start;
  popup.querySelector("#end-time").textContent = timeSpan.end;
}

function createTimeSpan(event) {
  // Only create a new timespan if clicked on empty part of the timeline
  if (event.target.classList.contains("timeline")) {
    console.log("Create new TimeSpan here");
    console.log(event);

    // Find the timeline object
    const timeline = sequence.tracks.find(track => track.timeline.uuid === event.target.dataset.uuid).timeline;
    
    // Find the position clicked
    const clickPoint = event.clientX - timeline.element.offsetLeft + timeline.offset;
    
    // Find the nearest time in minutes - TODO: snap to closest (earlier) 5, 15, 30 or 0 - if not conflicting with existing timespan
    const minutes = clickPoint / timeline.minuteWidth;
    const clickTime = new TimeCode("0:00");
    clickTime.addMinutes(minutes);

    console.log(`Click på ${clickPoint} @ ${clickTime}`);
    // Create new TimeSpan object with starttime at this, and endtime 15 minutes later (always a width of 15 minutes for new timespans)
    const timeSpan = new TimeSpan({ start: clickTime.timecode, end: clickTime.addMinutes(15).timecode }, timeline);
    
    // Make sure this timespan doesn't overlap existing timespans
    if (timeline.overlaps(timeSpan)) {
      console.warn("Overlap! Don't create");
      // TODO: Inform the user in a better manner!
    } else {
      // Add the new object to the timeline (it should insert it correctly sorted)
      timeline.add(timeSpan);
      
      // Create and draw/update a HTML object for the TimeSpan - remember to add an eventlistener as well
      const span = timeSpan.createElement();
      timeline.element.append(span);
      span.addEventListener("mousedown", timespanEditor);
      span.addEventListener("mouseenter", showTimeSpanInfo);
      timeSpan.position();
      // That should be it
    }
  }
}


// TODO: Make feature to cut timespan into two, and to join two timespans into one
const timespanEditor = {
  select(event) {
    const element = event.currentTarget;

    // find the selected timespan
    this.span = getTimeSpanFromUuid(element.dataset.uuid);

    // mark the span as selected
    this.span.element.classList.add("selected");

    // Add eventlisteners to the timeline (so we can move outside this span)
    this.span.timeline.element.addEventListener("mousemove", this);
    this.span.timeline.element.addEventListener("mouseup", this);
    this.span.timeline.element.addEventListener("mouseleave", this);

    // Figure out if it was selected for moving, expanding left or right
    // console.log(event);
    const controlPoint = event.clientX - this.span.element.getBoundingClientRect().left;

    if (controlPoint < 8) {
      // hardcoded value to grab the beginning
      this.selectionType = "start";
      this.span.element.classList.add("resize");
      this.span.element.classList.add("start");
    } else if (controlPoint > this.span.element.clientWidth - 8) {
      this.selectionType = "end";
      this.span.element.classList.add("resize");
      this.span.element.classList.add("end");
    } else {
      this.selectionType = "move";
      this.span.element.classList.add("move");
    }

    this.startX = event.clientX;

    this.initialStart = new TimeCode(this.span.start);
    this.initialEnd = new TimeCode(this.span.end);

    console.log(`Selected span `);
    console.log(this.span);

    // console.log(`controlPoint @ ${controlPoint} = ${this.selectionType}`);

  },
  handleEvent(event) {
    // console.log(`Event type: ${event.type}`);
    if (event.type === "mouseup" || event.type === "mouseleave") {
      this.release(event);
    }
    if (event.type === "mousedown") {
      this.select(event);
    }
    if (event.type === "mousemove") {
      this.move(event);
    }
  },
  release(event) {
    console.log("Release");
    this.span.element.classList.remove("selected");
    this.span.element.classList.remove("resize");
    this.span.element.classList.remove("end");
    this.span.element.classList.remove("start");
    this.span.element.classList.remove("move");
    this.span.timeline.element.removeEventListener("mousemove", this);
    this.span.timeline.element.removeEventListener("mouseup", this);
    this.span.timeline.element.removeEventListener("mouseleave", this);

    // If the timespan was changed to start >= end, then delete the timespan!
    if (this.span.start.compareWith(this.span.end) >= 0) {
      this.span.delete();
      document.querySelector("#popup").classList.remove("show");
    }

    // forget about the selected element
    this.span = null;
  },
  move(event) {
    console.log("move");

    // find relative move-distance
    const distance = event.clientX - this.startX;

    // convert moved distance into minutes
    const minutes = distance / this.span.timeline.minuteWidth;
    
    // TODO: Snap minutes to 0, 5, 15, 30

    // new TimeCodes has to be created from the initial start time on every edit, to avoid accumulating changes
    const newStartTime = new TimeCode(this.initialStart);
    const newEndTime = new TimeCode(this.initialEnd);

    // Handle the different selectionTypes - start, end and move
    if (this.selectionType === "start") {
      newStartTime.addMinutes(minutes);
    } else if (this.selectionType === "end") {
      newEndTime.addMinutes(minutes);
    } else if (this.selectionType === "move") {
      newStartTime.addMinutes(minutes);
      newEndTime.addMinutes(minutes);
    }

    console.log(`New start time: ${newStartTime} - new end time: ${newEndTime}`);

    let acceptChange = true;

    // Limit start and end times to within the 0-24
    if (newStartTime.isBefore(new TimeCode("0:00")) || newEndTime.isAfter(new TimeCode("24:00"))) {
      acceptChange = false;
    }

    // Prevent overlapping of previous or next
    const previous = this.span.timeline.previous(this.span);
    const next = this.span.timeline.next(this.span);
    if (newStartTime.isBefore(previous?.end) || newEndTime.isAfter(next?.start)) {
      acceptChange = false;
    }

    // If start and end match or swap so the time is negative, it probably means that the user wants to delete!
    if (newStartTime.compareWith(newEndTime) >= 0) {
      // Only add the delete info - don't delete before the release
      document.querySelector("#popup").classList.add("delete");
    } else {
      document.querySelector("#popup").classList.remove("delete");
    }

    // TODO: Combine timespans directly connected!

    if (acceptChange) {
      this.span.start.timecode = newStartTime.timecode;
      this.span.end.timecode = newEndTime.timecode;
      this.span.position();
      updatePopup(this.span);
    }
  },
};


class Sequence {
  constructor() {
    this.tracks = [];
  }

  export() {
    return {
      tracks: this.tracks.map(track => track.export())
    }
  }

  addTrack(track) {
    const objtrack = new Track(track);
    objtrack.index = this.tracks.length;
    this.tracks.push(objtrack);
  }
}

class Track {
  constructor(track) {
    this.name = track.name;
    this.port = track.port;
    this.on = track.on;
    this.timeline = new TimeLine(track.timeline);
  }

  export() {
    return {
      name: this.name,
      port: this.port,
      on: this.on,
      timeline: this.timeline.export()
    }
  }
}

/* The timeline is the entire timeline for a track - connected to the visual timeline, and with all the timespans as children */
class TimeLine {
  constructor(timeline) {
    this.timespans = [];

    // The timeline argument is simply an array of timespans
    this.timespans = timeline.map((span) => new TimeSpan(span, this));

    // Sort the list of timespans!
    this.timespans.sort((a, b) => a.start.compareWith(b.start));
    
    // Make sure no two timespans are overlapping
    this.timespans.forEach((timeSpan, index) => {
      const previous = this.timespans[index - 1];
      if (timeSpan.start.isBefore(previous?.end)) {
        console.warn(`Error in JSON - timespan: ${timeSpan} overlaps ${previous}`);
        // Fix it by setting this.start = previous.end
        timeSpan.start.timecode = previous.end.timecode;
      }
    });

    this.uuid = uuidv4();
  }

  export() {
    return this.timespans.map(timespan => timespan.export() );
  }

  // returns the timespan before this one - or undefined if this is the first
  previous(timeSpan) {
    const index = this.timespans.indexOf(timeSpan);
    return this.timespans[index - 1];
  }

  // returns the timespan after this one - or undefined if this is the last
  next(timeSpan) {
    const index = this.timespans.indexOf(timeSpan);
    return this.timespans[index + 1];
  }

  add(timeSpan) {
    // Find the index just before this timeSpan
    let previous = undefined;
    let i = 0;
    for (i = 0; i < this.timespans.length; i++) {
      // If the ith timespan is after this one, then i-1 would be before this one!
      if (this.timespans[i].start.isAfter(timeSpan.start)) {
        previous = this.timespans[i - 1];
        break;
      }
    }

    this.timespans.splice(i, 0, timeSpan);
  }

  // returns true if the timeSpan argument overlaps any other timespans on the timeline
  overlaps(timeSpan) {
    let overlap = false;
    for (let i = 0; i < this.timespans.length; i++) {
      const checking = this.timespans[i];
      if (timeSpan.start.isBefore(checking.end) && timeSpan.end.isAfter(checking.start)) {
        overlap = true;
        break;
      }
    }
    return overlap;
  }

  get width() {
    return this.element.clientWidth * zoomFactor;
  }

  get offset() {
    return this.width * scroller.getOffset();
  }

  get hourWidth() {
    return this.width / 24;
  }

  get minuteWidth() {
    return this.hourWidth / 60;
  }
}

class TimeSpan {
  constructor(span, timeline) {
    this.timeline = timeline; // know the parent timeline
    this.start = new TimeCode(span.start);
    this.end = new TimeCode(span.end);
    this.uuid = uuidv4();
  }

  export() {
    return {
      start: this.start.timecode,
      end: this.end.timecode
    }
  }

  position() {
    const pixelStart = this.start.hour * this.timeline.hourWidth + this.start.minute * this.timeline.minuteWidth;
    this.element.style.left = pixelStart - this.timeline.offset + "px";
    const pixelWidth = this.end.hour * this.timeline.hourWidth + this.end.minute * this.timeline.minuteWidth - pixelStart;
    this.element.style.width = pixelWidth + "px";
  }

  toString() {
    return `<span start="${this.start}" end="${this.end}" uuid="${this.uuid}">`;
  }

  createElement() {
    const span = document.createElement("span");
    span.dataset.startTime = this.start.timecode;
    span.dataset.endTime = this.end.timecode;
    span.dataset.value = "on";
    span.dataset.uuid = this.uuid;

    this.element = span;
    return span;
  }

  // removes this timespan from the timeline, and from the DOM
  delete() {
    this.element.remove();
    this.timeline.timespans.splice(this.timeline.timespans.indexOf(this), 1);
  }

}

// Unique ID - from: https://stackoverflow.com/questions/105034/how-to-create-a-guid-uuid
function uuidv4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    var r = (Math.random() * 16) | 0,
      v = c == "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

class TimeCode {
  constructor(str) {
    // if argument is another TimeCode-object, call clone instead
    if (str instanceof TimeCode) {
      this.clone(str);
    } else {
      this.timecode = str;
    }
    return this;
  }

  clone(obj) {
    this.hour = obj.hour;
    this.minute = obj.minute;
    return this;
  }

  toString() {
    return this.timecode;
  }

  /* return 
    -1 if this is before other
    0 if they are the same
    +1 if this is after other
  */
  compareWith(otherTimeCode) {
    const hourDiff = this.hour - otherTimeCode.hour;
    const minuteDiff = this.minute - otherTimeCode.minute;

    if (hourDiff === 0) {
      return minuteDiff;
    } else {
      return hourDiff;
    }
  }

  // convenience method for compare 
  isBefore(otherTimeCode) {
    return otherTimeCode && this.compareWith(otherTimeCode) < 0;
  }

  // convenience method for compare 
  isAfter(otherTimeCode) {
    return otherTimeCode && this.compareWith(otherTimeCode) > 0;
  }

  get timecode() {
    return `${this.hour}:${this.minute.toString().padStart(2, "0")}`;
  }

  set timecode(str) {
    const [hour, minute] = str.split(":").map((val) => Number(val));
    this.hour = hour;
    this.minute = minute;
  }

  get decimalTime() {
    return this.hour + this.minute / 60;
  }

  set decimalTime(dtime) {
    const hour = Math.floor(dtime);
    const minute = Math.round((dtime - hour) * 60);
    this.hour = hour;
    this.minute = minute;
  }

  addMinutes(minutes) {
    this.decimalTime = this.decimalTime + minutes / 60;
    return this; // Returning this allows for chaining of calls
  }
}
