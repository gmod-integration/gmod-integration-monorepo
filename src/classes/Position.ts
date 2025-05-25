import { PositionInput, PositionSchema } from '../schemas/PositionSchema.js';

export class Position {
  public readonly x: number;
  public readonly y: number;
  public readonly z: number;

  private constructor(data: PositionInput) {
    PositionSchema.parse(data);
    this.x = data.x;
    this.y = data.y;
    this.z = data.z;
  }

  public static from(data: unknown): Position {
    return new Position(data as PositionInput);
  }
}
