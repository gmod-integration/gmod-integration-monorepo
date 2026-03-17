import { GmodCaptureData } from './GmodCaptureData.js';
import { GmodScreenshotInput, GmodScreenshotSchema } from '@gmod/schema/gmod/GmodScreenshotSchema.js';
import { GmodPlayer } from './GmodPlayers.js';

export class GmodScreenshot {
  public readonly captureData: GmodCaptureData;
  public readonly title?: string;
  public readonly player: GmodPlayer;
  public readonly screenshot: string;
  public readonly size: string;

  private constructor(data: GmodScreenshotInput) {
    const parsed = GmodScreenshotSchema.parse(data);
    this.captureData = GmodCaptureData.from(parsed.captureData);
    this.title = parsed.title || undefined;
    this.player = GmodPlayer.from(parsed.player);
    this.screenshot = parsed.screenshot;
    this.size = parsed.size;
  }

  public static from(data: unknown): GmodScreenshot {
    return new GmodScreenshot(data as GmodScreenshotInput);
  }

  public getTitle(): string {
    return this.title || 'No Title';
  }

  public async save() {
    // todo
  }

  public async sendToDiscord() {
    // todo
  }
}
