import { Component, createEffect, createSignal, onCleanup, onMount, Show } from 'solid-js'
import { getServer } from '../../../../utils/utils'
import { sendWebSocketMessage, webSocketServerStatus } from '../../../../utils/websocket'
import { useNavigate } from '@solidjs/router'
import AdminModal from '../../../../components/AdminModal'
import AdminPanel from '../../../../components/AdminPanel'
import defaultServer from '../../../../assets/defaultServer.png'
import { useI18n } from '../../../../i18n'
import { linkBadge } from '../../../../components/layout/menu/DashboardMenu'
import { fetchAPI } from '../../../../utils/api'

const ServerInformations: Component = () => {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [server, setServer] = createSignal(getServer())
  const [showToken, setShowToken] = createSignal(false)

  const deleteServer = async () => {
    const res = await fetchAPI(`/users/:discordID/guilds/:guildID/servers/${server().id}`, 'DELETE')
    if (!res.ok) {
      return
    }
    navigate('/dashboard/guilds/:guildID/config/servers')
  }

  const editServer = async () => {
    const res = await fetchAPI(`/users/:discordID/guilds/:guildID/servers/${server().id}`, 'PUT', server())
    if (!res.ok) {
      return
    }
    const newServer = await res.json()
    setServer(newServer)
    localStorage.setItem('server', JSON.stringify(newServer))
  }

  const resetServerToken = async () => {
    const res = await fetchAPI(`/users/:discordID/guilds/:guildID/servers/${server().id}/token`, 'POST')
    if (!res.ok) {
      return
    }
    const newServer = await res.json()
    setServer(newServer)
    localStorage.setItem('server', JSON.stringify(newServer))
  }

  onMount(() => {
    const intervalId = setInterval(() => {
      sendWebSocketMessage('server_status', { serverID: server().id })
    }, 2000)

    onCleanup(() => clearInterval(intervalId))
  })

  const [isValidWSConnection, setIsValidWSConnection] = createSignal(webSocketServerStatus().isWebSocketConnected)
  const [isValidHTTPRequest, setIsValidHTTPRequest] = createSignal(
    webSocketServerStatus().lastRequest.getTime() > new Date().getTime() - 1000 * 60,
  )
  const [isValidVersion, setIsValidVersion] = createSignal(
    webSocketServerStatus().versionComparator == 0 || webSocketServerStatus().versionComparator == -1,
  )

  createEffect(() => {
    setIsValidWSConnection(webSocketServerStatus().isWebSocketConnected)
    setIsValidHTTPRequest(webSocketServerStatus().lastRequest.getTime() > new Date().getTime() - 1000 * 60)
    setIsValidVersion(webSocketServerStatus().versionComparator == 0 || webSocketServerStatus().versionComparator == -1)
  }, [webSocketServerStatus()])

  return (
    <>
      <AdminModal title={t('dashboard.server.server_informations.edit_server', 'Edit Server')} id="edit_server">
        <div class="fieldset">
          <label class="label">
            <span>{t('dashboard.server.server_informations.server_name', 'Name')}</span>
          </label>
          <input
            type="text"
            class="input"
            disabled={/* no specific loading state available */ false}
            value={server().name}
            onInput={(e) => {
              server().name = e.currentTarget.value
            }}
          />
        </div>
        <div class="fieldset">
          <label class="label">
            <span>{t('dashboard.server.server_informations.server_description', 'Description')}</span>
          </label>
          <input
            type="text"
            class="input"
            disabled={/* no specific loading state available */ false}
            value={server().description}
            onInput={(e) => {
              server().description = e.currentTarget.value
            }}
          />
        </div>
        <div class="fieldset">
          <label class="label">
            <span>{t('dashboard.server.server_informations.server_image', 'Image')}</span>
          </label>
          <input
            type="text"
            class="input"
            disabled={/* no specific loading state available */ false}
            value={server().image}
            onInput={(e) => {
              server().image = e.currentTarget.value
            }}
          />
        </div>
        <div class="fieldset">
          <label class="label">
            <span>{t('dashboard.server.server_informations.server_ip', 'IP')}</span>
          </label>
          <input
            type="text"
            disabled={/* no specific loading state available */ false}
            class="input"
            value={server().ip}
            onInput={(e) => {
              server().ip = e.currentTarget.value
            }}
          />
        </div>
        <div class="fieldset">
          <label class="label">
            <span>{t('dashboard.server.server_informations.server_port', 'Port')}</span>
          </label>
          <input
            type="text"
            disabled={/* no specific loading state available */ false}
            class="input"
            value={server().port}
            onInput={(e) => {
              server().port = e.currentTarget.value
            }}
          />
        </div>
        <div class="fieldset">
          <label class="label">
            <span>{t('dashboard.server.server_informations.server_public', 'Public')}</span>
          </label>
          <select
            disabled={/* no specific loading state available */ false}
            class="select"
            value={server().isPublic ? 'true' : 'false'}
            onChange={(e) => {
              server().isPublic = e.currentTarget.value === 'true'
            }}
          >
            <option value="true">{t('dashboard.server.server_informations.yes', 'Yes')}</option>
            <option value="false">{t('dashboard.server.server_informations.no', 'No')}</option>
          </select>
        </div>
        <button
          class="btn btn-base-200 mt-2"
          disabled={/* no specific loading state available */ false}
          onClick={async () => {
            // @ts-expect-error -- intentional: legacy typing gap
            edit_server.close()
            await editServer()
          }}
        >
          {t('dashboard.server.server_informations.save_changes', 'Save')}
        </button>
      </AdminModal>

      <AdminPanel
        title={t('dashboard.server.server_informations.informations', 'Informations')}
        description={t(
          'dashboard.server.server_informations.informations_description',
          'Here you can see some informations about your server, and edit some of them.',
        )}
      >
        <div class="flex w-fit items-center">
          <span class="mr-2">{t('dashboard.server.server_informations.server_name', 'Name')}:</span>
          <span>{server().name}</span>
        </div>

        <div class="flex w-fit items-center">
          <span class="mr-2">{t('dashboard.server.server_informations.server_description', 'Description')}:</span>
          <span>{server().description}</span>
        </div>

        <div class="flex w-fit items-center">
          <span class="mr-2">{t('dashboard.server.server_informations.server_logo', 'Logo')}:</span>
          <img class="w-8 h-8 rounded-sm object-cover" src={server().image || defaultServer} alt="Server Logo" />
        </div>

        <div class="flex w-fit items-center">
          <span class="mr-2">{t('dashboard.server.server_informations.server_ip', 'IP')}:</span>
          <span>{server().ip + ':' + server().port}</span>
        </div>

        <div class="flex w-fit items-center">
          <span class="mr-2">{t('dashboard.server.server_informations.server_id', 'ID')}:</span>
          <span>{server().id}</span>
        </div>

        <div class="flex w-fit items-center">
          <span class="mr-2">{t('dashboard.server.server_informations.server_token', 'Token')}:</span>
          <span class="label-text" classList={{ link: !showToken() }} onClick={() => setShowToken(true)}>
            {showToken() ? server().token : t('dashboard.server.server_informations.show_token', 'Click to Show')}
          </span>
        </div>

        <div class="flex w-fit items-center">
          <span class="mr-2">{t('dashboard.server.server_informations.server_public', 'Server Public')}:</span>
          <span>
            {server().isPublic
              ? t('dashboard.server.server_informations.yes', 'Yes')
              : t('dashboard.server.server_informations.no', 'No')}
          </span>
        </div>

        <div class="flex w-fit items-center gap-4">
          <button
            class="btn btn-warning"
            onClick={async () => {
              await deleteServer()
            }}
          >
            {t('dashboard.server.server_informations.delete_server', 'Delete Server')}
          </button>

          <button
            class="btn btn-warning"
            onClick={async () => {
              await resetServerToken()
            }}
          >
            {t('dashboard.server.server_informations.reset_server_token', 'Reset Server Token')}
          </button>

          <button
            class="btn btn-base-200"
            onClick={() => {
              // @ts-expect-error -- intentional: legacy typing gap
              edit_server.showModal()
            }}
          >
            {t('dashboard.server.server_informations.edit_server', 'Edit Server')}
          </button>
        </div>
      </AdminPanel>
      <AdminPanel
        title={t('dashboard.server.server_informations.connection_status_title', 'Connection Status')}
        description={t(
          'dashboard.server.server_informations.connection_status_description',
          'Here you can see the connection status of your server.',
        )}
        type="none"
      >
        <div class="join join-horizontal border-b border-base-200 rounded-none">
          <div class="join-item h-32 flex flex-col items-center border-r border-base-200">
            <div class="join-title w-36 font-semibold text-center p-2 border-b border-base-200">
              {t('dashboard.server.server_informations.http_request_title', 'HTTP Request')}
            </div>
            <div class="flex-1 flex items-center justify-center">
              <i
                class={`fa-solid fa-arrows-down-to-line ${isValidHTTPRequest() ? 'text-success' : 'text-error'} text-3xl`}
              ></i>
            </div>
          </div>
          <div class="join-item p-4 text-base-content/60">
            <Show
              when={isValidHTTPRequest()}
              fallback={
                <p>
                  {t(
                    'dashboard.server.server_informations.http_request_fallback_part1',
                    "We haven't received any request from your server in the last minute, make sure to have installed the",
                  )}{' '}
                  <a href="/workshop" class="link">
                    {t('dashboard.server.server_informations.workshop_content', 'workshop content')}
                  </a>{' '}
                  {t(
                    'dashboard.server.server_informations.http_request_fallback_part2',
                    'correctly and have fully configured your server id & token, read the',
                  )}{' '}
                  <a href="/docs/getting-started/configuration" class="link">
                    {t('dashboard.server.server_informations.documentation', 'documentation')}
                  </a>{' '}
                  {t('dashboard.server.server_informations.http_request_fallback_part3', 'for more information.')}
                </p>
              }
            >
              <p>
                {t(
                  'dashboard.server.server_informations.http_request_success',
                  'Congratulations your server is correctly setup you can now configure it.',
                )}
              </p>
            </Show>
          </div>
        </div>

        <div class="join join-horizontal border-b border-base-200 rounded-none">
          <div class="join-item h-32 flex flex-col items-center border-r border-base-200">
            <div class="join-title w-36 font-semibold text-center p-2 border-b border-base-200">
              {t('dashboard.server.server_informations.websocket_title', 'WebSocket')}
            </div>
            <div class="flex-1 flex items-center justify-center">
              <i class={`fa-solid fa-right-left ${isValidWSConnection() ? 'text-success' : 'text-error'} text-3xl`}></i>
            </div>
          </div>
          <div class="join-item p-4 text-base-content/60">
            <Show
              when={isValidWSConnection()}
              fallback={
                <p>
                  {t(
                    'dashboard.server.server_informations.websocket_fallback_part1',
                    'Your server is not connected to the websocket, advanced features are not available, to use them you need to install the',
                  )}{' '}
                  <a href="/docs/getting-started/installation#dll" class="link">
                    {t('dashboard.server.server_informations.gwsocket_module', 'GWSocket Module')}
                  </a>{' '}
                  {t('dashboard.server.server_informations.websocket_fallback_part2', 'on your server.')}
                </p>
              }
            >
              <p>
                {t(
                  'dashboard.server.server_informations.websocket_success',
                  'Congratulations you successfully connected to your server in websocket, advanced features are now available.',
                )}
              </p>
            </Show>
          </div>
        </div>

        <div class="join join-horizontal rounded-none">
          <div class="join-item h-32 flex flex-col items-center border-r border-base-200">
            <div class="join-title w-36 font-semibold text-center p-2 border-b border-base-200">
              {t('dashboard.server.server_informations.version_title', 'Version')}
            </div>
            <div class="flex-1 flex items-center justify-center">
              <i
                class={`fa-solid fa-tag ${!isValidHTTPRequest() ? 'text-warning' : isValidVersion() ? 'text-success' : 'text-error'} text-3xl`}
              ></i>
            </div>
          </div>
          <div class="join-item p-4 text-base-content/60">
            <Show
              when={isValidHTTPRequest()}
              fallback={
                <p>
                  {t(
                    'dashboard.server.server_informations.version_fallback_http_part1',
                    "We can't check the version of your server, make sure to have installed the",
                  )}{' '}
                  <a href="/workshop" class="link">
                    {t('dashboard.server.server_informations.workshop_content', 'workshop content')}
                  </a>{' '}
                  {t(
                    'dashboard.server.server_informations.version_fallback_http_part2',
                    'correctly and have fully configured your server id & token, read the',
                  )}{' '}
                  <a href="/docs/getting-started/configuration" class="link">
                    {t('dashboard.server.server_informations.documentation', 'documentation')}
                  </a>{' '}
                  {t('dashboard.server.server_informations.version_fallback_http_part3', 'for more information.')}
                </p>
              }
            >
              <Show
                when={isValidVersion()}
                fallback={
                  <p>
                    {t(
                      'dashboard.server.server_informations.version_fallback_outdated',
                      'Your server is outdated, new features will not work correctly, you need to update it. If you are using the Workshop version simply restart your server and it will automatically update. But if you are using the github repo or a uncompressed workshop version you need to manually update it.',
                    )}
                  </p>
                }
              >
                <p>
                  {t(
                    'dashboard.server.server_informations.version_success',
                    'Great your server is up to date and will work perfectly with the latest features',
                  )}
                </p>
              </Show>
            </Show>
          </div>
        </div>
      </AdminPanel>
    </>
  )
}

export default ServerInformations
