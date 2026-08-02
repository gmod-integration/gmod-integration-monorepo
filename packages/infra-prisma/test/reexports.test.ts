import { describe, expect, it } from 'vitest'

// client.ts / enums.ts are pure re-exports of the generated Prisma client (generated/** is
// excluded from the coverage denominator — see vitest.config.ts — but these two thin re-export
// files are project code and need their own single statement covered).
describe('packages/infra-prisma re-export files', () => {
  it('client.ts re-exports the generated Prisma client', async () => {
    const mod = await import('../src/client.js')
    expect(mod.PrismaClient).toBeDefined()
  })

  it('enums.ts re-exports the generated Prisma enums', async () => {
    const mod = await import('../src/enums.js')
    expect(mod.gm_server_logs_triggers_action).toBeDefined()
  })
})
