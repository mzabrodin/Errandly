import { Injectable } from '@nestjs/common';

/**
 * The current time as a dependency. Task status, the 24-hour undo window, reminders and
 * retries all depend on "now", so tests inject a FixedClock instead of mocking Date.
 */
export abstract class Clock {
  abstract now(): Date;
}

@Injectable()
export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}

/** For tests: time stands still until `set` or `advance` moves it */
export class FixedClock extends Clock {
  private current: Date;

  constructor(start: Date | string) {
    super();
    this.current = new Date(start);
  }

  now(): Date {
    return new Date(this.current);
  }

  set(time: Date | string): void {
    this.current = new Date(time);
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}
