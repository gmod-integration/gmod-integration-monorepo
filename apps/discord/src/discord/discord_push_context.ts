import { REST, Routes } from 'discord.js'
import { ConfigDiscord } from '@gmod/config'
import { join } from 'path'
import { readdir } from 'fs/promises'

const commandsData: any[] = []

async function loadCommands(dirPath: string, type: string) {
  try {
    const foldersPath = join(process.cwd(), dirPath)
    const folders = await readdir(foldersPath)

    for (const folder of folders) {
      const commandsPath = join(foldersPath, folder)
      const commandFiles = (await readdir(commandsPath)).filter((file) => file.endsWith('.js') || file.endsWith('.ts'))

      for (const file of commandFiles) {
        try {
          const filePath = join(commandsPath, file)
          const command = await import(filePath)
          if (command.default && command.default.data) {
            commandsData.push(command.default.data.toJSON())
            console.log(`[INFO] Pushed ${type} ${command.default.data.name} from ${filePath}`)
          } else {
            console.log(`[WARNING] The ${type} at ${filePath} is missing a required "data" or "execute" property.`)
          }
        } catch (error) {
          console.error(`[ERROR] Failed to load ${type} from ${file}: ${error}`)
        }
      }
    }
  } catch (error) {
    console.error(`[ERROR] Failed to read directory ${dirPath}: ${error}`)
  }
}

const rest = new REST().setToken(ConfigDiscord.botToken!)
try {
  console.log('[INFO] Started reloading application.')

  await loadCommands('apps/discord/src/discord/contexts', 'Context')
  await loadCommands('apps/discord/src/discord/commands', 'Command')

  console.log(commandsData)

  await rest.put(Routes.applicationCommands(ConfigDiscord.clientID!), {
    body: commandsData,
  })

  console.log('[INFO] Successfully reloaded application.')
} catch (error) {
  console.error('[ERROR] Failed to reload application.')
  console.error(error)
}
