import type { Response } from 'express'

/** Expose awaited server work in the browser's Network panel without logging request data. */
export async function timeRequestStep<T>(res: Response, name: string, operation: () => Promise<T>): Promise<T> {
  const started = performance.now()
  try {
    return await operation()
  } finally {
    if (!res.headersSent) res.append('Server-Timing', `${name};dur=${(performance.now() - started).toFixed(1)}`)
  }
}
