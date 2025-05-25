import { AngleInput, AngleSchema } from '../schemas/AngleSchema.js';

export class Angle {
  public readonly p: number;
  public readonly y: number;
  public readonly r: number;

  private constructor(data: AngleInput) {
    AngleSchema.parse(data);
    this.p = data.p;
    this.y = data.y;
    this.r = data.r;
  }

  public static from(data: unknown): Angle {
    return new Angle(data as AngleInput);
  }
}
