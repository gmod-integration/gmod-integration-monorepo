import { BaseClass } from './BaseClass.js';

export class Angle extends BaseClass {
  constructor(obj = {}) {
    super();
    this.p = obj.p;
    this.y = obj.y;
    this.r = obj.r;
  }
}
