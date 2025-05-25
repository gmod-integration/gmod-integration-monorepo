import { GmodAngleInput, GmodAngleSchema } from '../../schemas/gmod/GmodAngleSchema.js';

export class GmodAngle {
  public readonly p: number;
  public readonly y: number;
  public readonly r: number;

  private constructor(data: GmodAngleInput) {
    const parsed = GmodAngleSchema.parse(data);
    this.p = parsed.p;
    this.y = parsed.y;
    this.r = parsed.r;
  }

  public static from(data: unknown): GmodAngle {
    return new GmodAngle(data as GmodAngleInput);
  }
}
