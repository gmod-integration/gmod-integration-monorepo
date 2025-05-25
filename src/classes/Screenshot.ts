import { ScreenshotInput, ScreenshotSchema } from '../schemas/ScreenshotSchema.js';
import { CaptureData } from './CaptureData.js';
import { Player } from './Players.js';
import { Server } from './v3/Server.js';

export class Screenshot {
  public readonly captureData: CaptureData;
  public readonly title?: string;
  public readonly player?: Player;
  public readonly screenshot: string;
  public readonly size: string;

  private constructor(data: ScreenshotInput) {
    const parsed = ScreenshotSchema.parse(data);
    this.captureData = CaptureData.from(parsed.captureData);
    this.title = parsed.title || undefined;
    this.player = (parsed.player && Player.from(parsed.player)) || undefined;
    this.screenshot = parsed.screenshot;
    this.size = parsed.size;
  }

  public static from(data: unknown): Screenshot {
    return new Screenshot(data as ScreenshotInput);
  }

  public getTitle(): string {
    return this.title || 'No Title';
  }

  public saveInServer(server: Server) {
    //
  }
}
