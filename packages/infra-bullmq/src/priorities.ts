/**
 * Job priorities for every Discord queue.
 *
 * BullMQ processes the LOWEST number first. Always pick a tier from here instead
 * of a raw number, so priorities stay comparable across job types.
 */
export const JobPriority = {
  /** The API is blocked on `waitForReply`: someone is waiting on an HTTP response. */
  INTERACTIVE: 1,
  /** Triggered by a player/server action, but nobody is staring at a spinner. */
  NORMAL: 5,
  /** Periodic routines and refreshes; fine to wait behind everything else. */
  BACKGROUND: 10,
} as const

export type JobPriorityValue = (typeof JobPriority)[keyof typeof JobPriority]
