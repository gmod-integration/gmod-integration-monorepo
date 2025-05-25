import { ScreenshotInput, ScreenshotSchema } from '../schemas/ScreenshotSchema.js';
import { CaptureData } from './CaptureData.js';
import { Player } from './Players.js';

export class Screenshot {
  public readonly captureData: CaptureData;
  public readonly title?: string;
  public readonly player?: Player;
  public readonly screenshot: string;
  public readonly size: string;

  private constructor(data: ScreenshotInput) {
    ScreenshotSchema.parse(data);
    this.captureData = CaptureData.from(data);
    this.title = data.title;
    this.player = Player.from(data.player);
    this.screenshot = data.screenshot;
    this.size = data.size;
  }

  public static from(data: unknown): Screenshot {
    return new Screenshot(data as ScreenshotInput);
  }
}
