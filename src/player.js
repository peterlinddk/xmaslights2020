"use strict";
import path from 'path';
import fs from "fs";
import { Sequence, Track, TimeLine, TimeSpan, TimeCode } from './public/objectmodel.js';

// This is the player, intended to run on the server
// It runs continually, loads the sequence from sequence.json, and plays through it, using the date-time
class Player {

  constructor() {
    const obj = this;
    fs.readFile(`${path.resolve()}/src/public/sequence.json`, function (err, data) {
      if (err) throw err;

      const json = JSON.parse(data);
      console.log(json);

      obj.sequence = new Sequence(json);
    });

  }

  start() {
    console.log("Started");
    // TODO: Cannot start before json sequence has been loaded
    console.log(this.sequence);
  }

}

// testing
const player = new Player();
player.start();