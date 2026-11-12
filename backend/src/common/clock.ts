import { Injectable } from '@nestjs/common';

export abstract class Clock {
  abstract now(): Date;
}

@Injectable()
export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}

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
