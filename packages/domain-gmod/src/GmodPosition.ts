import { type GmodPositionInput, GmodPositionSchema } from '@gmod/schema/gmod/GmodPositionSchema.js';

export class GmodPosition {
  public readonly x: number;
  public readonly y: number;
  public readonly z: number;

  private constructor(data: GmodPositionInput) {
    const parsed = GmodPositionSchema.parse(data);
    this.x = parsed.x;
    this.y = parsed.y;
    this.z = parsed.z;
  }

  public static from(data: unknown): GmodPosition {
    return new GmodPosition(data as GmodPositionInput);
  }
}
