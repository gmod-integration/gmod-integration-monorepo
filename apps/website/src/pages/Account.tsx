import { AsyncState, Button, ButtonLink, Icon, IconButton, TableState } from '../components/ui/index.js'
import { type Component, createResource, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import AdminPanel from '../components/AdminPanel.js'
import { getDiscordUser } from '../utils/utils'
import DashboardMiddleware from '../middleware/DashboardMiddleware'
import { useI18n } from '../i18n'
import { Errors, ShowErrorList } from '../components/layout/Errors'
import { fetchAPI, getAPIUrl, getUrlWithActualParams } from '../utils/api'
import { createAsyncAction } from '../hooks/createAsyncAction.js'

type UserSession = {
  id: string
  updatedAt: string
  ip: string
  os: string
  browser: string
  country: string
  accessToken: string
}

type UserDataRequest = {
  id: string
  createdAt: string
  expirationDate: string
  downloadLink: string
  code: string
}

const fetchUser = async () => {
  const response = await fetchAPI('/users?discordID=' + getDiscordUser().id, 'GET')
  return await response.json()
}

const Account: Component = () => {
  const { t, locale } = useI18n()

  const [localUser] = createSignal(getDiscordUser())
  const [user, { refetch: refetchUser }] = createResource('steamUser', fetchUser)
  const [showRequestLoading, setShowRequestLoading] = createSignal(false)
  const [unlinkingGmodStorePurchase, setUnlinkingGmodStorePurchase] = createSignal(false)
  const sessionAction = createAsyncAction({
    errorMessage: () => t('ui.save_error', 'Unable to save. Please try again.'),
  })
  const requestAction = createAsyncAction({
    errorMessage: () => t('account.error_create_data_request', 'Failed to create the data request'),
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
      return await fetchAPI('/users/:discordID/data-requests', 'GET').then(async (res) => (await res.json()) || [])
    },
    { initialValue: [] },
  )

  const [userSessions, { mutate: mutateUserSessions }] = createResource(
    'userSessions',
    async (): Promise<UserSession[]> => {
      return await fetchAPI('/users/:discordID/sessions', 'GET').then(async (res) => (await res.json()) || [])
    },
    { initialValue: [] },
  )

  async function unlinkGmodStorePurchase() {
    if (
      !window.confirm(
        t(
          'account.unlink_guild_confirmation',
          'Are you sure you want to unlink this guild from your Gmod Store Premium?',
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
      Errors(json.error || t('account.unlink_guild_error', 'Failed to unlink the guild'))
      return
    }

    await refetchGmodStorePurchase()
  }

  async function deleteUserSession(sessionID: string) {
    await sessionAction.run(async () => {
      const response = await fetchAPI(`/users/:discordID/sessions/${sessionID}`, 'DELETE')
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
        mutateUserDataRequest((prev) => [...prev, json])
      } else {
        Errors(json.error || t('account.error_create_data_request', 'Failed to create the data request'))
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
      <div class="public-page account-page mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-8 sm:py-12">
        <header class="public-page-heading flex flex-col gap-3">
          <span class="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
            <Icon name="user-round" size={16} />
            {t('main.account', 'Account')}
          </span>
          <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">{t('account.title', 'Account')}</h1>
          <p class="max-w-2xl text-sm leading-relaxed text-base-content/55">
            {t('account.description', 'Manage your linked accounts, sessions and personal data.')}
          </p>
        </header>

        <ShowErrorList />

        <div class="account-overview grid min-w-0 gap-5 md:grid-cols-2">
          <AdminPanel title={t('account.discord', 'Discord')} icon="messages-square">
            <div class="account-identity flex min-w-0 items-center gap-4">
              <div class="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-primary/15 bg-primary/10 text-primary">
                <Show
                  when={localUser().displayAvatarURL || localUser().avatarURL}
                  fallback={<Icon name="user-round" size={25} />}
                >
                  <img
                    src={localUser().displayAvatarURL || localUser().avatarURL}
                    alt=""
                    class="h-full w-full object-cover"
                  />
                </Show>
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

          <AdminPanel title={t('account.steam', 'Steam')} icon="gamepad-2">
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
                  <span class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-base-content/10 bg-base-200/40 text-base-content/55">
                    <Icon name="gamepad-2" size={25} />
                  </span>
                  <p class="break-all text-sm text-base-content/65">
                    {t('account.id', 'ID')}:{' '}
                    <span class="font-mono font-medium text-base-content">{user()?.steamID64}</span>
                  </p>
                </div>
              </Show>
            </AsyncState>
          </AdminPanel>
        </div>

        <AdminPanel
          title={t('account.gmodstore_purchase', 'Gmod Store Purchase')}
          icon="crown"
          description={t('account.gmodstore_purchase_description', 'Manage your premium bought on Gmod Store.')}
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
                      {t('account.activate_on_guild', 'Activate on Guild')}
                    </ButtonLink>
                  }
                >
                  <p class="min-w-0 flex-1 break-all text-sm text-base-content/55">
                    {t('account.activate_on_guild', 'Activate on Guild')}:{' '}
                    <span class="font-mono font-medium text-base-content">{gmodStorePurchase()?.guild}</span>
                  </p>
                  <Button variant="danger" loading={unlinkingGmodStorePurchase()} onClick={unlinkGmodStorePurchase}>
                    <Icon name="link" size={16} />
                    {t('account.unlink_guild', 'Unlink Guild')}
                  </Button>
                </Show>
              </Show>
            </div>
          </AsyncState>
        </AdminPanel>

        <AdminPanel
          title={t('account.manage_sessions', 'Manage Sessions')}
          icon="monitor"
          description={t('account.manage_sessions_description', 'Manage your active sessions.')}
          type="none"
        >
          <div class="min-w-0 w-full overflow-x-auto">
            <table class="table w-full noBorderBottomTable">
              <caption class="sr-only">{t('account.active_sessions', 'Active Sessions')}</caption>
              <thead>
                <tr>
                  <th>{t('account.session_id', 'Session ID')}</th>
                  <th>{t('account.session_date', 'Session Date')}</th>
                  <th>{t('account.ip', 'IP')}</th>
                  <th>{t('account.os', 'OS')}</th>
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
                  <For each={userSessions()}>
                    {(session) => (
                      <tr>
                        <td class="font-mono text-xs">{session.id.substring(0, 8)}</td>
                        <td class="whitespace-nowrap text-base-content/60">
                          {new Date(session.updatedAt).toLocaleDateString(locale())}
                        </td>
                        <td class="font-mono text-xs">{session.ip}</td>
                        <td>{session.os}</td>
                        <td>{session.browser}</td>
                        <td>{session.country}</td>
                        <td class="text-center">
                          <Show
                            when={session.accessToken === localStorage.getItem('accessToken')}
                            fallback={
                              <div class="tooltip" data-tip={t('account.delete_session', 'Delete this session')}>
                                <IconButton
                                  icon="trash-2"
                                  variant="danger"
                                  label={t('account.delete_session', 'Delete this session')}
                                  disabled={sessionAction.pending()}
                                  onClick={() => deleteUserSession(session.id)}
                                />
                              </div>
                            }
                          >
                            <span
                              class="inline-flex items-center gap-2 rounded-full bg-success/10 px-2.5 py-1 text-xs text-success"
                              data-tip={t('account.current_session', 'Current Session')}
                            >
                              <Icon name="user-check" size={15} />
                              <span class="sr-only">{t('account.current_session', 'Current Session')}</span>
                            </span>
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
            'In compliance with GDPR, you can request or delete your data.',
          )}
          type="none"
          footer={
            <div class="flex flex-wrap gap-3">
              <Button onClick={userDataRequestCreate} loading={requestAction.pending()}>
                <Icon name="download" size={16} />
                {t('account.request_my_data', 'Request my Data')}
              </Button>
              <ButtonLink href="mailto:gmod-integration@linv.dev" variant="danger" class="text-error">
                {t('account.delete_my_data', 'Delete my Data')}
                <Icon name="external-link" size={14} />
              </ButtonLink>
            </div>
          }
        >
          <div class="min-w-0 w-full overflow-x-auto">
            <table class="table w-full noBorderBottomTable">
              <caption class="sr-only">{t('account.data_requests', 'Data Requests')}</caption>
              <thead>
                <tr>
                  <th>{t('account.request_date', 'Request Date')}</th>
                  <th>{t('account.expiration_date', 'Expiration Date')}</th>
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
                  <For each={userDataRequest()}>
                    {(request) => (
                      <tr>
                        <td class="whitespace-nowrap text-base-content/60">
                          {new Date(request.createdAt).toLocaleString(locale())}
                        </td>
                        <td class="whitespace-nowrap text-base-content/60">
                          {new Date(request.expirationDate).toLocaleString(locale())}
                        </td>
                        <td>
                          <span
                            class={`inline-flex rounded-full px-2.5 py-1 text-xs ${new Date(request.expirationDate) > new Date() ? 'bg-success/10 text-success' : 'bg-base-200 text-base-content/50'}`}
                          >
                            {new Date(request.expirationDate) > new Date()
                              ? t('account.active', 'Active')
                              : t('account.expired', 'Expired')}
                          </span>
                        </td>
                        <td class="text-center">
                          <Show
                            when={new Date(request.expirationDate) > new Date()}
                            fallback={
                              <span
                                class="tooltip text-base-content/35"
                                data-tip={t('account.request_expired', 'Request has expired')}
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
                            {t('account.loading_message', 'Depends on your data size, this can take a while.')}
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

export default Account
