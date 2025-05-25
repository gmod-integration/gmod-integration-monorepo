import { CaptureDataInput, CaptureDataSchema } from '../schemas/CaptureDataSchema.js';

export class CaptureData {
  public readonly w: number;
  public readonly h: number;
  public readonly x: number;
  public readonly y: number;
  public readonly quality: number;
  public readonly format: 'jpeg' | 'png';

  private constructor(data: CaptureDataInput) {
    const parsed = CaptureDataSchema.parse(data);
    this.w = parsed.w;
    this.h = parsed.h;
    this.x = parsed.x;
    this.y = parsed.y;
    this.quality = parsed.quality;
    this.format = parsed.format;
  }

  public static from(data: unknown): CaptureData {
    return new CaptureData(data as CaptureDataInput);
  }
}
