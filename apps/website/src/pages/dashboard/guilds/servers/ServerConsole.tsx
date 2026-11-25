import { createEffect, createMemo, createSignal, onCleanup, Show, untrack } from 'solid-js'
import { useParams } from '@solidjs/router'
import {
  ConsoleOutputSchema,
  ConsoleSubscriptionSchema,
  ConsoleRconRequestSchema,
  ConsoleRconResponseSchema,
} from '@gmod/schema/gmod/ConsoleStreamSchema.js'
import AdminPanel from '../../../../components/AdminPanel.js'
import { useFeatureAccess } from '../../../../components/AccessProvider.js'
import { FeatureGate } from '../../../../components/FeatureGate.js'
import { Button, FormField, IconButton, StatusBadge } from '../../../../components/ui/index.js'
import { createAsyncAction } from '../../../../hooks/createAsyncAction.js'
import { useDraftGuard } from '../../../../hooks/draftRegistry.js'
import { useI18n } from '../../../../i18n.js'
import { webSocketSignal } from '../../../../utils/websocket.js'
import { fetchAPI } from '../../../../utils/api.js'
import { authSession } from '../../../../utils/authClient.js'

type StreamState = 'connecting' | 'pending' | 'live' | 'server_offline' | 'unavailable' | 'forbidden'
const MAX_LINES = 2000
// A UTF-16 code unit takes at most four UTF-8 bytes, keeping this local buffer below 512 KiB.
const MAX_CHARACTERS = 128 * 1024
const RENEW_MS = 10_000
const ACK_TIMEOUT_MS = 8_000
type CommandIntent = {
  guildID: string
  serverID: string
  sessionID: string
  userID: string
  generation: number
  requestID: string
  command: string
  rawDraft: string
}
type CommandFeedback = { status: 'executed' | 'rejected' | 'unknown'; code: string }

export default function ServerConsole() {
  const { t } = useI18n()
  const params = useParams<{ guildID: string; serverID: string }>()
  const access = useFeatureAccess('console.rcon')
  const allowed = createMemo(() => access.allowed())
  const [state, setState] = createSignal<StreamState>('connecting')
  const [output, setOutput] = createSignal('')
  const [truncated, setTruncated] = createSignal(false)
  const [follow, setFollow] = createSignal(true)
  const [command, setCommand] = createSignal('')
  const [commandFeedback, setCommandFeedback] = createSignal<CommandFeedback | null>(null)
  const commandAction = createAsyncAction({
    errorMessage: () =>
      t(
        'server_console.delivery_unknown',
        'Command delivery could not be confirmed. Check the game server before trying again.',
      ),
  })
  let commandGeneration = 0
  let commandController: AbortController | undefined
  let viewport: HTMLPreElement | undefined
  let retry = () => {}

  const commandValidation = createMemo(() =>
    ConsoleRconRequestSchema.safeParse({
      requestID: '00000000-0000-4000-8000-000000000000',
      command: command(),
    }),
  )
  const currentSession = () => authSession()
  const canCommand = () => allowed() && state() === 'live' && !!currentSession()?.session.id && !commandAction.pending()
  const commandScope = createMemo(() =>
    [
      params.guildID,
      params.serverID,
      authSession()?.session.id,
      authSession()?.user.id,
      authSession()?.session.actorDiscordID,
    ].join(':'),
  )
  createEffect(() => {
    commandScope()
    untrack(() => {
      commandGeneration++
      commandController?.abort()
      commandController = undefined
      setCommand('')
      setCommandFeedback(null)
      commandAction.reset()
    })
  })
  createEffect(() => {
    if (allowed()) return
    untrack(() => {
      commandGeneration++
      commandController?.abort()
      commandController = undefined
      setCommandFeedback(null)
      commandAction.reset()
    })
  })
  onCleanup(() => {
    commandGeneration++
    commandController?.abort()
  })
  useDraftGuard({ dirty: () => command().length > 0, pending: commandAction.pending, discard: () => setCommand('') })
  const matchesScope = (pending: CommandIntent) =>
    pending.generation === commandGeneration &&
    pending.serverID === params.serverID &&
    pending.guildID === params.guildID &&
    pending.sessionID === currentSession()?.session.id &&
    pending.userID === currentSession()?.user.id &&
    allowed()
  const executeCommand = async (event: SubmitEvent) => {
    event.preventDefault()
    const parsed = commandValidation()
    const session = currentSession()
    if (!canCommand() || !parsed.success || !session) return
    const pending: CommandIntent = {
      guildID: params.guildID,
      serverID: params.serverID,
      sessionID: session.session.id,
      userID: session.user.id,
      generation: commandGeneration,
      requestID: crypto.randomUUID(),
      command: parsed.data.command,
      rawDraft: command(),
    }
    setCommandFeedback(null)
    commandAction.reset()
    const controller = new AbortController()
    commandController = controller
    await commandAction.run(async () => {
      try {
        const response = await fetchAPI(
          `/v6/guilds/${encodeURIComponent(pending.guildID)}/servers/${encodeURIComponent(pending.serverID)}/console/commands`,
          'POST',
          { requestID: pending.requestID, command: pending.command },
          { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]) },
        )
        if (!matchesScope(pending)) throw new Error('Command scope changed')
        if (!response.ok) {
          const failure: unknown = await response.json().catch(() => undefined)
          if (!matchesScope(pending)) throw new Error('Command scope changed')
          const code =
            failure &&
            typeof failure === 'object' &&
            'error' in failure &&
            failure.error &&
            typeof failure.error === 'object' &&
            'code' in failure.error
              ? failure.error.code
              : undefined
          if (
            typeof code === 'string' &&
            [
              'invalid_request',
              'request_conflict',
              'request_pending',
              'command_in_progress',
              'server_offline',
              'rate_limited',
              'console_unavailable',
              'upgrade_required',
              'entitlement_unknown',
            ].includes(code)
          )
            setCommandFeedback({ status: 'rejected', code })
          else if (response.status === 401 || response.status === 403)
            setCommandFeedback({ status: 'rejected', code: 'permission_denied' })
          throw new Error('Command request failed')
        }
        const parsed = ConsoleRconResponseSchema.safeParse(await response.json())
        if (!matchesScope(pending)) throw new Error('Command scope changed')
        if (!parsed.success || parsed.data.serverID !== pending.serverID || parsed.data.requestID !== pending.requestID)
          throw new Error('Invalid command acknowledgement')
        setCommandFeedback({ status: parsed.data.status, code: parsed.data.code })
        if (parsed.data.status === 'executed' && command() === pending.rawDraft) setCommand('')
      } catch (error) {
        if (matchesScope(pending) && !commandFeedback())
          setCommandFeedback({ status: 'unknown', code: 'delivery_uncertain' })
        throw error
      } finally {
        if (commandController === controller) commandController = undefined
      }
    })
  }
  const commandMessage = () => {
    const result = commandFeedback()
    if (result?.status === 'executed')
      return t(
        'server_console.command_executed',
        'The game console accepted the command. This acknowledgement does not include its output or confirm its effects.',
      )
    if (result?.status === 'unknown')
      return t(
        'server_console.delivery_unknown',
        'Command delivery could not be confirmed. Check the game server before trying again.',
      )
    if (result?.code === 'server_offline')
      return t('server_console.command_offline', 'The game server is offline. Your draft is preserved.')
    if (result?.code === 'rate_limited')
      return t(
        'server_console.command_rate_limited',
        'Too many command requests. Wait before trying again; your draft is preserved.',
      )
    if (['request_pending', 'command_in_progress', 'request_conflict'].includes(result?.code || ''))
      return t(
        'server_console.command_pending',
        'A command request is already pending or was previously used. Check the game server before sending another command.',
      )
    if (['console_unavailable', 'entitlement_unknown'].includes(result?.code || ''))
      return t(
        'server_console.command_unavailable',
        'Console execution is temporarily unavailable. Your draft is preserved.',
      )
    if (result?.code === 'permission_denied')
      return t(
        'server_console.command_permission',
        'Your dashboard access does not allow console commands on this server.',
      )
    if (result?.code === 'expired')
      return t('server_console.command_expired', 'The command expired before execution. Your draft is preserved.')
    return t('server_console.command_rejected', 'The game server rejected the command. Your draft is preserved.')
  }

  const clear = () => {
    setOutput('')
    setTruncated(false)
  }
  const append = (chunk: string) => {
    setOutput((previous) => {
      let next = previous + chunk
      if (next.length > MAX_CHARACTERS) {
        next = next.slice(-MAX_CHARACTERS)
        // Do not leave an isolated low surrogate at the beginning of the retained text.
        if (next.charCodeAt(0) >= 0xdc00 && next.charCodeAt(0) <= 0xdfff) next = next.slice(1)
        setTruncated(true)
      }
      const lines = next.split('\n')
      if (lines.length > MAX_LINES) {
        next = lines.slice(-MAX_LINES).join('\n')
        setTruncated(true)
      }
      return next
    })
  }
  createEffect(() => {
    output()
    if (follow())
      queueMicrotask(() => {
        if (viewport && follow()) viewport.scrollTop = viewport.scrollHeight
      })
  })

  createEffect(() => {
    const serverID = params.serverID
    const socket = webSocketSignal()
    const permitted = allowed()
    clear()
    retry = () => {}
    if (!permitted) {
      setState('forbidden')
      return
    }
    setState('connecting')
    if (!socket || !serverID || !/^[\w-]{1,255}$/.test(serverID)) return

    let active = true
    let suspended = false
    let denied = false
    let acknowledged = false
    let subscribed = false
    let awaiting = false
    let renewal: ReturnType<typeof setInterval> | undefined
    let ackTimeout: ReturnType<typeof setTimeout> | undefined
    const clearAck = () => {
      clearTimeout(ackTimeout)
      ackTimeout = undefined
      awaiting = false
    }
    const stopRenewal = () => {
      clearInterval(renewal)
      renewal = undefined
      clearAck()
    }
    const send = (action: 'console_subscribe' | 'console_unsubscribe') => {
      if (socket.readyState !== WebSocket.OPEN) return false
      try {
        socket.send(JSON.stringify({ action, data: { serverID } }))
        return true
      } catch {
        return false
      }
    }
    const unsubscribe = () => {
      if (subscribed) send('console_unsubscribe')
      subscribed = false
      acknowledged = false
    }
    const subscribe = () => {
      if (!active || suspended || denied || awaiting || socket.readyState !== WebSocket.OPEN) return
      if (!acknowledged) setState('pending')
      awaiting = true
      ackTimeout = setTimeout(() => {
        awaiting = false
        acknowledged = false
        setState('unavailable')
      }, ACK_TIMEOUT_MS)
      if (send('console_subscribe')) subscribed = true
      else {
        clearAck()
        acknowledged = false
        setState('unavailable')
      }
    }
    const start = () => {
      if (!active || suspended) return
      if (renewal === undefined) renewal = setInterval(subscribe, RENEW_MS)
      subscribe()
    }
    const onMessage = (event: MessageEvent) => {
      if (!active || suspended || denied || typeof event.data !== 'string' || event.data.length > 256 * 1024) return
      let packet: unknown
      try {
        packet = JSON.parse(event.data)
      } catch {
        return
      }
      const subscription = ConsoleSubscriptionSchema.safeParse(packet)
      if (subscription.success && subscription.data.serverID === serverID) {
        clearAck()
        acknowledged = subscription.data.enabled
        if (subscription.data.enabled) setState('live')
        else {
          const error = subscription.data.error || 'unavailable'
          setState(error)
          if (error === 'forbidden') {
            denied = true
            stopRenewal()
            unsubscribe()
            clear()
          }
        }
        return
      }
      const message = ConsoleOutputSchema.safeParse(packet)
      if (acknowledged && message.success && message.data.serverID === serverID) append(message.data.data.data)
    }
    const onClose = () => {
      stopRenewal()
      subscribed = false
      acknowledged = false
      setState('connecting')
    }
    const onPageHide = () => {
      suspended = true
      stopRenewal()
      unsubscribe()
      clear()
      setState('connecting')
    }
    const onPageShow = () => {
      suspended = false
      start()
    }
    retry = () => {
      denied = false
      start()
    }
    socket.addEventListener('open', start)
    socket.addEventListener('message', onMessage)
    socket.addEventListener('close', onClose)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('pageshow', onPageShow)
    if (socket.readyState === WebSocket.OPEN) start()
    onCleanup(() => {
      active = false
      stopRenewal()
      unsubscribe()
      socket.removeEventListener('open', start)
      socket.removeEventListener('message', onMessage)
      socket.removeEventListener('close', onClose)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('pageshow', onPageShow)
      retry = () => {}
    })
  })

  const status = () => {
    switch (state()) {
      case 'live':
        return t('server_console.live', 'Live')
      case 'pending':
        return t('server_console.starting', 'Starting the stream…')
      case 'server_offline':
        return t('server_console.offline', 'Game server offline')
      case 'unavailable':
        return t('server_console.unavailable', 'The console stream is temporarily unavailable.')
      case 'forbidden':
        return t('server_console.forbidden', 'Access to this console is unavailable.')
      default:
        return t('server_console.connecting', 'Waiting for the dashboard connection…')
    }
  }
  return (
    <>
      <AdminPanel
        title={t('server_console.title', 'Live server console')}
        description={t(
          'server_console.description',
          'Read Lua messages from your game server while this page is open. The stream stops when you leave this page; previous output is not stored.',
        )}
        icon="monitor"
        actions={
          <Button variant="ghost" onClick={clear} disabled={!output()}>
            {t('server_console.clear', 'Clear output')}
          </Button>
        }
      >
        <FeatureGate capability="console.rcon" showQuota={false}>
          <div class="flex min-w-0 flex-col gap-4">
            <p class="text-sm text-base-content/65">
              {t(
                'server_console.requirements',
                'Requires an up-to-date game addon. Only Lua output is shown here; native command output remains in the game server console.',
              )}
            </p>
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div role="status" class="flex flex-wrap items-center gap-2">
                <StatusBadge
                  tone={
                    state() === 'live'
                      ? 'success'
                      : state() === 'unavailable' || state() === 'server_offline'
                        ? 'warning'
                        : 'neutral'
                  }
                >
                  {status()}
                </StatusBadge>
                <Show when={allowed() && ['unavailable', 'server_offline', 'forbidden'].includes(state())}>
                  <Button size="sm" variant="ghost" onClick={() => retry()}>
                    {t('ui.retry', 'Try again')}
                  </Button>
                </Show>
              </div>
              <label class="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  class="toggle toggle-sm"
                  checked={follow()}
                  onChange={(event) => setFollow(event.currentTarget.checked)}
                />
                {t('server_console.follow', 'Follow new output')}
              </label>
            </div>
            <pre
              ref={viewport}
              role="log"
              aria-live="off"
              aria-label={t('server_console.output', 'Console output')}
              tabIndex={0}
              class="min-h-80 max-h-[65vh] w-full min-w-0 overflow-auto whitespace-pre-wrap rounded-lg border border-base-300 bg-base-200 p-4 font-mono text-sm text-base-content [overflow-wrap:anywhere]"
            >
              {output() || t('server_console.empty', 'New console output will appear here once the stream is active.')}
            </pre>
            <Show when={truncated()}>
              <p class="text-sm text-base-content/65">
                {t(
                  'server_console.truncated',
                  'Older output was removed to keep the viewer responsive. Up to 2,000 recent lines are kept, within a limit of 131,072 characters.',
                )}
              </p>
            </Show>
            <form class="flex min-w-0 flex-col gap-3 border-t border-base-300 pt-4" onSubmit={executeCommand}>
              <FormField
                id="server-console-command-input"
                label={t('server_console.command', 'Console command')}
                description={t(
                  'server_console.command_help',
                  'Dashboard administrators with access to this server can execute console commands. Press Enter or use the button to run the command.',
                )}
                error={
                  command().length > 0 && !commandValidation().success
                    ? t(
                        'server_console.command_invalid',
                        'Enter one nonblank command of up to 8,192 UTF-8 bytes, without line breaks or NUL.',
                      )
                    : undefined
                }
              >
                <div class="flex min-w-0 items-center gap-2">
                  <input
                    id="server-console-command-input"
                    class="input min-w-0 flex-1 font-mono"
                    type="text"
                    maxLength={8192}
                    autocomplete="off"
                    spellcheck={false}
                    aria-describedby={`server-console-command-input-description${command().length > 0 && !commandValidation().success ? ' server-console-command-input-error' : ''}`}
                    aria-invalid={command().length > 0 && !commandValidation().success}
                    value={command()}
                    onInput={(event) => setCommand(event.currentTarget.value)}
                  />
                  <IconButton
                    type="submit"
                    icon={commandAction.pending() ? undefined : 'send'}
                    label={t('server_console.execute', 'Execute command')}
                    variant="primary"
                    size="md"
                    loading={commandAction.pending()}
                    disabled={!canCommand() || !commandValidation().success}
                  />
                </div>
              </FormField>
              <Show when={commandFeedback()}>
                <p
                  role={commandFeedback()?.status === 'executed' ? 'status' : 'alert'}
                  class={commandFeedback()?.status === 'executed' ? 'text-sm text-success' : 'text-sm text-warning'}
                >
                  {commandMessage()}
                </p>
              </Show>
            </form>
          </div>
        </FeatureGate>
      </AdminPanel>
    </>
  )
}
