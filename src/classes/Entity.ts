import { EntityInput, EntitySchema } from '../schemas/EntitySchema.js';
import { Angle } from './Angle.js';
import { Position } from './Position.js';

export class Entity {
  public readonly class: string;
  public readonly model: string;
  public readonly angle: Angle;
  public readonly position: Position;

  private constructor(data: EntityInput) {
    const parsed = EntitySchema.parse(data);
    this.class = parsed.class;
    this.model = parsed.model;
    this.angle = Angle.from(parsed.angle);
    this.position = Position.from(parsed.position);
  }

  public static from(data: unknown): Entity {
    return new Entity(data as EntityInput);
  }
}
