import { type GmodCaptureDataInput, GmodCaptureDataSchema } from '@gmod/schema/gmod/GmodCaptureDataSchema.js'

export class GmodCaptureData {
  public readonly w: number
  public readonly h: number
  public readonly x: number
  public readonly y: number
  public readonly quality: number
  public readonly format: 'jpeg' | 'png'

  private constructor(data: GmodCaptureDataInput) {
    const parsed = GmodCaptureDataSchema.parse(data)
    this.w = parsed.w
    this.h = parsed.h
    this.x = parsed.x
    this.y = parsed.y
    this.quality = parsed.quality
    this.format = parsed.format
  }

  public static from(data: unknown): GmodCaptureData {
    return new GmodCaptureData(data as GmodCaptureDataInput)
  }
}
