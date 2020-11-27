"use strict";
import path from 'path';
import fs from "fs";
import { Sequence, Track, TimeLine, TimeSpan, TimeCode } from './public/objectmodel.js';

// This is the player, intended to run on the server
// It runs continually, loads the sequence from sequence.json, and plays through it, using the date-time
class Player {

  constructor() {
    this.currentTime = new TimeCode("0:00");
  }

  loadSequence( callback ) {
    const obj = this;
    fs.readFile(`${path.resolve()}/src/public/sequence.json`, function (err, data) {
      if (err) throw err;

      const json = JSON.parse(data);
      // console.log(json);

      obj.sequence = new Sequence(json);
      obj.buildEventQueue();

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
    this.sequence.tracks.forEach(track => {
      track.timeline.timespans.forEach(timespan => {
        this.queue.push({ time: timespan.start, timespan });
        this.queue.push({ time: timespan.end, timespan });
      });
    });

    // sort the queue by time, so they are sequential
    this.queue.sort((a, b) => a.time.compareWith(b.time));
  }

  nextInQueue() {
    // get the next element in the queue (without removing it from the queue)
    return this.queue[0];
  }

  moveQueue() {
    // remove the first element in the queue (and add it to the end of the queue to make it circular ... TODO: Maybe it shouldn't ...)
    const next = this.queue.shift();
    this.queue.push(next);
  }

  tick() {
    process.stdout.cursorTo(0);
    process.stdout.write(`tick @ ${this.currentTime}  `);

    let next = this.nextInQueue();
    // console.log(`next @ ${next.time}`);
    let firstProcess = true;
    while (this.currentTime.compareWith(next.time) >= 0) {
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
    const timeToNextTick = 500;
    this.updateCurrentTime(); // TODO: Make update return timeToNextTick
    
    setTimeout(this.tick.bind(this), timeToNextTick);
  }

  processEvent(event) {
    const track = event.timespan.timeline.track;
    // if event.time is similar to event.start, then start the event - if similar to event.end, then end the event
    if (event.time.equals(event.timespan.start)) {
      // start the event
      console.log(`${event.time}: ${track.name} @ ${track.port} 'ON' (${track.on})`);
      // TODO: Set GPIO port to ON value
    } else if (event.time.equals(event.timespan.end)) {
      // end the event
      const off = Math.abs(track.on - 1);
      console.log(`${event.time}: ${track.name} @ ${track.port} 'OFF' (${off})`);
      // TODO: Set GPIO port to OFF value
    } else {
      console.log("ERROR! time does not match timespan start or end!");
      console.log(event);
    }
  }

  updateCurrentTime() {
    // TODO: Maybe more intelligently than this - e.g. actually look at the time!
    this.currentTime.addMinutes(1);

  }

  // sets the current time to timecode - and removes everything in the queue before that time (ignoring the state of each track)
  setCurrentTime(timecode) {
    for (let i = 0; i < this.queue.length; i++) {
      
    }
  }

  start() {
    console.log("Started");
    
//    console.log(this.sequence);
//    console.log("Queue:");
//    console.log(this.queue);
    this.tick();
  }

}

// testing
const player = new Player();
player.loadSequence(start);

function start() {
  player.start();
}