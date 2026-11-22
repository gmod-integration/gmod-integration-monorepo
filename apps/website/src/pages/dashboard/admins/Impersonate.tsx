import { type Component, createResource } from 'solid-js'
import { useLocation, useNavigate } from '@solidjs/router'
import { fetchAPI } from '../../../utils/api.js'
import { authCommand, authSession } from '../../../utils/authClient.js'
import { useI18n } from '../../../i18n.js'
import { AsyncState, Button } from '../../../components/ui/index.js'
import { createAsyncAction } from '../../../hooks/createAsyncAction.js'
import { createListPagination } from '../../../hooks/createListPagination.js'
import Pagination from '../../../components/Pagination.js'
import { For, onMount, Show } from 'solid-js'

type Target = { discordID: string; username?: string }
const Impersonate: Component = () => {
  const { t } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()
  const action = createAsyncAction({ errorMessage: () => t('ui.action_error', 'The action failed. Please try again.') })
  const [users] = createResource(async (): Promise<Target[]> => {
    if (authSession()?.session.actorDiscordID) return []
    const response = await fetchAPI('/users/:discordID/admins/panel-users', 'GET')
    if (!response.ok) throw new Error('Users unavailable')
    const value = await response.json()
    if (!Array.isArray(value)) throw new Error('Invalid user list')
    return value
  })
  const availableUsers = () =>
    (users.error ? [] : (users() ?? [])).filter((user) => user.discordID !== authSession()?.user.id)
  const pagination = createListPagination(availableUsers)
  async function begin(discordID: string) {
    if (await action.run(() => authCommand('/impersonations', { discordID }))) navigate('/dashboard/guilds')
  }
  async function end() {
    if (await action.run(() => authCommand('/impersonations/end'))) navigate('/dashboard/admins/impersonate')
  }
  onMount(() => {
    if (location.pathname.endsWith('/stop-impersonate')) void end()
  })
  return (
    <div class="flex min-w-0 flex-col gap-4">
      <h2 class="text-2xl font-semibold">{t('admin.support_access', 'Support access to a user account')}</h2>
      <p class="text-sm text-base-content/65">
        {t(
          'admin.support_access_description',
          'Choose a user to open the dashboard with their permissions. Your actions affect their account. Use Return to your account when you have finished.',
        )}
      </p>
      <Show when={action.error()}>
        <p role="alert" class="text-error">
          {action.error()}
        </p>
      </Show>
      <Show
        when={authSession()?.session.actorDiscordID}
        fallback={
          <AsyncState
            loading={users.loading}
            error={users.error}
            empty={!availableUsers().length}
            emptyLabel={t('admin.users_empty', 'No user accounts are available for support access.')}
          >
            <div class="flex flex-wrap gap-4">
              <For each={pagination.items()}>
                {(user) => (
                  <Button class="max-w-full" loading={action.pending()} onClick={() => void begin(user.discordID)}>
                    {t('admin.open_account', 'Access {1}', user.username || user.discordID)}
                  </Button>
                )}
              </For>
            </div>
            <Show when={pagination.visible()}>
              <div class="pt-4">
                <Pagination
                  standalone
                  query={pagination.query()}
                  total={pagination.total()}
                  onChange={pagination.onChange}
                />
              </div>
            </Show>
          </AsyncState>
        }
      >
        <Button loading={action.pending()} onClick={() => void end()}>
          {t('auth.stop_impersonation', 'Return to your account')}
        </Button>
      </Show>
    </div>
  )
}
export default Impersonate
