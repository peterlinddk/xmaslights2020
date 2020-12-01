"use strict";
import path from "path";
import fs from "fs";
import { Sequence, Track, TimeLine, TimeSpan, TimeCode } from "./public/objectmodel.js";
import onoff from "onoff";
export { Player };

const Gpio = onoff.Gpio;

// This is the player, intended to run on the server
// It runs continually, loads the sequence from sequence.json, and plays through it, using the date-time
class Player {
  constructor() {
    this.currentTime = new TimeCode("0:00");
    this.paused = true;
    this.queuePointer = 0;
    this.playerMode = "adjusted"; // TODO: Make it start with realtime, once that works!
  }

  setupGPIO() {
    if (Gpio) {
    // run through the tracks
      this.sequence.tracks.forEach(track => {
        track.gpio = new Gpio(track.port, 'out');
      });  
    }
  }

  releaseGPIO() {
    if (Gpio) {
      // run through the tracks
      this.sequence.tracks.forEach(track => {
        if (track.gpio) {
          track.gpio.unexport();
            
        }
      });  
    }
  }

  writeGPIO(gpio, value) {
    if (Gpio) {
      gpio.writeSync(value);
    }
  }

  readGPIO(gpio) {
    if (Gpio) {
      return gpio.readSync();
    } else {
      return undefined;
    }
  }

  loadSequence(callback) {
    const obj = this;
    fs.readFile(`${path.resolve()}/src/public/sequence.json`, function (err, data) {
      if (err) throw err;

      const json = JSON.parse(data);
      // console.log(json);

      obj.sequence = new Sequence(json);
      obj.buildEventQueue();

      obj.setupGPIO();

      // TODO: Write tracks and sequence to console - as ascii-graphics

      if (callback) {
        callback();
      }
    });
  }

  buildEventQueue() {
    this.queue = [];
    // Add every single timespan to the queue with an object like this:
    // { time: TimeCode, Timespan }
    // but add it twice, once for time:start, and another for time:end
    this.sequence.tracks.forEach((track) => {
      track.timeline.timespans.forEach((timespan) => {
        this.queue.push({ time: timespan.start, timespan });
        this.queue.push({ time: timespan.end, timespan });
      });
    });

    // sort the queue by time, so they are sequential
    this.queue.sort((a, b) => a.time.compareWith(b.time));
  }

  nextInQueue() {
    // get the next element in the queue (without removing it from the queue)
    return this.queue[this.queuePointer];
  }

  moveQueue() {
    // Increment the queuePointer
    this.queuePointer++;
    // Do not make it circular! The queue
    if (this.queuePointer >= this.queue.length) {
      console.log("Queue ended!");
    }
  }

  resetQueue() {
    this.queuePointer = 0;
  }

  tick() {
    if (!this.paused) {
      process.stdout.cursorTo(0);
      process.stdout.write(`tick @ ${this.currentTime}  `);

      let next = this.nextInQueue();
      // console.log(`next @ ${next.time}`);

      let firstProcess = true;
      while (next && this.currentTime.compareWith(next.time) >= 0) {
        if (firstProcess) {
          console.log("");
          firstProcess = false;
        }
        // process next event
        this.processEvent(next);

        // move it out of the queue
        this.moveQueue();
        // and repeat
        next = this.nextInQueue();
      }

      // update the current time - and wait for the next tick ...
      const timeToNextTick = this.updateCurrentTime(); 
      this.timeout = setTimeout(this.tick.bind(this), timeToNextTick);
    }
  }

  processEvent(event) {
    const track = event.timespan.timeline.track;
    // if event.time is similar to event.start, then start the event - if similar to event.end, then end the event
    if (event.time.equals(event.timespan.start)) {
      // start the event
      console.log(`${event.time}: ${track.name} @ ${track.port} 'ON' (${track.on})`);
      this.setTrackToState(track, 'on');

    } else if (event.time.equals(event.timespan.end)) {
      // end the event
      console.log(`${event.time}: ${track.name} @ ${track.port} 'OFF' (${track.off})`);
      this.setTrackToState(track, 'off');
    } else {
      console.log("ERROR! time does not match timespan start or end!");
      console.log(event);
    }
  }

  setTrackToState(track, state) {
    // Set GPIO port to ON value
    this.writeGPIO( track.gpio, track[state] );

    // Inform UI about state
    if (this.statechangeListener) {
      this.statechangeListener(track, state);
    }
  }

  addEventListener(eventtype, callback) {
    // only "events" supported so far are timeupdate and statechange
    if (eventtype === "timeupdate") {
      this.timeupdateListener = callback;
    } else if (eventtype === "statechange") {
      this.statechangeListener = callback;
    } else if (eventtype === "play") {
      this.playListener = callback;
    } else if (eventtype === "pause") {
      this.pauseListener = callback;
    }
  }

  // Updates the currentTime, and returns the number of miliseconds to wait before the next tick
  updateCurrentTime() {
    let timeToNextTick = 200; // default wait-time is 200ms - TODO: let is be configurable from the UI! (max 60000)

    if (this.playerMode === "realtime") {
      // Find actual time 'now'
      const now = new Date();
      const nowTime = new TimeCode(now.getHours() + ":" + String(now.getMinutes()).padStart(2, '0'));
  
      if (nowTime.compareWith(this.currentTime) !== 0) {
        console.log("Times are different");
        
        // if there is more than 1 minute difference, set the currentTime directly (to avoid triggering previous events)
        if (nowTime.decimalTime - this.currentTime.decimalTime > 0.02) {
          // times are very different - skip in the queue
          this.setCurrentTime(nowTime.timecode);
        } else {
          // times aren't very different, use the queue
          this.currentTime.timecode = nowTime.timecode;
        }
      }

      // in realtime, wait half a minute before next tick
      timeToNextTick = 1000 * 30;

    } else {
      this.currentTime.addMinutes(1);
    }

    // TODO: Use speed-setting from client - or set the time if set to actual time
    // Speed-setting means that a number of ticks (of 100ms each) from 1 to 600 ? 600 is normal speed, but not exact time 

    if (this.currentTime.decimalTime > 24) {
      console.log("We have crossed midnight!");
      this.currentTime.timecode = "0:00";
      this.resetQueue();
    }

    // inform eventlistener of timeupdate (if there is one)
    if (this.timeupdateListener) {
      this.timeupdateListener(this.currentTime);
    }

    // if the current time is 24:00, wait very shortly before next tick
    if (this.currentTime.decimalTime >= 24) {
      timeToNextTick = 1;
    }
    return timeToNextTick;
  }

  /*
    1) TODO: Make it possible to control time from webpage, set current time, speedup, and set to "realtime"

    2) TODO: Make player use actual time

    3) TODO: Reload sequence if it has changed since last play!
        
  */
  
  setPlayerMode(mode) {
    // mode can either be adjusted or realtime
    if (mode === "realtime") {
      this.playerMode = mode;
      // update time, and start playing, if not already going
      this.updateCurrentTime();
      this.play();
    } else if (mode === "adjusted") {
      this.playerMode = mode;
      // don't do anything else
    } else {
      console.error("Unknown playermode: " + mode + " requested");
    }
  }

  // sets the current time to timecode - and removes everything in the queue before that time (ignoring the state of each track)
  setCurrentTime(time) {
    this.currentTime.timecode = time;
    // set queuePointer - by finding those events that are before this, and skipping them
    for (let i = 0; i < this.queue.length; i++) {
      // if event.time is after currentTime - this is where the queuePointer should point
      const event = this.queue[i];
      if (event.time.isAfter(this.currentTime)) {
        this.queuePointer = i-1;
        break;
      }
    }

    // Find events just before the queuePointer, and set the current state on all tracks to those values.

    // We can't go for each track, so keep "track" of all the tracks, with an array of booleans - false means we haven't adressed this track yet
    // go backwards through the queue, until all tracks are seen, or the queue isn't any longer
    // for each event found:
    // - if it is for an unseen track: 
    // - - start / or end the event, depending on if it is a start or end .. IE process the event!
    // - - mark that track as seen
    // - - if tracks are still unseen - continue through the events
    const seenTracks = new Array(this.sequence.tracks.length).fill(false);
    for (let i = this.queuePointer; i > -1; i--) {
      const event = this.queue[i];
      // find the track-index for this event
      const idx = event.timespan.timeline.track.index;
      if (!seenTracks[idx]) {
        this.processEvent(event);
        seenTracks[idx] = true;
      }
      if (seenTracks.every(tr => tr)) {
        // console.log("All tracks have been seen - breaking");
        break;
      }
    }

    // If there are unseen tracks, i.e. some without previous events - set them to off ...
    seenTracks.forEach((seen, index) => {
      if (!seen) {
        // set this track to off
        this.setTrackToState(this.sequence.tracks[index], 'off');
      }  
    });

     // inform eventlistener of timeupdate (if there is one)
     if (this.timeupdateListener) {
      this.timeupdateListener(this.currentTime);
    }
  }

  play() {
    console.log("Playing");

    // Only start playing if paused ...
    if (this.paused) {
      this.paused = false;
      this.tick();

      // inform listeners
      if (this.playListener) {
        this.playListener(true);
      }
    }
  }

  pause() {
    console.log("Paused");
    this.paused = true;
    clearTimeout(this.timeout);
    // inform listeners
    if (this.playListener) {
      this.playListener(false);
    }
  }

  updateAllListeners() {
    if (this.timeupdateListener) {
      this.timeupdateListener(this.currentTime);
    }
    if (this.statechangeListener) {
      this.sequence.tracks.forEach(track => {
        const value = this.readGPIO(track.gpio);
        if (value === track.on) {
          this.statechangeListener(track, 'on');
        } else {
          this.statechangeListener(track, 'off');
        }
      });
    }
    if (this.playListener) {
      this.playListener(!this.paused);
    }
    if (this.pauseListener) {
      this.pauseListener(!this.paused);
    }
  }
}

// testing
/*
const player = new Player();
player.loadSequence(start);

function start() {
  player.start();
}
*/
