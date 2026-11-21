import { closeDialog, showDialog } from '../../../../utils/dialog.js'
import { type Component, createEffect, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { getServer } from '../../../../utils/utils'
import { sendWebSocketMessage, webSocketServerStatus } from '../../../../utils/websocket'
import { useNavigate } from '@solidjs/router'
import AdminModal from '../../../../components/AdminModal'
import AdminPanel from '../../../../components/AdminPanel'
import defaultServer from '../../../../assets/defaultServer.png'
import { useI18n } from '../../../../i18n'
import { fetchAPI } from '../../../../utils/api'
import { Button, FormActions, FormField, Icon, SettingGroup, SettingRow } from '../../../../components/ui/index.js'
import { createAsyncAction } from '../../../../hooks/createAsyncAction.js'

const ServerInformations: Component = () => {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [server, setServer] = createSignal(getServer())
  const [draft, setDraft] = createSignal({ ...server() })
  const [showToken, setShowToken] = createSignal(false)
  const save = createAsyncAction({ errorMessage: () => t('ui.save_error', 'Unable to save. Please try again.') })
  const action = createAsyncAction({ errorMessage: () => t('ui.save_error', 'Unable to save. Please try again.') })
  const discard = () => {
    setDraft({ ...server() })
    save.reset()
  }
  const fields = [
    ['name', 'server_name', 'Name'],
    ['description', 'server_description', 'Description'],
    ['image', 'server_image', 'Image'],
    ['ip', 'server_ip', 'IP'],
    ['port', 'server_port', 'Port'],
  ] as const

  const deleteServer = async () => {
    const res = await fetchAPI(`/users/:discordID/guilds/:guildID/servers/${server().id}`, 'DELETE')
    if (!res.ok) {
      throw new Error('Server deletion failed')
    }
    navigate('/dashboard/guilds/:guildID/config/servers')
  }

  const editServer = async () => {
    const res = await fetchAPI(`/users/:discordID/guilds/:guildID/servers/${server().id}`, 'PUT', { ...draft() })
    if (!res.ok) {
      throw new Error('Server update failed')
    }
    const newServer = await res.json()
    setServer(newServer)
    localStorage.setItem('server', JSON.stringify(newServer))
  }

  const resetServerToken = async () => {
    const res = await fetchAPI(`/users/:discordID/guilds/:guildID/servers/${server().id}/token`, 'POST')
    if (!res.ok) {
      throw new Error('Token reset failed')
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
      <AdminModal
        title={t('dashboard.server.server_informations.edit_server', 'Edit Server')}
        id="edit_server"
        busy={save.pending()}
        onClose={discard}
        onCancel={discard}
      >
        <SettingGroup title={t('settings.server_identity', 'Identity and visibility')} icon="server">
          <For each={fields.slice(0, 3)}>
            {([key, label, fallback]) => (
              <FormField id={`server-edit-${key}`} label={t(`dashboard.server.server_informations.${label}`, fallback)}>
                <input
                  id={`server-edit-${key}`}
                  type="text"
                  class="input w-full"
                  disabled={save.pending()}
                  value={draft()[key]}
                  onInput={(event) => setDraft((previous) => ({ ...previous, [key]: event.currentTarget.value }))}
                />
              </FormField>
            )}
          </For>
          <FormField
            id="server-edit-public"
            label={t('dashboard.server.server_informations.server_public', 'Public')}
            description={t(
              'settings.server_public_hint',
              'Choose whether this server appears in the public server ranking.',
            )}
          >
            <select
              id="server-edit-public"
              aria-describedby="server-edit-public-description"
              disabled={save.pending()}
              class="select w-full"
              value={draft().isPublic ? 'true' : 'false'}
              onChange={(e) => {
                setDraft((previous) => ({ ...previous, isPublic: e.currentTarget.value === 'true' }))
              }}
            >
              <option value="true">{t('dashboard.server.server_informations.yes', 'Yes')}</option>
              <option value="false">{t('dashboard.server.server_informations.no', 'No')}</option>
            </select>
          </FormField>
        </SettingGroup>
        <SettingGroup title={t('settings.server_connection', 'Connection details')} icon="link">
          <For each={fields.slice(3)}>
            {([key, label, fallback]) => (
              <FormField id={`server-edit-${key}`} label={t(`dashboard.server.server_informations.${label}`, fallback)}>
                <input
                  id={`server-edit-${key}`}
                  type="text"
                  class="input w-full"
                  disabled={save.pending()}
                  value={draft()[key]}
                  onInput={(event) => setDraft((previous) => ({ ...previous, [key]: event.currentTarget.value }))}
                />
              </FormField>
            )}
          </For>
        </SettingGroup>
        <FormActions
          pending={save.pending()}
          error={save.error()}
          saveLabel={t('dashboard.server.server_informations.save_changes', 'Save')}
          onSave={() => {
            void save.run(editServer).then((saved) => {
              if (saved) closeDialog('edit_server')
            })
          }}
          onCancel={() => closeDialog('edit_server')}
        />
      </AdminModal>

      <AdminPanel
        title={t('dashboard.server.server_informations.informations', 'Informations')}
        description={t(
          'dashboard.server.server_informations.informations_description',
          'Here you can see some informations about your server, and edit some of them.',
        )}
        icon="server"
        actions={
          <Button
            variant="primary"
            disabled={action.pending()}
            onClick={() => {
              discard()
              showDialog('edit_server')
            }}
          >
            {t('dashboard.server.server_informations.edit_server', 'Edit Server')}
          </Button>
        }
      >
        <SettingGroup title={t('settings.server_identity', 'Identity and visibility')} icon="server">
          <SettingRow title={t('dashboard.server.server_informations.server_name', 'Name')}>
            <span>{server().name}</span>
          </SettingRow>
          <SettingRow title={t('dashboard.server.server_informations.server_description', 'Description')}>
            <span>{server().description}</span>
          </SettingRow>
          <SettingRow title={t('dashboard.server.server_informations.server_logo', 'Logo')}>
            <img class="w-10 h-10 rounded-lg object-cover" src={server().image || defaultServer} alt="Server Logo" />
          </SettingRow>
          <SettingRow
            title={t('dashboard.server.server_informations.server_public', 'Server Public') + ':'}
            description={t(
              'settings.server_public_hint',
              'Choose whether this server appears in the public server ranking.',
            )}
          >
            <span>
              {server().isPublic
                ? t('dashboard.server.server_informations.yes', 'Yes')
                : t('dashboard.server.server_informations.no', 'No')}
            </span>
          </SettingRow>
        </SettingGroup>
        <SettingGroup title={t('settings.server_connection', 'Connection details')} icon="link">
          <SettingRow title={t('dashboard.server.server_informations.server_ip', 'IP')}>
            <code>{server().ip + ':' + server().port}</code>
          </SettingRow>
          <SettingRow title={t('dashboard.server.server_informations.server_id', 'ID')}>
            <code>{server().id}</code>
          </SettingRow>
          <SettingRow title={t('dashboard.server.server_informations.server_token', 'Token')}>
            <Button
              variant="ghost"
              size="sm"
              class="max-w-full break-all whitespace-normal"
              onClick={() => setShowToken(!showToken())}
            >
              {showToken() ? server().token : t('dashboard.server.server_informations.show_token', 'Click to Show')}
            </Button>
          </SettingRow>
        </SettingGroup>
      </AdminPanel>
      <AdminPanel
        title={t('dashboard.server.server_informations.connection_status_title', 'Connection Status')}
        description={t(
          'dashboard.server.server_informations.connection_status_description',
          'Here you can see the connection status of your server.',
        )}
        type="none"
      >
        <div class="grid grid-cols-1 xl:grid-cols-3 gap-4 p-5">
          <article class="min-w-0 rounded-xl border border-base-200 p-4">
            <div class="flex items-center gap-3 mb-3">
              <div class="font-semibold text-sm">
                {t('dashboard.server.server_informations.http_request_title', 'HTTP Request')}
              </div>
              <div class="ml-auto flex items-center justify-center">
                <Icon
                  name="arrow-down-to-line"
                  size={22}
                  class={` ${isValidHTTPRequest() ? 'text-success' : 'text-error'} text-3xl`}
                />
              </div>
            </div>
            <div class="text-xs leading-relaxed text-base-content/60">
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
          </article>
          <article class="min-w-0 rounded-xl border border-base-200 p-4">
            <div class="flex items-center gap-3 mb-3">
              <div class="font-semibold text-sm">
                {t('dashboard.server.server_informations.websocket_title', 'WebSocket')}
              </div>
              <div class="ml-auto flex items-center justify-center">
                <Icon
                  name="arrow-left-right"
                  size={22}
                  class={` ${isValidWSConnection() ? 'text-success' : 'text-error'} text-3xl`}
                />
              </div>
            </div>
            <div class="text-xs leading-relaxed text-base-content/60">
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
          </article>
          <article class="min-w-0 rounded-xl border border-base-200 p-4">
            <div class="flex items-center gap-3 mb-3">
              <div class="font-semibold text-sm">
                {t('dashboard.server.server_informations.version_title', 'Version')}
              </div>
              <div class="ml-auto flex items-center justify-center">
                <Icon
                  name="tag"
                  size={22}
                  class={` ${!isValidHTTPRequest() ? 'text-warning' : isValidVersion() ? 'text-success' : 'text-error'} text-3xl`}
                />
              </div>
            </div>
            <div class="text-xs leading-relaxed text-base-content/60">
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
          </article>
        </div>
      </AdminPanel>
      <AdminPanel title={t('settings.server_sensitive', 'Sensitive actions')} icon="triangle-alert">
        <div class="settings-danger">
          <SettingRow
            title={t('dashboard.server.server_informations.server_token', 'Token')}
            description={t(
              'settings.server_reset_hint',
              'Generate a new token, then update it in your Garry’s Mod configuration.',
            )}
          >
            <Button variant="warning" loading={action.pending()} onClick={() => void action.run(resetServerToken)}>
              {t('dashboard.server.server_informations.reset_server_token', 'Reset Server Token')}
            </Button>
          </SettingRow>
          <SettingRow
            title={t('settings.server_removal', 'Remove server')}
            description={t('settings.server_delete_hint', 'Remove this server from the community and its dashboard.')}
          >
            <Button variant="danger" loading={action.pending()} onClick={() => void action.run(deleteServer)}>
              {t('dashboard.server.server_informations.delete_server', 'Delete Server')}
            </Button>
          </SettingRow>
        </div>
        <Show when={action.error()}>
          <p role="alert" class="text-error">
            {action.error()}
          </p>
        </Show>
      </AdminPanel>
    </>
  )
}

export default ServerInformations
