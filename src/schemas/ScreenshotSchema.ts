import { z } from 'zod';
import { extendZodWithOpenApi } from 'zod-openapi';
import { CaptureDataSchema } from './CaptureDataSchema.js';
import { PlayerSchema } from './PlayerSchema.js';

extendZodWithOpenApi(z);

export const ScreenshotSchema = z.object({
  captureData: CaptureDataSchema.openapi({
    description: 'Information about the capture area and format',
  }),
  title: z.string().optional().openapi({
    description: 'Title of the screenshot',
    example: 'My Screenshot',
  }),
  player: PlayerSchema.optional().openapi({
    description: 'Player information associated with the screenshot',
  }),
  screenshot: z.string().openapi({
    description: 'Base64 encoded screenshot image',
  }),
  size: z.string().openapi({
    description: 'Size of the screenshot',
    example: '10KB',
  }),
});

export type ScreenshotInput = z.infer<typeof ScreenshotSchema>;
