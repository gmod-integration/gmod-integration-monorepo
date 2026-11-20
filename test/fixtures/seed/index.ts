// Keep the old entrypoint usable while routing every command through the same development seed.
import { seedDevelopment } from '../../../scripts/seed-dev.js'

await seedDevelopment()
