import { PositionInput, PositionSchema } from '../schemas/PositionSchema.js';

export class Position {
  public readonly x: number;
  public readonly y: number;
  public readonly z: number;

  private constructor(data: PositionInput) {
    const parsed = PositionSchema.parse(data);
    this.x = parsed.x;
    this.y = parsed.y;
    this.z = parsed.z;
  }

  public static from(data: unknown): Position {
    return new Position(data as PositionInput);
  }
}
