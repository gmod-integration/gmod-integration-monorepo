import { BaseClass } from './BaseClass.js';

export class Angle extends BaseClass {
  private p: number;
  private y: number;
  private r: number;

  constructor(obj = { p: 0, y: 0, r: 0 }) {
    super();
    this.p = obj.p;
    this.y = obj.y;
    this.r = obj.r;
  }
}
