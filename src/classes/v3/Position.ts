import { BaseClass } from './BaseClass';

export class Position extends BaseClass {
  private x: number;
  private y: number;
  private z: number;

  constructor(
    obj = {
      x: 0,
      y: 0,
      z: 0,
    },
  ) {
    super();
    this.x = obj.x;
    this.y = obj.y;
    this.z = obj.z;
  }
}
