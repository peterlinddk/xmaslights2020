export { Sequence, Track, TimeLine, TimeSpan, TimeCode };

class Sequence {
  constructor(data) {
    this.tracks = [];

    data.tracks.forEach((track) => {
      this.addTrack(track);
    });

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
    this.timeline.track = this;
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

  setScroller(scroller) {
    this.scroller = scroller;
  }

  get width() {
    return this.element.clientWidth * this.scroller.getZoomFactor();
  }

  get offset() {
    return this.width * this.scroller.getOffset();
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

  equals(otherTimeCode) {
    return this.hour === otherTimeCode.hour && this.minute === otherTimeCode.minute;
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
    let hour = Math.floor(dtime);
    // round up, to allow for half minutes to be turned into whole minutes
    let minute = Math.round((dtime - hour) * 60);
    // if rounding causes too large number of minutes, move into the next hour
    if (minute > 59) {
      minute -= 60;
      hour++;
    }
    this.hour = hour;
    this.minute = minute;
  }

  addMinutes(minutes) {
    this.decimalTime = this.decimalTime + minutes / 60;
    return this; // Returning this allows for chaining of calls
  }
}
