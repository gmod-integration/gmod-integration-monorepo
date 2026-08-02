import { describe, expect, it } from 'vitest'
import * as schemas from '../src/schemas.js'

// src/schemas.ts is a pure re-export of @gmod/schema/bullmq.js (see docs/packages/infra-bullmq.md
// for why: a convenience re-export so consumers don't need a second package import). Nothing to
// branch-test — just confirm the re-export actually surfaces the schemas.
describe('packages/infra-bullmq src/schemas.ts', () => {
  it('re-exports the bullmq schemas from @gmod/schema', () => {
    expect(schemas.UpdateGuildUserPseudoJobSchema).toBeDefined()
    expect(schemas.DiscordGuildSnapshotReplySchema).toBeDefined()
  })
})
