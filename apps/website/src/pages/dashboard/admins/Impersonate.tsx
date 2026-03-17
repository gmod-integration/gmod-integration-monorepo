import { Component, createResource, For, Show } from 'solid-js'

import { fetchAPI } from '../../../utils/api'

const Impersonate: Component = () => {
  const [panelUser] = createResource('panelUser', async () => {
    const res = await fetchAPI('/users/:discordID/admins/panel-users', 'GET')
    if (!res.ok) return []
    return await res.json()
  })

  return (
    <>
      <div class="flex flex-wrap gap-4">
        <Show when={!panelUser.loading} fallback={<div>Loading...</div>}>
          <For each={panelUser()}>
            {(user) => (
              <Show when={user.discordID !== localStorage.getItem('discordID')}>
                <div
                  class="card shadow-md border border-base-200 w-[400px]"
                  onClick={() => {
                    const oldToken = localStorage.getItem('accessToken') || ''
                    const oldDiscordID = localStorage.getItem('discordID') || ''
                    const oldExpirationDate = localStorage.getItem('expirationDate') || ''
                    // 1 clear all cookies
                    localStorage.clear()
                    sessionStorage.clear()
                    // set accessTokens & oldAccessToken
                    localStorage.setItem('oldAccessToken', oldToken)
                    localStorage.setItem('oldDiscordID', oldDiscordID)
                    localStorage.setItem('oldExpirationDate', oldExpirationDate)
                    // redirect to home
                    window.location.href = `/login/?discordID=${user.discordID}&accessToken=${user.accessToken}&expirationDate=${new Date(
                      user.expirationDate,
                    ).getTime()}`
                  }}
                >
                  <div class="card-body">
                    <div class="flex items-center gap-4 text-base-content/50">
                      ID: <span>{user.discordID}</span>
                    </div>
                  </div>
                </div>
              </Show>
            )}
          </For>
        </Show>
      </div>
    </>
  )
}

export default Impersonate
