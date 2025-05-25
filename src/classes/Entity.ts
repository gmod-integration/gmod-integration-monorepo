import { EntityInput } from '../schemas/EntitySchema.js';
import { WeaponSchema } from '../schemas/WeaponSchema.js';
import { Angle } from './Angle.js';
import { Position } from './Position.js';

export class Entity {
  public readonly class: string;
  public readonly model: string;
  public readonly angle: Angle;
  public readonly position: Position;

  private constructor(data: EntityInput) {
    WeaponSchema.parse(data);
    this.class = data.class;
    this.model = data.model;
    this.angle = Angle.from(data.angle);
    this.position = Position.from(data.position);
  }

  public static from(data: unknown): Entity {
    return new Entity(data as EntityInput);
  }
}
