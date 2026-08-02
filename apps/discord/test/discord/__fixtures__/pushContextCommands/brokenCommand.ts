// Deliberately throws at import time so discord_push_context.test.ts can exercise the
// per-file "Failed to load command" catch branch in loadCommands().
throw new Error('fixture import failure')
