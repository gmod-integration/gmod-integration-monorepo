import { replaceStoredAvatar } from '@gmod/infra-minio'
import { type PartialUser, type User } from 'discord.js'

export default {
  name: 'userUpdate',
  async execute(oldUser: User | PartialUser, newUser: User | PartialUser) {
    if (!newUser.id) {
      return
    }

    if (oldUser.avatar === newUser.avatar) {
      return
    }

    await replaceStoredAvatar('discord', newUser.id, newUser.displayAvatarURL()).catch(() => null)
  },
}
