import { GmodAngle } from './GmodAngle.js'
import { GmodPosition } from './GmodPosition.js'
import { type GmodEntityInput, GmodEntitySchema } from '@gmod/schema/gmod/GmodEntitySchema.js'

export class GmodEntity {
  public readonly class: string
  public readonly model: string
  public readonly angle: GmodAngle
  public readonly position: GmodPosition

  private constructor(data: GmodEntityInput) {
    const parsed = GmodEntitySchema.parse(data)
    this.class = parsed.class
    this.model = parsed.model
    this.angle = GmodAngle.from(parsed.angle)
    this.position = GmodPosition.from(parsed.position)
  }

  public static from(data: unknown): GmodEntity {
    return new GmodEntity(data as GmodEntityInput)
  }
}
