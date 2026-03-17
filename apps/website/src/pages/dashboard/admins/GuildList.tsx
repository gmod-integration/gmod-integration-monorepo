import { Component, createResource, For, Show } from 'solid-js'

import { fetchAPI } from '../../../utils/api'

const fetchGuildList = async () => {
  const res = await fetchAPI('/users/:discordID/admins/guilds', 'GET')
  if (!res.ok) return []
  const data = await res.json()
  return data.sort((a, b) => b.member - a.member)
}

const GuildList: Component = () => {
  const [guildList, { mutate: guildListMutate }] = createResource('guildList', fetchGuildList)

  return (
    <>
      <Show when={!guildList.loading} fallback={<div>Loading...</div>}>
        <div class="flex flex-wrap gap-4">
          <For each={guildList()}>
            {(guild) => (
              <div class="card shadow-md border border-base-200 w-[400px]">
                <div class="card-body">
                  <h2 class="card-title text-xl">{guild.name}</h2>
                  <p class="text-base-content/50">
                    ID: <span>{guild.guild}</span>
                  </p>
                  <p class="text-base-content/50">
                    Language: <span>{guild.language}</span>
                  </p>
                  <p class="text-base-content/50">
                    Members: <span>{guild.member}</span>
                  </p>
                  <p class="text-base-content/50">
                    Created: <span>{new Date(guild.createdAt).toLocaleString()}</span>
                  </p>
                  <p class="text-base-content/50">
                    Updated: <span>{new Date(guild.updatedAt).toLocaleString()}</span>
                  </p>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </>
  )
}

export default GuildList
