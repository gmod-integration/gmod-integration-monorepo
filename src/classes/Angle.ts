import { AngleInput, AngleSchema } from '../schemas/AngleSchema.js';

export class Angle {
  public readonly p: number;
  public readonly y: number;
  public readonly r: number;

  private constructor(data: AngleInput) {
    const parsed = AngleSchema.parse(data);
    this.p = parsed.p;
    this.y = parsed.y;
    this.r = parsed.r;
  }

  public static from(data: unknown): Angle {
    return new Angle(data as AngleInput);
  }
}
