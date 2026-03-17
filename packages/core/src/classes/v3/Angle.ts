import { BaseClass } from './BaseClass.js'

export interface AngleInterface {
  p: number
  y: number
  r: number
}

export class Angle extends BaseClass implements AngleInterface {
  public p: number
  public y: number
  public r: number

  constructor(obj: AngleInterface, throwMissing = true) {
    super()

    this.checkMissingAndThrow(
      obj,
      {
        p: 'number',
        y: 'number',
        r: 'number',
      },
      throwMissing,
    )

    this.p = obj.p || 0
    this.y = obj.y || 0
    this.r = obj.r || 0
  }
}
