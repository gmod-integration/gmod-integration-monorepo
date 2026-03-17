import { BaseClass } from './BaseClass.js'

export interface PositionInterface {
  x: number
  y: number
  z: number
}

export class Position extends BaseClass implements PositionInterface {
  public x: number
  public y: number
  public z: number

  constructor(obj: PositionInterface, throwMissing = true) {
    super()

    this.checkMissingAndThrow(
      obj,
      {
        x: 'number',
        y: 'number',
        z: 'number',
      },
      throwMissing,
    )

    this.x = obj.x || 0
    this.y = obj.y || 0
    this.z = obj.z || 0
  }
}
