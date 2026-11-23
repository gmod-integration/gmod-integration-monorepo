import {
  AsyncState,
  Button,
  ButtonLink,
  DiscordAvatar,
  FormField,
  Icon,
  IconButton,
  StatusBadge,
  TableState,
} from '../components/ui/index.js'
import { batch, type Component, createResource, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import Pagination from '../components/Pagination.js'
import { createListPagination } from '../hooks/createListPagination.js'
import AdminPanel from '../components/AdminPanel.js'
import { getDiscordUser } from '../utils/utils'
import DashboardMiddleware from '../middleware/DashboardMiddleware'
import { useI18n } from '../i18n'
import { Errors, ShowErrorList } from '../components/layout/Errors'
import { fetchAPI, getAPIUrl, getUrlWithActualParams } from '../utils/api'
import { createAsyncAction } from '../hooks/createAsyncAction.js'
import AdminModal from '../components/AdminModal.js'
import { closeDialog, showDialog } from '../utils/dialog.js'
import { isLogged } from '../utils/event.js'
import { authSession } from '../utils/authClient.js'
import {
  clearAccountSession,
  fetchErasureStatus,
  forgetErasureReceipt,
  prepareErasureReceipt,
  readErasureReceipt,
  requestAccountErasure,
  type ErasureReceipt,
  type ErasureStatus,
} from '../utils/accountErasure.js'

type UserSession = {
  id: string
  lastSeenAt?: string
  createdAt: string
  expiresAt: string
  ip: string
  os: string
  browser: string
  country: string
  isCurrent: boolean
}

type UserDataRequest = {
  id: string
  createdAt: string
  expirationDate: string
  downloadLink: string
  code: string
}

type SteamAccount = {
  steamID64: string | null
  steamProfile: { name: string; avatarURL: string | null } | null
}

const fetchUser = async (): Promise<SteamAccount> => {
  const response = await fetchAPI('/users/:discordID/steam-profile', 'GET')
  if (!response.ok) throw new Error('Steam account unavailable')
  return await response.json()
}

const AccountSettings: Component<{ onErasureAccepted: (receipt: ErasureReceipt, status: ErasureStatus) => void }> = (
  props,
) => {
  const { t, locale } = useI18n()

  const [erasureConfirmation, setErasureConfirmation] = createSignal('')
  const erasureAction = createAsyncAction({
    errorMessage: () =>
      t(
        'account.erasure.submit_error',
        'The request could not be confirmed. Try again; the same request will be reused.',
      ),
  })
  const resetErasureDialog = () => {
    if (!erasureAction.pending()) {
      setErasureConfirmation('')
      erasureAction.reset()
    }
  }
  const submitErasure = async () => {
    if (erasureConfirmation() !== 'DELETE' || erasureAction.pending() || authSession()?.session.actorDiscordID) return
    let receipt: ErasureReceipt | undefined
    let status: ErasureStatus | undefined
    const accepted = await erasureAction.run(async () => {
      receipt = prepareErasureReceipt()
      status = await requestAccountErasure(receipt)
    })
    if (accepted && receipt && status) {
      closeDialog('account-erasure')
      props.onErasureAccepted(receipt, status)
    }
  }

  const cachedUser = getDiscordUser()
  const localUser = () => authSession()?.user ?? cachedUser
  const [user, { refetch: refetchUser }] = createResource('steamUser', fetchUser)
  const [failedSteamAvatarURL, setFailedSteamAvatarURL] = createSignal<string>()
  const steamAvatarURL = () => {
    const avatarURL = user()?.steamProfile?.avatarURL
    return avatarURL && avatarURL !== failedSteamAvatarURL() ? avatarURL : undefined
  }
  const [showRequestLoading, setShowRequestLoading] = createSignal(false)
  const [unlinkingGmodStorePurchase, setUnlinkingGmodStorePurchase] = createSignal(false)
  const sessionAction = createAsyncAction({
    errorMessage: () =>
      t(
        'account.session_error',
        'This session could not be signed out. Refresh the session list to check its status before trying again.',
      ),
  })
  const requestAction = createAsyncAction({
    errorMessage: () =>
      t(
        'account.error_create_data_request',
        'Your data export could not be prepared. Check the export list before requesting another copy.',
      ),
  })
  let requestLoadingTimer: ReturnType<typeof setTimeout> | undefined
  onCleanup(() => clearTimeout(requestLoadingTimer))

  const getVerificationToken = async () => {
    const response = await fetchAPI('/users/:discordID/verifications/token', 'GET')
    if (!response.ok) return
    const json = await response.json()
    window.location.href = getUrlWithActualParams(`${getAPIUrl(false)}/steam?verificationCode=${json.token}`)
  }

  const [gmodStorePurchase, { refetch: refetchGmodStorePurchase }] = createResource('gmodStorePurchase', async () => {
    // `res.json()` returns a Promise, which is always truthy - the fallback needs the await to
    // ever actually apply to a falsy response body instead of being permanently dead code.
    return await fetchAPI('/users/:discordID/gmod-store', 'GET').then(async (res) => (await res.json()) || {})
  })

  const [userDataRequest, { mutate: mutateUserDataRequest }] = createResource(
    'userDataRequest',
    async (): Promise<UserDataRequest[]> => {
      const response = await fetchAPI('/users/:discordID/data-requests', 'GET')
      const value: unknown = await response.json()
      return Array.isArray(value) ? value : []
    },
    { initialValue: [] },
  )

  const [userSessions, { mutate: mutateUserSessions }] = createResource(
    'userSessions',
    async (): Promise<UserSession[]> => {
      const response = await fetchAPI('/v6/auth/sessions', 'GET')
      if (!response.ok) throw new Error('Sessions unavailable')
      const value = await response.json()
      if (!value || !Array.isArray(value.sessions)) throw new Error('Invalid sessions response')
      return value.sessions
    },
    { initialValue: [] },
  )

  const sessionsPagination = createListPagination(() => (!userSessions.error ? userSessions() : undefined))
  const exportsPagination = createListPagination(() => (!userDataRequest.error ? userDataRequest() : undefined))

  async function unlinkGmodStorePurchase() {
    if (
      !window.confirm(
        t(
          'account.unlink_guild_confirmation',
          'Unlink this Discord community from your GmodStore purchase? It will lose the benefits provided by this purchase and its custom bot will disconnect. Invite the main Gmod Integration bot first to keep the integration available. The purchase remains on your account, but the custom bot token must be entered again after reactivation.',
        ),
      )
    ) {
      return
    }

    setUnlinkingGmodStorePurchase(true)
    const response = await fetchAPI(`/users/:discordID/gmod-store/${gmodStorePurchase().guild}`, 'DELETE')
    const json = await response.json().catch(() => ({}))
    setUnlinkingGmodStorePurchase(false)

    if (!response.ok) {
      Errors(
        json.error ||
          t(
            'account.unlink_guild_error',
            'The community could not be unlinked. Check its current status before trying again.',
          ),
      )
      return
    }

    await refetchGmodStorePurchase()
  }

  async function deleteUserSession(sessionID: string) {
    await sessionAction.run(async () => {
      const response = await fetchAPI(`/v6/auth/sessions/${encodeURIComponent(sessionID)}`, 'DELETE')
      if (!response.ok) throw new Error('Session deletion failed')
      mutateUserSessions((previous) => previous.filter((session) => session.id !== sessionID))
    })
  }

  async function userDataRequestCreate() {
    if (requestAction.pending()) return
    let edited = false
    let reportedError = false
    requestLoadingTimer = setTimeout(() => {
      if (edited) return
      setShowRequestLoading(true)
    }, 500)
    const saved = await requestAction.run(async () => {
      const response = await fetchAPI('/users/:discordID/data-requests', 'POST')
      const json = await response.json()
      edited = true
      setShowRequestLoading(false)
      if (response.ok) {
        const requests = [...userDataRequest(), json]
        mutateUserDataRequest(requests)
        const query = exportsPagination.query()
        exportsPagination.onChange({ ...query, offset: Math.floor((requests.length - 1) / query.limit) * query.limit })
      } else {
        Errors(
          json.error ||
            t(
              'account.error_create_data_request',
              'Your data export could not be prepared. Check the export list before requesting another copy.',
            ),
        )
        reportedError = true
        throw new Error('Data request failed')
      }
    })
    edited = true
    clearTimeout(requestLoadingTimer)
    setShowRequestLoading(false)
    if (!saved && !reportedError && requestAction.error()) Errors(requestAction.error()!)
  }

  onMount(async () => {
    if (window.location.href.includes('startVerification')) {
      await getVerificationToken()
    }
  })

  return (
    <>
      <DashboardMiddleware />
      <AdminModal
        id="account-erasure"
        title={t('account.erasure.title', 'Request account erasure')}
        busy={erasureAction.pending()}
        onClose={resetErasureDialog}
        onCancel={resetErasureDialog}
      >
        <p class="text-sm text-base-content/70">
          {t(
            'account.erasure.scope',
            'This erases your personal profiles, statistics, sessions, files and data exports.',
          )}
        </p>
        <p class="text-sm text-base-content/70">
          {t(
            'account.erasure.retained',
            'A minimal request record, global bans and reputation are retained. Communities and collective purchases remain.',
          )}
        </p>
        <p class="text-sm text-base-content/70">
          {t('account.erasure.new_account', 'Signing in again after erasure creates a new account.')}
        </p>
        <p class="text-xs text-base-content/60">
          {t(
            'account.erasure.external_copies',
            'Copies already shared on Discord or kept in backups need separate handling. Contact support for these copies.',
          )}
        </p>
        <FormField
          id="account-erasure-confirmation"
          label={t('account.erasure.confirmation', 'Type DELETE to confirm')}
          description={t(
            'account.erasure.signout',
            'You will be signed out when the request is accepted. This browser keeps a receipt so you can follow its progress.',
          )}
        >
          <input
            id="account-erasure-confirmation"
            class="input w-full"
            autocomplete="off"
            spellcheck={false}
            aria-describedby="account-erasure-confirmation-description"
            disabled={erasureAction.pending()}
            value={erasureConfirmation()}
            onInput={(event) => setErasureConfirmation(event.currentTarget.value)}
          />
        </FormField>
        <Show when={erasureAction.error()}>
          <p role="alert" class="text-sm text-error">
            {erasureAction.error()}
          </p>
        </Show>
        <div class="flex flex-wrap justify-end gap-2 border-t border-base-200 pt-4">
          <Button
            disabled={erasureAction.pending()}
            onClick={() => {
              resetErasureDialog()
              closeDialog('account-erasure')
            }}
          >
            {t('ui.cancel', 'Cancel')}
          </Button>
          <Button
            variant="danger"
            loading={erasureAction.pending()}
            disabled={erasureConfirmation() !== 'DELETE' || !!authSession()?.session.actorDiscordID}
            onClick={() => void submitErasure()}
          >
            {t('account.erasure.submit', 'Confirm erasure request')}
          </Button>
        </div>
      </AdminModal>
      <div class="public-page account-page mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-8 sm:py-12">
        <header class="public-page-heading flex flex-col gap-3">
          <span class="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
            <Icon name="user-round" size={16} />
            {t('main.account', 'Account')}
          </span>
          <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">{t('account.title', 'Account')}</h1>
          <p class="max-w-2xl text-sm leading-relaxed text-base-content/55">
            {t(
              'account.description',
              'Manage your Discord and Steam accounts, your GmodStore purchase, connected devices and personal data.',
            )}
          </p>
        </header>

        <ShowErrorList />

        <div class="account-overview grid min-w-0 gap-5 md:grid-cols-2">
          <AdminPanel
            title={t('account.discord', 'Discord')}
            icon="messages-square"
            description={t('account.discord_help', 'The Discord account used to sign in to this dashboard.')}
          >
            <div class="account-identity flex min-w-0 items-center gap-4">
              <div class="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-primary/15 bg-primary/10 text-primary">
                <DiscordAvatar user={localUser()} class="h-full w-full" />
              </div>
              <div class="min-w-0">
                <p class="truncate text-base font-semibold">
                  {localUser().globalName || localUser().displayName || localUser().username}
                </p>
                <p class="mt-1 break-all text-xs text-base-content/50">
                  {t('account.id', 'ID')}: <span class="font-mono">{localUser().id}</span>
                </p>
              </div>
            </div>
          </AdminPanel>

          <AdminPanel
            title={t('account.steam', 'Steam')}
            icon="gamepad-2"
            description={t(
              'account.steam_help',
              'Link your Steam account to identify your player profile and check for a GmodStore purchase.',
            )}
          >
            <AsyncState loading={user.loading} error={user.error} onRetry={() => refetchUser()}>
              <Show
                when={user()?.steamID64}
                fallback={
                  <Button variant="primary" onClick={getVerificationToken}>
                    <Icon name="link" size={16} />
                    {t('account.link_steam_account', 'Link Steam Account')}
                  </Button>
                }
              >
                <div class="account-identity flex min-w-0 items-center gap-4">
                  <span
                    class="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-base-content/10 bg-base-200/40 text-base-content/55"
                    aria-hidden="true"
                  >
                    <Show when={steamAvatarURL()} keyed fallback={<Icon name="gamepad-2" size={25} />}>
                      {(avatarURL) => (
                        <img
                          src={avatarURL}
                          alt=""
                          class="h-full w-full object-cover"
                          decoding="async"
                          onError={() => setFailedSteamAvatarURL(avatarURL)}
                        />
                      )}
                    </Show>
                  </span>
                  <div class="min-w-0">
                    <Show when={user()?.steamProfile?.name}>
                      {(name) => <p class="truncate text-base font-semibold">{name()}</p>}
                    </Show>
                    <p
                      class="break-all text-xs text-base-content/50"
                      classList={{ 'mt-1': Boolean(user()?.steamProfile?.name) }}
                    >
                      {t('account.id', 'ID')}: <span class="font-mono">{user()?.steamID64}</span>
                    </p>
                    <ButtonLink href="/profile" variant="ghost" size="sm" class="mt-3">
                      <Icon name="user-round" size={16} />
                      {t('player_profile.view_profile', 'View player profile')}
                    </ButtonLink>
                  </div>
                </div>
              </Show>
            </AsyncState>
          </AdminPanel>
        </div>

        <AdminPanel
          title={t('account.gmodstore_purchase', 'Gmod Store Purchase')}
          icon="crown"
          description={t(
            'account.gmodstore_purchase_description',
            'Activate or unlink the Discord community associated with your GmodStore purchase. Link the Steam account used for that purchase first.',
          )}
        >
          <AsyncState
            loading={gmodStorePurchase.loading}
            error={gmodStorePurchase.error}
            onRetry={() => refetchGmodStorePurchase()}
          >
            <div class="flex flex-wrap items-center gap-4">
              <Show
                when={!gmodStorePurchase()?.revoke}
                fallback={
                  <ButtonLink href="/gmodstore" variant="primary">
                    <Icon name="crown" size={16} />
                    {t('account.buy_premium', 'Buy Premium')}
                  </ButtonLink>
                }
              >
                <Show
                  when={gmodStorePurchase()?.guild}
                  fallback={
                    <ButtonLink href="/dashboard/guilds" variant="primary">
                      <Icon name="link" size={16} />
                      {t('account.activate_on_guild', 'Choose a Discord community')}
                    </ButtonLink>
                  }
                >
                  <p class="min-w-0 flex-1 break-all text-sm text-base-content/55">
                    {t('account.activated_on_guild', 'Activated for Discord community')}:{' '}
                    <span class="font-mono font-medium text-base-content">{gmodStorePurchase()?.guild}</span>
                  </p>
                  <Button variant="danger" loading={unlinkingGmodStorePurchase()} onClick={unlinkGmodStorePurchase}>
                    <Icon name="link" size={16} />
                    {t('account.unlink_guild', 'Unlink the community')}
                  </Button>
                </Show>
              </Show>
            </div>
          </AsyncState>
        </AdminPanel>

        <AdminPanel
          title={t('account.manage_sessions', 'Manage Sessions')}
          icon="monitor"
          description={t(
            'account.manage_sessions_description',
            'These devices and browsers can access your account. End a session to sign it out; your current session is marked separately.',
          )}
          type="none"
          footer={
            !userSessions.loading && !userSessions.error && sessionsPagination.visible() ? (
              <Pagination
                standalone
                query={sessionsPagination.query()}
                total={sessionsPagination.total()}
                onChange={sessionsPagination.onChange}
              />
            ) : undefined
          }
        >
          <div class="min-w-0 w-full overflow-x-auto">
            <table class="table w-full noBorderBottomTable">
              <caption class="sr-only">{t('account.active_sessions', 'Active Sessions')}</caption>
              <thead>
                <tr>
                  <th>{t('account.session_id', 'Session ID')}</th>
                  <th>{t('account.session_date', 'Last activity')}</th>
                  <th>{t('account.ip', 'IP address')}</th>
                  <th>{t('account.os', 'Operating system')}</th>
                  <th>{t('account.browser', 'Browser')}</th>
                  <th>{t('account.country', 'Country')}</th>
                  <th class="text-center">{t('account.actions', 'Actions')}</th>
                </tr>
              </thead>
              <tbody>
                <TableState
                  colSpan={7}
                  loading={userSessions.loading}
                  error={userSessions.error}
                  empty={!userSessions.loading && !userSessions.error && userSessions().length === 0}
                >
                  <For each={sessionsPagination.items()}>
                    {(session) => (
                      <tr>
                        <td class="font-mono text-xs">{session.id.substring(0, 8)}</td>
                        <td class="whitespace-nowrap text-base-content/60">
                          {new Date(session.lastSeenAt || session.createdAt).toLocaleDateString(locale())}
                        </td>
                        <td class="font-mono text-xs">{session.ip}</td>
                        <td>{session.os}</td>
                        <td>{session.browser}</td>
                        <td>{session.country}</td>
                        <td class="text-center">
                          <Show
                            when={session.isCurrent}
                            fallback={
                              <div class="tooltip" data-tip={t('account.delete_session', 'Sign out this session')}>
                                <IconButton
                                  icon="trash-2"
                                  variant="danger"
                                  label={t('account.delete_session', 'Sign out this session')}
                                  disabled={sessionAction.pending()}
                                  onClick={() => deleteUserSession(session.id)}
                                />
                              </div>
                            }
                          >
                            <StatusBadge tone="info" icon="user-check">
                              {t('account.current_session', 'Current Session')}
                            </StatusBadge>
                          </Show>
                        </td>
                      </tr>
                    )}
                  </For>
                </TableState>
              </tbody>
            </table>
          </div>
          <Show when={sessionAction.error()}>
            <p role="alert" class="px-6 pb-4 text-sm text-error">
              {sessionAction.error()}
            </p>
          </Show>
        </AdminPanel>

        <AdminPanel
          title={t('account.manage_data', 'Manage Data')}
          icon="shield-check"
          description={t(
            'account.manage_data_description',
            'Prepare an export of your personal data, then download it from the list below. Exporting data does not delete your account. Account erasure is a separate request.',
          )}
          type="none"
          footer={
            <div class="flex flex-col gap-4">
              <Show when={!userDataRequest.loading && !userDataRequest.error && exportsPagination.visible()}>
                <Pagination
                  standalone
                  query={exportsPagination.query()}
                  total={exportsPagination.total()}
                  onChange={exportsPagination.onChange}
                />
              </Show>
              <div class="flex flex-wrap gap-3">
                <Button onClick={userDataRequestCreate} loading={requestAction.pending()}>
                  <Icon name="download" size={16} />
                  {t('account.request_my_data', 'Prepare a copy of my data')}
                </Button>
                <Button
                  variant="danger"
                  disabled={!!authSession()?.session.actorDiscordID}
                  title={
                    authSession()?.session.actorDiscordID
                      ? t('auth.impersonation_erasure', 'Return to your own account before requesting erasure.')
                      : undefined
                  }
                  onClick={() => {
                    resetErasureDialog()
                    showDialog('account-erasure')
                  }}
                >
                  <Icon name="trash-2" size={16} />
                  {t('account.delete_my_data', 'Request account erasure')}
                </Button>
              </div>
            </div>
          }
        >
          <div class="min-w-0 w-full overflow-x-auto">
            <table class="table w-full noBorderBottomTable">
              <caption class="sr-only">{t('account.data_requests', 'Personal data exports')}</caption>
              <thead>
                <tr>
                  <th>{t('account.request_date', 'Request Date')}</th>
                  <th>{t('account.expiration_date', 'Download link expires')}</th>
                  <th>{t('account.status', 'Status')}</th>
                  <th class="text-center">{t('account.actions', 'Actions')}</th>
                </tr>
              </thead>
              <tbody>
                <TableState
                  colSpan={4}
                  loading={userDataRequest.loading}
                  error={userDataRequest.error}
                  empty={
                    !userDataRequest.loading &&
                    !userDataRequest.error &&
                    userDataRequest().length === 0 &&
                    !showRequestLoading()
                  }
                >
                  <For each={exportsPagination.items()}>
                    {(request) => (
                      <tr>
                        <td class="whitespace-nowrap text-base-content/60">
                          {new Date(request.createdAt).toLocaleString(locale())}
                        </td>
                        <td class="whitespace-nowrap text-base-content/60">
                          {new Date(request.expirationDate).toLocaleString(locale())}
                        </td>
                        <td>
                          <StatusBadge
                            tone={new Date(request.expirationDate) > new Date() ? 'success' : 'neutral'}
                            icon={new Date(request.expirationDate) > new Date() ? 'check' : 'x'}
                          >
                            {new Date(request.expirationDate) > new Date()
                              ? t('account.active', 'Download available')
                              : t('account.expired', 'Download expired')}
                          </StatusBadge>
                        </td>
                        <td class="text-center">
                          <Show
                            when={new Date(request.expirationDate) > new Date()}
                            fallback={
                              <span
                                class="tooltip text-base-content/35"
                                data-tip={t(
                                  'account.request_expired',
                                  'This download link has expired. Request a new copy of your data.',
                                )}
                              >
                                <Icon name="download" size={17} />
                              </span>
                            }
                          >
                            <div class="tooltip" data-tip={t('account.download_data', 'Download your data')}>
                              <IconButton
                                icon="download"
                                label={t('account.download_data', 'Download your data')}
                                onClick={() => window.open(`${request.downloadLink}?code=${request.code}`)}
                              />
                            </div>
                          </Show>
                        </td>
                      </tr>
                    )}
                  </For>
                  <Show when={showRequestLoading()}>
                    <tr>
                      <td colSpan={4} class="text-center">
                        <div role="status" class="flex flex-col items-center gap-3 py-4">
                          <span class="loading loading-spinner loading-sm" aria-hidden="true" />
                          <p class="text-xs text-base-content/55">
                            {t(
                              'account.loading_message',
                              'Preparing your data export. The time needed depends on the amount of data.',
                            )}
                          </p>
                        </div>
                      </td>
                    </tr>
                  </Show>
                </TableState>
              </tbody>
            </table>
          </div>
        </AdminPanel>
      </div>
    </>
  )
}

const AccountErasureStatus: Component<{
  receipt: ErasureReceipt
  initialStatus?: ErasureStatus
  onVerified: () => void
  onReturn: () => void
  canReturn: () => boolean
}> = (props) => {
  const { t, locale } = useI18n()
  const [status, setStatus] = createSignal(props.initialStatus)
  const [checking, setChecking] = createSignal(false)
  const [error, setError] = createSignal(false)
  const [paused, setPaused] = createSignal(false)
  let attempts = 0
  let disposed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let controller: AbortController | undefined
  const refresh = async (restart = false) => {
    if (checking()) return
    clearTimeout(timer)
    if (restart) {
      attempts = 0
      setPaused(false)
    }
    setChecking(true)
    setError(false)
    controller = new AbortController()
    attempts += 1
    try {
      const next = await fetchErasureStatus(props.receipt, controller.signal)
      if (disposed) return
      props.onVerified()
      setStatus(next)
    } catch {
      if (!disposed) setError(true)
    } finally {
      if (!disposed) {
        setChecking(false)
        if (!error() && status()?.status !== 'completed') {
          if (attempts < 12) timer = setTimeout(() => void refresh(), 5000)
          else setPaused(true)
        }
      }
    }
  }
  onMount(() => {
    if (status()?.status !== 'completed') void refresh()
  })
  onCleanup(() => {
    disposed = true
    clearTimeout(timer)
    controller?.abort()
  })
  const statusMessage = () => {
    switch (status()?.status) {
      case 'completed':
        return t('account.erasure.completed', 'The requested erasure is complete.')
      case 'running':
        return t(
          'account.erasure.running',
          'Your personal data is being erased. You can check progress here after signing out.',
        )
      case 'retry':
        return t(
          'account.erasure.retry',
          'Your request is kept. Processing will resume automatically; you do not need to submit another request.',
        )
      case 'pending':
        return t(
          'account.erasure.pending',
          'Your request has been accepted and is waiting to be processed. Erasure is not complete yet.',
        )
      default:
        return t('account.erasure.checking', 'Checking your erasure request…')
    }
  }
  return (
    <div class="public-page account-page">
      <header class="public-page-heading">
        <span class="public-eyebrow">
          <Icon name="shield-check" size={16} />
          {t('account.manage_data', 'Manage Data')}
        </span>
        <h1>{t('account.erasure.title', 'Request account erasure')}</h1>
      </header>
      <AdminPanel
        title={t('account.erasure.progress', 'Erasure progress')}
        icon={status()?.status === 'completed' ? 'circle-check' : 'shield-check'}
      >
        <div
          data-erasure-status={status()?.status || 'unconfirmed'}
          role="status"
          aria-live="polite"
          class="flex items-start gap-3"
        >
          <Icon
            name={
              status()?.status === 'completed'
                ? 'circle-check'
                : status()?.status === 'retry'
                  ? 'circle-alert'
                  : 'loader-circle'
            }
            class={status()?.status === 'completed' ? 'text-success' : 'text-primary'}
          />
          <p>{statusMessage()}</p>
        </div>
        <Show when={status()}>
          {(value) => (
            <dl class="flex flex-wrap gap-6 text-sm text-base-content/65">
              <div>
                <dt>{t('account.request_date', 'Request Date')}</dt>
                <dd>{new Date(value().requestedAt).toLocaleString(locale())}</dd>
              </div>
              <Show when={value().status === 'completed' && value().completedAt}>
                <div>
                  <dt>{t('account.erasure.completed_date', 'Completed')}</dt>
                  <dd>{new Date(value().completedAt!).toLocaleString(locale())}</dd>
                </div>
              </Show>
            </dl>
          )}
        </Show>
        <Show when={error()}>
          <p role="alert" class="text-sm text-error">
            {t(
              'account.erasure.status_error',
              'The request status could not be checked. Try checking again; your receipt is kept and no new request will be created.',
            )}
          </p>
        </Show>
        <Show when={paused()}>
          <p class="text-sm text-base-content/65">
            {t(
              'account.erasure.paused',
              'Automatic checks have paused. Your request remains active; check again to resume following it.',
            )}
          </p>
        </Show>
        <p class="text-sm text-base-content/65">
          {t(
            'account.erasure.retained',
            'A minimal request record, global bans and reputation are retained. Communities and collective purchases remain.',
          )}
        </p>
        <p class="text-xs text-base-content/60">
          {t(
            'account.erasure.external_copies',
            'Copies already shared on Discord or kept in backups need separate handling. Contact support for these copies.',
          )}
        </p>
        <p class="text-sm text-base-content/65">
          {t('account.erasure.new_account', 'Signing in again after erasure creates a new account.')}
        </p>
        <div class="flex flex-wrap gap-2">
          <Show when={status()?.status !== 'completed'}>
            <Button loading={checking()} onClick={() => void refresh(true)}>
              {t('account.erasure.check_again', 'Check status again')}
            </Button>
          </Show>
          <Show when={status()?.status === 'completed'}>
            <ButtonLink href="/login" onClick={forgetErasureReceipt}>
              {t('account.erasure.sign_in_again', 'Sign in to create a new account')}
            </ButtonLink>
          </Show>
          <Show when={error() && !status() && props.canReturn()}>
            <Button onClick={props.onReturn}>{t('account.erasure.return_account', 'Return to account')}</Button>
          </Show>
          <ButtonLink href="/" variant="ghost">
            {t('ui.back_home', 'Back to home')}
          </ButtonLink>
        </div>
      </AdminPanel>
    </div>
  )
}

const Account: Component = () => {
  const [receipt, setReceipt] = createSignal(readErasureReceipt())
  const [initialStatus, setInitialStatus] = createSignal<ErasureStatus>()
  let sessionCleared = false
  const verified = (value: ErasureReceipt) => {
    if (sessionCleared) return
    sessionCleared = true
    clearAccountSession(value)
  }
  return (
    <Show
      when={receipt()}
      keyed
      fallback={
        <AccountSettings
          onErasureAccepted={(value, status) =>
            batch(() => {
              setInitialStatus(status)
              setReceipt(value)
              verified(value)
            })
          }
        />
      }
    >
      {(value) => (
        <AccountErasureStatus
          receipt={value}
          initialStatus={initialStatus()}
          onVerified={() => verified(value)}
          canReturn={() => !sessionCleared && isLogged()}
          onReturn={() => setReceipt(undefined)}
        />
      )}
    </Show>
  )
}

export default Account
