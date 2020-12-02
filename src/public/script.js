import { Sequence, Track, TimeLine, TimeSpan, TimeCode } from './objectmodel.js';

"use strict";

window.addEventListener("DOMContentLoaded", start);

let sequence = null;
let socket = io();

// TODO: Notify UI about lost socket-connection!

async function start() {
  console.log("Start");
  sequence = await loadSequence();
  buildSequence();
  scroller.init();
  buildSVG();
  positionSpans();
  setupUI();
}

async function loadSequence() {
  const resp = await fetch("sequence.json");
  const data = await resp.json();

  // create new objects for everything
  const objseq = new Sequence(data);
  return objseq;
}

function setupUI() {
  window.addEventListener("resize", resize);

  // add user-cursor following mouse at all times
  document.querySelector("#tracks").addEventListener("mousemove", positionUserCursor);

  // add click on timecodes to set play-time
  document.querySelector("#timecodes").addEventListener("click", setPlayerTimeToClick);

  // add other button actions
  document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", performAction));

  // receive socket updates
  socket.on("play-state", receivePlayerState);
  socket.on("play-time", receivePlayerTime);
  socket.on("play-change", updateStateChange);
  socket.on("play-mode", updatePlayerMode);

  setupTimeLineEditor();
}

function setupTimeLineEditor() {
  // add editor-feature to spans
  document.querySelectorAll(".timeline span").forEach((span) => span.addEventListener("mousedown", timespanEditor));
  document.querySelectorAll(".timeline span").forEach((span) => span.addEventListener("mouseenter", showTimeSpanInfo));

  document.querySelectorAll(".timeline").forEach((timeline) => timeline.addEventListener("click", createTimeSpan));
}

async function reloadSequence() {
  sequence = await loadSequence();
  buildSequence();
  buildSVG();
  positionSpans();
  setupTimeLineEditor();
  markAsEdited(false);
}

function exportSequence() {
  const json = JSON.stringify(sequence.export());

  console.log("Export: " + json);
  // Send json to server, using fetch
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
      markAsEdited(false);
    })
    .catch(error => {
      console.error("Could not store sequence on server");
      console.error(error);
    })

}

/* Player controls */

let currentPlayerTime = new TimeCode("0:00");
let playerIsAdjustable = false;

function setPlayerMode(mode, informserver=true) {
  // remove active button
  document.querySelector("#player button.realtime").classList.remove("active");
  document.querySelector("#player button.adjusted").classList.remove("active");

  // mode can be either realtime or adjustable
  playerIsAdjustable = mode === "adjusted";
  // enable/disable player controls
  document.querySelectorAll(".speedadjust").forEach(secret => secret.disabled = !playerIsAdjustable);
  
  // set active button
  document.querySelector(`#player button.${mode}`).classList.add("active");

  if( informserver ) {
    // Inform server of player mode!
    socket.emit("play-mode", mode);
  }
  
}

function updatePlayerMode(mode) {
  setPlayerMode(mode, false);
}

function playSequence() {
  socket.emit("play-state", "play");
}

function pauseSequence() {
  socket.emit("play-state", "pause");
}

function receivePlayerState(data) {
  console.log("Received play-state: " + data);
  const playButton = document.querySelector("[data-action='play']");
  const playCursor = document.querySelector("#playcursor");
  playButton.dataset.state = data;
  if (data === "playing") {
    playCursor.classList.add("playing");
  } else {
    playCursor.classList.remove("playing");
  }
}

function setPlayerTimeToClick(event) {
  // ignore these clicks, if player isn't adjustable
  if (playerIsAdjustable) {
    const timeline = sequence.tracks[0].timeline;
    const clickPoint = event.clientX - timeline.element.getBoundingClientRect().left;
    const minutes = (clickPoint + timeline.offset) / timeline.minuteWidth;
    
    // Find the nearest time in minutes
    const clickTime = new TimeCode("0:00");
    clickTime.decimalTime = minutes / 60;
    
    setPlayerTime(clickTime);
  }
}

function setPlayerTime(time) {
  socket.emit("play-time", time.timecode);
}

function receivePlayerTime(data) {
  // console.log("Received player-time: " + data);
  currentPlayerTime.timecode = data;
  positionPlayCursor();
}

function positionPlayCursor() {
  const cursor = document.querySelector("#playcursor");

  const hour = currentPlayerTime.hour;
  const minute = currentPlayerTime.minute;

  // Get first timeline in sequence
  const timeline = sequence.tracks[0].timeline;
  const pixelStart = hour * timeline.hourWidth + minute * timeline.minuteWidth;
  cursor.style.transform = `translate(${pixelStart - timeline.offset}px, 0)`;
}

function positionUserCursor( event ) {
  const cursor = document.querySelector("#usercursor");
  const cursorarea = document.querySelector("#cursors").getBoundingClientRect();

  // Find the position for the mouse
  const mousePosition = event.clientX - cursorarea.left;
  if (0 <= mousePosition && mousePosition <= cursorarea.width ) {
    // only update cursor when inside the cursor-area
    const cursorPos = mousePosition;

    // calculate timecode at position!
    // needs a timeline - just take the first one
    const timeline = sequence.tracks[0].timeline;
    const minutes = (cursorPos + timeline.offset) / timeline.minuteWidth;
    // convert minutes into timecode
    const timecode = new TimeCode("0:00");
    timecode.decimalTime = minutes / 60;

    cursor.style.setProperty("--timecode", `"${timecode}"`);
    cursor.style.transform = `translate(${cursorPos-1}px, 0)`;
  } 
}

function buildSequence() {
  console.log("Build sequence");
  console.log(sequence);

  const tracks = document.querySelector("#tracks");
  // remove existing tracks and timelines
  tracks.querySelectorAll(".track, .timeline").forEach(existing => existing.remove());

  const player = document.querySelector("#tracks #player");

  /*
    // A Track looks like this: (two divs, one for info, another for the timeline with dynamically created spans)
    <div id="track1_id" class="track"><span class="led"></span>NAME</div>
    <div id="track1_timeline" class="timeline">
      <span data-start-time="0:00" data-end-time="3:00" data-value="on"></span>
      <span data-start-time="4:00" data-end-time="5:00" data-value="on"></span>
      <span data-start-time="5:30" data-end-time="5:45" data-value="on"></span>
    </div>
  */
  sequence.tracks.forEach((track) => {

    // Let the track's timeline know of the scroller
    track.timeline.setScroller(scroller);

    const infodiv = document.createElement("div");
    infodiv.id = `track${track.index}_id`;
    infodiv.classList.add("track");
    infodiv.innerHTML = `<span class="led"></span>${track.name}`;

    tracks.insertBefore(infodiv, player);

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
    tracks.insertBefore(timelinediv, player);
  });
}



function updateStateChange({track,state}) {
  const LED = document.querySelector(`#track${track}_id .led`);

  LED.classList.remove("on");
  LED.classList.remove("off");
  
  LED.classList.add(state);
}

function resize() {
  console.log("resize");
  scroller.resize();
  redraw();
}

function redraw() {
  buildSVG();
  positionSpans();
  positionPlayCursor();
}

function buildSVG() {
  const svg = document.querySelector("#timecodes svg");

  const width = svg.clientWidth;
  // one hour is width/24 - one minute is width/1440
  const hourWidth = (width / 24) * scroller.getZoomFactor();
  const minuteWidth = hourWidth / 60;

  // set viewBox
  svg.setAttribute("viewBox", `${width * scroller.getOffset() * scroller.getZoomFactor()} 0 ${width} 20`);

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
  
  // Find the actual action - the target might be a child of the element with the action
  let action = target.dataset.action;
  while (!action) {
    target = target.parentElement;
    action = target.dataset.action;
  }

  // console.log(`Do action: ${action}`);
  switch (action) {
    case "export":
      exportSequence();
      break;
    case "reload":
      reloadSequence();
      break;
    case "realtime":
      // set player to be realtime - prevent adjustments
      setPlayerMode("realtime");
      break;
    case "adjusted":
      // set player to be adjustable - enable adjustments
      setPlayerMode("adjusted");
      break;
    case "play":
      if (target.dataset.state === "paused") {
        playSequence();
      } else {
        pauseSequence();
      }
      break;
    default:
      console.warn(`Unknown action: ${action}`);
  }
}

/* editor-state */
let sequenceAltered = false;

function markAsEdited(edited) {
  // ignore 'changes' to same state
  if (edited !== sequenceAltered) {
    sequenceAltered = edited;
    if (sequenceAltered) {
      document.querySelector("#exportmessage").classList.add("show");
    } else {
      document.querySelector("#exportmessage").classList.remove("show");
    }
  }
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

    redraw() // updates SVG and tracks
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
    // only hide if the class isn't delete! - otherwise keep it until the user releases the button
    if (!popup.classList.contains("delete")) {
      popup.classList.remove("show");
      timeSpan.element.removeEventListener("mouseleave", hideTimeSpanInfo);
    }
  }

  // show popup
  popup.classList.add("show");
}

function updatePopup(timeSpan) {
  const popup = document.querySelector("#popup");
  popup.querySelector("#start-time").textContent = timeSpan.start;
  popup.querySelector("#end-time").textContent = timeSpan.end;
}

let preventCreate = false;

function createTimeSpan(event) {
  // Only create a new timespan if clicked on empty part of the timeline
  if (event.target.classList.contains("timeline") && !preventCreate) {
    // console.log("Create new TimeSpan here");
    // console.log(event);

    // Find the timeline object
    const timeline = sequence.tracks.find(track => track.timeline.uuid === event.target.dataset.uuid).timeline;
    
    // Find the position clicked
    const clickPoint = event.clientX - timeline.element.getBoundingClientRect().left;
    const minutes = (clickPoint + timeline.offset) / timeline.minuteWidth;
    
    // Find the nearest time in minutes - TODO: snap to closest (earlier) 5, 15, 30 or 0 - if not conflicting with existing timespan
    const clickTime = new TimeCode("0:00");
    clickTime.addMinutes(minutes);

    // Create new TimeSpan object with starttime at this, and endtime 15 minutes later (always a width of 15 minutes for new timespans)
    const timeSpan = new TimeSpan({ start: clickTime.timecode, end: clickTime.addMinutes(15).timecode }, timeline);
    // mark this new timeSpan as dynamically created
    timeSpan.userCreated = true;
    
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
      markAsEdited(true);
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

    // console.log(`Selected span `);
    // console.log(this.span);

    // console.log(`controlPoint @ ${controlPoint} = ${this.selectionType}`);
    preventCreate = true;
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
    // console.log("Release");
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
      document.querySelector("#popup").classList.remove("delete");
    }

    // If the timespan was modified from the original (json-read timespan), then inform the user that the sequence is edited
    markAsEdited(sequence.isModified());

    // forget about the selected element
    this.span = null;

    // wait 400 ms before allowing the user to create a new timespan
    // this prevents "slipping" on the mouse-button when dragging or deleting
    setTimeout(function () {
      preventCreate = false;
    }, 400);
  },
  move(event) {
    // console.log("move");

    // find relative move-distance
    const pixels = event.clientX - this.startX;

    // convert moved distance into minutes
    let moveDistance = pixels / this.span.timeline.minuteWidth;
    // only update lastMoveDistance every 400ms - so if the user moves slowly, the adjustment is more precise
    const now = performance.now();
    if (now - 400 > this.lastMove || !this.lastMove) {
      this.lastMoveDistance = moveDistance;
      this.lastMove = now;      
    }
    
    // Prevent overlapping of previous or next
    const previous = this.span.timeline.previous(this.span)?.end ?? new TimeCode("0:00");
    const next = this.span.timeline.next(this.span)?.start ?? new TimeCode("24:00");

    const distanceToPrevious = (previous.decimalTime - this.initialStart.decimalTime)*60;
    const distanceToNext = (next.decimalTime - this.initialEnd.decimalTime)*60;

    // console.log(`Try to move ${moveDistance} minutes (adjustment:${adjustment})`);
    // console.log(`Distance to previous: ${distanceToPrevious} minutes`);
    // console.log(`Distance to next: ${distanceToNext} minutes`);

    // Find offset (the initial value of the timespan (start or end) that is being moved)
    let offset = this.initialStart.decimalTime * 60;
    if (this.selectionType === "end") {
      offset = this.initialEnd.decimalTime * 60;
    }
    
    let moveTo = offset + moveDistance;

    const adjustment = Math.abs(moveDistance - (this.lastMoveDistance ?? 0));
    // The snap is dependent on how far the user moves
    // - adjusting more than 10 minutes, snap to increments of 15 minutes
    // - adjusting more than 3 minutes, snap to increments of 5 minutes
    // - anything less, doesn't really snap, but adjusts easier to increments of 5, than next to.
    if (adjustment > 10) {
      // Snap to fifteen!
      moveTo = moveTo - moveTo % 15 + (moveTo % 15 > 7.5 ? 15 : 0);
    } else if (adjustment > 3) {
      // Snap to five!
      moveTo = moveTo - moveTo % 5 + (moveTo % 5 > 2.5 ? 5 : 0);
    } else {
      // fine adjustment, only snap on < 1 and > 4
      // - if moveTo is closer to 0 or 5 than 4 or 6, -1 or 1, snap to five (or 0)
      if (moveTo % 5 < 1 || moveTo % 5 > 4) {
        // snap to five!
        moveTo = moveTo - moveTo % 5 + (moveTo % 5 > 2.5 ? 5 : 0);
      }
    }
    moveDistance = moveTo - offset;
    
    // clamp/limit minutes to min distancetoPrevious or max distanceToNext - depending on which part of the timespan is edited
    if ( this.selectionType !== "end" && moveDistance < distanceToPrevious) {
      moveDistance = distanceToPrevious;
    }
    if ( this.selectionType !== "start" && moveDistance > distanceToNext) {
      moveDistance = distanceToNext;
    }
    
    // new TimeCodes has to be created from the initial start time on every edit, to avoid accumulating changes
    const newStartTime = new TimeCode(this.initialStart);
    const newEndTime = new TimeCode(this.initialEnd);

    // Handle the different selectionTypes - start, end and move
    if (this.selectionType === "start") {
      newStartTime.addMinutes(moveDistance);
    } else if (this.selectionType === "end") {
      newEndTime.addMinutes(moveDistance);
    } else if (this.selectionType === "move") {
      newStartTime.addMinutes(moveDistance);
      newEndTime.addMinutes(moveDistance);
    }

    // console.log(`New start time: ${newStartTime} - new end time: ${newEndTime}`);

    // If start and end match or swap so the time is negative, it probably means that the user wants to delete!
    if (newStartTime.compareWith(newEndTime) >= 0) {
      // Only add the delete info - don't delete before the release
      document.querySelector("#popup").classList.add("delete");
    } else {
      document.querySelector("#popup").classList.remove("delete");
    }

    // TODO: Combine timespans directly connected!

    this.span.start.timecode = newStartTime.timecode;
    this.span.end.timecode = newEndTime.timecode;
    this.span.position();
    updatePopup(this.span);

  },
};


