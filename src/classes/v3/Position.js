import { BaseClass } from './BaseClass.js';

export class Position extends BaseClass {
  constructor(obj = {}) {
    super();
    this.x = obj.x;
    this.y = obj.y;
    this.z = obj.z;
  }
}
