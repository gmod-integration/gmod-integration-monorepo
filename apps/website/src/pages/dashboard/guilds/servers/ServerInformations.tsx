import { showDialog } from '../../../../utils/dialog.js'
import { type Component, createEffect, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { getServer } from '../../../../utils/utils.js'
import { sendWebSocketMessage, webSocketServerStatus } from '../../../../utils/websocket.js'
import { useNavigate, useParams } from '@solidjs/router'
import ConfirmActionDialog from '../../../../components/ConfirmActionDialog.js'
import AdminPanel from '../../../../components/AdminPanel.js'
import defaultServer from '../../../../assets/defaultServer.png'
import { useI18n } from '../../../../i18n.js'
import { fetchAPI } from '../../../../utils/api.js'
import { Button, CopyableValue, FormActions, Icon, SettingGroup, SettingRow } from '../../../../components/ui/index.js'
import { createDraftForm } from '../../../../hooks/createDraftForm.js'

const ServerInformations: Component = () => {
  const { t } = useI18n()
  const navigate = useNavigate()
  const params = useParams()
  const [server, setServer] = createSignal(getServer())
  const [showToken, setShowToken] = createSignal(false)
  const idCommand = () => `gmod-integration config set id "${server().id || ''}"`
  const tokenCommand = () => `gmod-integration config set token "${server().token || ''}"`
  const editable = (value: ReturnType<typeof getServer>) => ({
    name: value.name || '',
    description: value.description || '',
    image: value.image || '',
    ip: value.ip || '',
    port: String(value.port || ''),
    isPublic: value.isPublic === true,
  })
  const editor = createDraftForm({
    initial: editable(server()),
    validate: (draft) => ({
      ...(!draft.name.trim() ? { name: t('ui.required', 'This field is required.') } : {}),
      ...(draft.port && (!/^\d+$/.test(draft.port) || Number(draft.port) < 1 || Number(draft.port) > 65535)
        ? { port: t('settings.server_port_invalid', 'Enter a port between 1 and 65535.') }
        : {}),
      ...(draft.image && !/^https?:\/\/\S+$/i.test(draft.image)
        ? { image: t('settings.image_url_invalid', 'Enter an HTTP or HTTPS image URL.') }
        : {}),
    }),
    errorMessage: () => t('ui.save_error', 'Unable to save. Please try again.'),
  })
  const fields = [
    ['name', 'server_name', 'Name'],
    ['description', 'server_description', 'Description'],
    ['image', 'server_image', 'Image'],
    ['ip', 'server_ip', 'IP'],
    ['port', 'server_port', 'Port'],
  ] as const
  const persistServer = (updated: ReturnType<typeof getServer>) => {
    setServer(updated)
    localStorage.setItem('server', JSON.stringify(updated))
  }
  const deleteServer = async () => {
    const response = await fetchAPI(`/users/:discordID/guilds/:guildID/servers/${server().id}`, 'DELETE')
    if (!response.ok) throw new Error('Server deletion failed')
    editor.discard()
    localStorage.removeItem('server')
  }
  const editServer = async () => {
    await editor.save(async (snapshot) => {
      const response = await fetchAPI(`/users/:discordID/guilds/:guildID/servers/${server().id}`, 'PUT', {
        ...snapshot,
        name: snapshot.name.trim(),
      })
      if (!response.ok) throw new Error('Server update failed')
      const updated = { ...server(), ...(await response.json()) }
      persistServer(updated)
      return editable(updated)
    })
  }
  const resetServerToken = async () => {
    const response = await fetchAPI(`/users/:discordID/guilds/:guildID/servers/${server().id}/token`, 'POST')
    if (!response.ok) throw new Error('Token reset failed')
    persistServer({ ...server(), ...(await response.json()) })
    setShowToken(false)
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
      <ConfirmActionDialog
        id="reset-server-token"
        title={t('dashboard.server.server_informations.reset_server_token', 'Reset Server Token')}
        description={`${server().name} — ${t('settings.server_reset_confirm', 'The current token will stop working. Update it in your Garry’s Mod configuration after resetting it.')}`}
        confirmLabel={t('dashboard.server.server_informations.reset_server_token', 'Reset Server Token')}
        variant="warning"
        onConfirm={resetServerToken}
      />
      <ConfirmActionDialog
        id="delete-server"
        title={t('dashboard.server.server_informations.delete_server', 'Delete Server')}
        description={`${server().name} — ${t('settings.server_delete_confirm', 'Remove this server and its dashboard data. This cannot be undone.')}`}
        confirmLabel={t('dashboard.server.server_informations.delete_server', 'Delete Server')}
        onConfirm={deleteServer}
        onSuccess={() => navigate(`/dashboard/guilds/${params.guildID}/config/servers`)}
      />
      <AdminPanel
        title={t('dashboard.server.server_informations.informations', 'Server details')}
        description={t(
          'settings.server_edit_help',
          'Edit the server identity and connection details, then save your changes together.',
        )}
        icon="server"
      >
        <SettingGroup title={t('settings.server_identity', 'Identity and visibility')} icon="server">
          <For each={fields.slice(0, 3)}>
            {([key, label, fallback]) => (
              <SettingRow
                controlId={`server-edit-${key}`}
                title={t(`dashboard.server.server_informations.${label}`, fallback)}
                description={t(`dashboard.server.server_informations.${label}_hint`)}
                feedback={
                  editor.errors()[key] && (
                    <p role="alert" id={`server-edit-${key}-error`} class="text-error text-sm">
                      {editor.errors()[key]}
                    </p>
                  )
                }
              >
                <input
                  id={`server-edit-${key}`}
                  type={key === 'image' ? 'url' : 'text'}
                  class="input w-full"
                  disabled={editor.pending()}
                  value={editor.draft()[key]}
                  aria-invalid={!!editor.errors()[key]}
                  aria-describedby={`server-edit-${key}-description${editor.errors()[key] ? ` server-edit-${key}-error` : ''}`}
                  onInput={(event) => editor.patch({ [key]: event.currentTarget.value })}
                />
              </SettingRow>
            )}
          </For>
          <SettingRow title={t('dashboard.server.server_informations.server_logo', 'Logo')}>
            <img
              class="w-10 h-10 rounded-lg object-cover"
              src={editor.draft().image || defaultServer}
              alt={t('dashboard.server.server_informations.server_logo', 'Server logo')}
            />
          </SettingRow>
          <SettingRow
            controlId="server-edit-public"
            title={t('dashboard.server.server_informations.server_public', 'Show in server ranking')}
            description={t(
              'settings.server_public_hint',
              'Choose whether this server appears in the public server ranking.',
            )}
          >
            <input
              id="server-edit-public"
              type="checkbox"
              class="toggle"
              disabled={editor.pending()}
              checked={editor.draft().isPublic}
              aria-describedby="server-edit-public-description"
              onChange={(event) => editor.patch({ isPublic: event.currentTarget.checked })}
            />
          </SettingRow>
        </SettingGroup>
        <SettingGroup
          title={t('settings.server_connection', 'Connection details')}
          description={t(
            'dashboard.server.server_informations.connection_help',
            'Enter the address players use to join. These values describe your server; they do not change its hosting configuration.',
          )}
          icon="link"
        >
          <For each={fields.slice(3)}>
            {([key, label, fallback]) => (
              <SettingRow
                controlId={`server-edit-${key}`}
                title={t(`dashboard.server.server_informations.${label}`, fallback)}
                feedback={
                  editor.errors()[key] && (
                    <p role="alert" id={`server-edit-${key}-error`} class="text-error text-sm">
                      {editor.errors()[key]}
                    </p>
                  )
                }
              >
                <input
                  id={`server-edit-${key}`}
                  class="input w-full"
                  type="text"
                  inputmode={key === 'port' ? 'numeric' : undefined}
                  disabled={editor.pending()}
                  value={editor.draft()[key]}
                  aria-invalid={!!editor.errors()[key]}
                  aria-describedby={editor.errors()[key] ? `server-edit-${key}-error` : undefined}
                  onInput={(event) => editor.patch({ [key]: event.currentTarget.value })}
                />
              </SettingRow>
            )}
          </For>
        </SettingGroup>
        <FormActions
          dirty={editor.dirty()}
          pending={editor.pending()}
          error={editor.error()}
          success={editor.success()}
          disabled={!editor.valid()}
          onSave={() => void editServer()}
          onCancel={editor.discard}
        />
      </AdminPanel>
      <AdminPanel
        title={t('server_setup.title', 'Connect the Gmod Integration addon')}
        description={t(
          'server_setup.description',
          'Once the addon is installed, run these commands one at a time in your Garry’s Mod server console, available from your hosting panel.',
        )}
        icon="link"
      >
        <SettingGroup
          title={t('server_setup.credentials', 'Server credentials')}
          description={t(
            'server_setup.credentials_help',
            'The ID identifies this server in Gmod Integration. The token authorizes the addon to connect; keep it private.',
          )}
          icon="id-card"
        >
          <SettingRow title={t('dashboard.server.server_informations.server_id', 'Gmod Integration server ID')}>
            <CopyableValue value={server().id || ''} label={t('server_setup.copy_id', 'Copy server ID')} />
          </SettingRow>
          <SettingRow title={t('dashboard.server.server_informations.server_token', 'Connection token')}>
            <div class="flex min-w-0 flex-wrap items-center gap-2">
              <CopyableValue
                value={server().token || ''}
                display={showToken() ? server().token : '••••••••••••••••'}
                label={t('server_setup.copy_token', 'Copy server token')}
              />
              <Button variant="ghost" size="sm" onClick={() => setShowToken(!showToken())}>
                <Icon name={showToken() ? 'eye-off' : 'eye'} size={16} />
                {showToken()
                  ? t('dashboard.server.server_informations.hide_token', 'Hide Token')
                  : t('dashboard.server.server_informations.show_token', 'Show Token')}
              </Button>
            </div>
          </SettingRow>
        </SettingGroup>
        <SettingGroup title={t('server_setup.commands', 'Console commands')} icon="scroll-text">
          <SettingRow title={t('server_setup.set_id', '1. Set the server ID')} stacked>
            <CopyableValue
              value={idCommand()}
              disabled={!server().id}
              label={t('server_setup.copy_id_command', 'Copy the server ID command')}
              multiline
              class="w-full"
            />
          </SettingRow>
          <SettingRow
            title={t('server_setup.set_token', '2. Set the server token')}
            description={t(
              'server_setup.token_hint',
              'Copying this command includes your token, even when it is hidden.',
            )}
            stacked
          >
            <CopyableValue
              value={tokenCommand()}
              display={showToken() ? tokenCommand() : 'gmod-integration config set token "••••••••••••••••"'}
              disabled={!server().token}
              label={t('server_setup.copy_token_command', 'Copy the server token command')}
              multiline
              class="w-full"
            />
          </SettingRow>
          <SettingRow title={t('server_setup.test', '3. Test the connection')} stacked>
            <CopyableValue
              value="gmod-integration config try"
              label={t('server_setup.copy_test_command', 'Copy the connection test command')}
              multiline
              class="w-full"
            />
          </SettingRow>
          <p class="text-sm text-base-content/60">
            {t(
              'server_setup.saved_hint',
              'The addon saves these settings immediately and automatically tests the connection once both credentials are set.',
            )}
          </p>
          <details class="rounded-lg border border-base-200 p-3">
            <summary class="cursor-pointer text-sm font-medium">{t('server_setup.diagnostics', 'Diagnostics')}</summary>
            <div class="mt-3 flex min-w-0 flex-col gap-3">
              <SettingRow title={t('server_setup.help', 'Check connection status and available commands')} stacked>
                <CopyableValue
                  value="gmod-integration help"
                  label={t('server_setup.copy_help_command', 'Copy the diagnostics command')}
                  multiline
                  class="w-full"
                />
              </SettingRow>
              <SettingRow title={t('server_setup.version', 'Check the installed addon version')} stacked>
                <CopyableValue
                  value="gmod-integration version"
                  label={t('server_setup.copy_version_command', 'Copy the version command')}
                  multiline
                  class="w-full"
                />
              </SettingRow>
            </div>
          </details>
        </SettingGroup>
      </AdminPanel>
      <AdminPanel
        title={t('dashboard.server.server_informations.connection_status_title', 'Addon connection')}
        description={t(
          'dashboard.server.server_informations.connection_status_description',
          'Check whether the addon is communicating with Gmod Integration. Each indicator checks a different part of the connection.',
        )}
        type="none"
      >
        <div class="grid grid-cols-1 xl:grid-cols-3 gap-4 p-5">
          <article class="min-w-0 rounded-xl border border-base-200 p-4">
            <div class="flex items-center gap-3 mb-3">
              <div class="font-semibold text-sm">
                {t('dashboard.server.server_informations.http_request_title', 'Recent server activity')}
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
                      'No request has been received from the addon in the last minute. Check that the server is running and that you installed the',
                    )}{' '}
                    <a href="/workshop" class="link">
                      {t('dashboard.server.server_informations.workshop_content', 'workshop content')}
                    </a>{' '}
                    {t(
                      'dashboard.server.server_informations.http_request_fallback_part2',
                      'and entered the correct server ID and token. See the',
                    )}{' '}
                    <a href="/docs/getting-started/configuration" class="link">
                      {t('dashboard.server.server_informations.documentation', 'documentation')}
                    </a>{' '}
                    {t('dashboard.server.server_informations.http_request_fallback_part3', 'for setup instructions.')}
                  </p>
                }
              >
                <p>
                  {t(
                    'dashboard.server.server_informations.http_request_success',
                    'A request was received from the addon within the last minute.',
                  )}
                </p>
              </Show>
            </div>
          </article>
          <article class="min-w-0 rounded-xl border border-base-200 p-4">
            <div class="flex items-center gap-3 mb-3">
              <div class="font-semibold text-sm">
                {t('dashboard.server.server_informations.websocket_title', 'Live connection (WebSocket)')}
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
                      'The live connection is unavailable. Features that require it cannot operate. Check the addon connection and install the',
                    )}{' '}
                    <a href="/docs/getting-started/installation#dll" class="link">
                      {t('dashboard.server.server_informations.gwsocket_module', 'GWSockets module')}
                    </a>{' '}
                    {t(
                      'dashboard.server.server_informations.websocket_fallback_part2',
                      'if it is missing from your game server.',
                    )}
                  </p>
                }
              >
                <p>
                  {t(
                    'dashboard.server.server_informations.websocket_success',
                    'The addon has a live connection. Features that need real-time communication can use it.',
                  )}
                </p>
              </Show>
            </div>
          </article>
          <article class="min-w-0 rounded-xl border border-base-200 p-4">
            <div class="flex items-center gap-3 mb-3">
              <div class="font-semibold text-sm">
                {t('dashboard.server.server_informations.version_title', 'Addon version')}
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
                      'The addon version cannot be checked without recent server activity. Check that you installed the',
                    )}{' '}
                    <a href="/workshop" class="link">
                      {t('dashboard.server.server_informations.workshop_content', 'workshop content')}
                    </a>{' '}
                    {t(
                      'dashboard.server.server_informations.version_fallback_http_part2',
                      'and entered the correct server ID and token. See the',
                    )}{' '}
                    <a href="/docs/getting-started/configuration" class="link">
                      {t('dashboard.server.server_informations.documentation', 'documentation')}
                    </a>{' '}
                    {t('dashboard.server.server_informations.version_fallback_http_part3', 'for setup instructions.')}
                  </p>
                }
              >
                <Show
                  when={isValidVersion()}
                  fallback={
                    <p>
                      {t(
                        'dashboard.server.server_informations.version_fallback_outdated',
                        'The reported addon version is outdated. Update the addon before relying on newer features. For a Workshop installation, restart the game server to apply available updates; update a GitHub or extracted installation manually.',
                      )}
                    </p>
                  }
                >
                  <p>
                    {t(
                      'dashboard.server.server_informations.version_success',
                      'The reported addon version is compatible with the current service.',
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
            title={t('dashboard.server.server_informations.server_token', 'Connection token')}
            description={t(
              'settings.server_reset_hint',
              'Generate a new token, then update it in your Garry’s Mod configuration.',
            )}
          >
            <Button variant="warning" disabled={editor.pending()} onClick={() => showDialog('reset-server-token')}>
              {t('dashboard.server.server_informations.reset_server_token', 'Reset Server Token')}
            </Button>
          </SettingRow>
          <SettingRow
            title={t('settings.server_removal', 'Remove server')}
            description={t('settings.server_delete_hint', 'Remove this server from the community and its dashboard.')}
          >
            <Button variant="danger" disabled={editor.pending()} onClick={() => showDialog('delete-server')}>
              {t('dashboard.server.server_informations.delete_server', 'Delete Server')}
            </Button>
          </SettingRow>
        </div>
      </AdminPanel>
    </>
  )
}

export default ServerInformations
