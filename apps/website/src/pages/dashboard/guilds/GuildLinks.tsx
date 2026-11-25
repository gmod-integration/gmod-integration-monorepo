import Pagination from '../../../components/Pagination.js'
import { createListPagination } from '../../../hooks/createListPagination.js'
import { FeatureGate } from '../../../components/FeatureGate.js'
import { useFeatureAccess } from '../../../components/AccessProvider.js'
import { closeDialog, showDialog } from '../../../utils/dialog.js'
import { type Component, createResource, createSignal, For, Show } from 'solid-js'
import AdminPanel from '../../../components/AdminPanel.js'
import AdminModal from '../../../components/AdminModal.js'
import ConfirmActionDialog from '../../../components/ConfirmActionDialog.js'
import { BooleanStatus, AsyncState, Button, FormActions, FormField, IconButton } from '../../../components/ui/index.js'
import { createDraftForm } from '../../../hooks/createDraftForm.js'
import { useI18n } from '../../../i18n.js'
import { fetchAPI } from '../../../utils/api.js'
import { LinkValue } from '../../../components/popup/LinkValue.js'
import { TextValue } from '../../../components/popup/TextValue.js'

type Link = { id: number; alias: string; url: string; active: boolean }
const LINKS_URL = '/users/:discordID/guilds/:guildID/links'
const emptyLink = (): Link => ({ id: 0, alias: '', url: '', active: false })

const fetchLinks = async (): Promise<Link[]> => {
  const response = await fetchAPI(LINKS_URL, 'GET')
  if (!response.ok) throw new Error('Links request failed')
  const links: unknown = await response.json()
  if (!Array.isArray(links)) throw new Error('Invalid links response')
  return links
}

const GuildLinks: Component = () => {
  const { t } = useI18n()
  const quotaAccess = useFeatureAccess('guild.links')
  const [links, { mutate, refetch }] = createResource(fetchLinks)
  const [deleteTarget, setDeleteTarget] = createSignal<Link>()
  const form = createDraftForm<Link>({
    initial: emptyLink(),
    errorMessage: () => t('ui.save_error', 'Unable to save changes. Try again.'),
    validate: (draft) => {
      let validURL = false
      try {
        validURL = ['http:', 'https:'].includes(new URL(draft.url).protocol)
      } catch {
        /* Invalid URL. */
      }
      return {
        alias: draft.alias.trim() ? undefined : t('dashboard.guild.links.alias_error', 'Enter a name for this link.'),
        url: validURL
          ? undefined
          : t('dashboard.guild.links.url_error', 'Enter a complete URL starting with http:// or https://.'),
      }
    },
  })
  const selectedLink = form.draft
  const busy = form.pending
  const discardDraft = form.discard
  const cancelEdit = () => {
    if (form.pending()) return
    discardDraft()
    closeDialog('edit_select_link')
  }
  const openEditor = (link: Link) => {
    if (busy() || (!link.id && !quotaAccess.canCreate(links()?.length ?? 0))) return
    form.reset(link)
    showDialog('edit_select_link')
  }

  async function saveLink() {
    if (links.loading || links.error || (!selectedLink().id && !quotaAccess.canCreate(links()?.length ?? 0))) return
    const saved = await form.save(async (draft) => {
      const response = await fetchAPI(draft.id ? `${LINKS_URL}/${draft.id}` : LINKS_URL, draft.id ? 'PUT' : 'POST', {
        alias: draft.alias,
        url: draft.url,
        active: draft.active,
      })
      if (!response.ok) throw new Error('Link update failed')
      const updated: Link = await response.json()
      mutate((previous) =>
        draft.id ? previous?.map((link) => (link.id === updated.id ? updated : link)) : [...(previous ?? []), updated],
      )
      if (!draft.id) pagination.onChange({ ...pagination.query(), offset: pagination.total() - 1 })
      return updated
    })
    if (saved) closeDialog('edit_select_link')
  }

  async function deleteLink(link: Link) {
    const response = await fetchAPI(`${LINKS_URL}/${link.id}`, 'DELETE')
    if (!response.ok) throw new Error('Link deletion failed')
    mutate((previous) => previous?.filter((existing) => existing.id !== link.id))
  }

  const pagination = createListPagination<Link>(() => (!links.error ? links() : undefined))

  return (
    <>
      <ConfirmActionDialog
        id="delete_link"
        title={t('ui.delete_target', 'Delete {1}?', deleteTarget()?.alias ?? '')}
        description={t(
          'dashboard.guild.links.delete_confirmation',
          'This shortcut will no longer be available to members.',
        )}
        confirmLabel={t('dashboard.guild.links.delete', 'Delete')}
        onConfirm={async () => {
          if (deleteTarget()) await deleteLink(deleteTarget()!)
        }}
      />
      <AdminModal
        title={
          selectedLink().id
            ? t('dashboard.guild.links.edit_link', 'Edit Link')
            : t('dashboard.guild.links.add_link', 'Add Link')
        }
        id="edit_select_link"
        busy={form.pending()}
        onClose={discardDraft}
        onCancel={discardDraft}
      >
        <FormField
          id="link-alias"
          label={t('dashboard.guild.links.alias', 'Alias')}
          description={t(
            'dashboard.guild.links.alias_hint',
            'The name members choose when using /link in Discord, such as Website or Workshop.',
          )}
          required
          error={form.errors().alias}
        >
          <input
            id="link-alias"
            type="text"
            class="input w-full"
            disabled={links.loading || form.pending()}
            aria-invalid={!!form.errors().alias}
            aria-describedby={`link-alias-description${form.errors().alias ? ' link-alias-error' : ''}`}
            value={selectedLink().alias}
            onInput={(event) => form.patch({ alias: event.currentTarget.value })}
          />
        </FormField>
        <FormField
          id="link-url"
          label={t('dashboard.guild.links.url', 'URL')}
          description={t(
            'dashboard.guild.links.url_hint',
            'The full web address opened by this shortcut, starting with http:// or https://.',
          )}
          required
          error={form.errors().url}
        >
          <input
            id="link-url"
            type="url"
            class="input w-full"
            disabled={links.loading || form.pending()}
            aria-invalid={!!form.errors().url}
            aria-describedby={`link-url-description${form.errors().url ? ' link-url-error' : ''}`}
            value={selectedLink().url}
            onInput={(event) => form.patch({ url: event.currentTarget.value })}
          />
        </FormField>
        <FormField
          id="link-active"
          label={t('dashboard.guild.links.active', 'Active')}
          description={t(
            'dashboard.guild.links.active_hint',
            'Only active links are available through /link. Choose No to keep this link saved without offering it to members.',
          )}
        >
          <select
            id="link-active"
            aria-describedby="link-active-description"
            class="select w-full"
            disabled={links.loading || form.pending()}
            value={selectedLink().active ? 'true' : 'false'}
            onChange={(event) => form.patch({ active: event.currentTarget.value === 'true' })}
          >
            <option value="true">{t('dashboard.guild.links.yes', 'Yes')}</option>
            <option value="false">{t('dashboard.guild.links.no', 'No')}</option>
          </select>
        </FormField>
        <Show when={!selectedLink().id}>
          <FeatureGate
            capability="guild.links"
            used={!links.loading && !links.error ? links()?.length : undefined}
            loading={links.loading}
            error={links.error}
            showQuota={false}
          />
        </Show>
        <FormActions
          dirty={form.dirty()}
          pending={form.pending()}
          disabled={
            links.loading ||
            !!links.error ||
            !form.valid() ||
            (!selectedLink().id && !quotaAccess.canCreate(links()?.length ?? 0))
          }
          saveLabel={selectedLink().id ? t('ui.save', 'Save') : t('ui.create', 'Create')}
          onSave={saveLink}
          onCancel={cancelEdit}
          error={form.error()}
        />
      </AdminModal>

      <AdminPanel
        title={t('dashboard.guild.links.title', 'Links')}
        description={t(
          'dashboard.guild.links.description',
          'Create named shortcuts to your website, workshop or other useful pages. Members retrieve active links with /link in Discord.',
        )}
        type="none"
        footer={
          !links.loading && !links.error && pagination.visible() ? (
            <Pagination
              standalone
              query={pagination.query()}
              total={pagination.total()}
              onChange={pagination.onChange}
            />
          ) : undefined
        }
      >
        <div class="min-w-0 w-full overflow-x-auto">
          <table class="table border-b border-base-300 rounded-none">
            <thead>
              <tr>
                <th>{t('dashboard.guild.links.alias', 'Alias')}</th>
                <th>{t('dashboard.guild.links.url', 'URL')}</th>
                <th class="text-center">{t('dashboard.guild.links.active', 'Active')}</th>
                <th class="text-center">{t('dashboard.guild.links.actions', 'Actions')}</th>
              </tr>
            </thead>
            <tbody>
              <Show when={!links.loading && !links.error}>
                <For each={pagination.items()}>
                  {(link) => (
                    <tr>
                      <td>
                        <TextValue value={link.alias} />
                      </td>
                      <td>
                        <LinkValue url={link.url} />
                      </td>
                      <td>
                        <div class="flex justify-center">
                          <BooleanStatus value={link.active} />
                        </div>
                      </td>
                      <td>
                        <div class="flex gap-2 justify-center">
                          <IconButton
                            label={t('dashboard.guild.links.edit', 'Edit')}
                            icon="pencil"
                            disabled={busy()}
                            onClick={() => openEditor(link)}
                          />
                          <IconButton
                            label={t('dashboard.guild.links.delete', 'Delete')}
                            icon="trash-2"
                            variant="danger"
                            disabled={busy()}
                            onClick={() => {
                              setDeleteTarget(link)
                              showDialog('delete_link')
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </For>
              </Show>
            </tbody>
          </table>
        </div>
        <AsyncState
          loading={links.loading}
          error={!!links.error}
          empty={!links.loading && !links.error && links()?.length === 0}
          errorLabel={t('dashboard.guild.links.failed_to_load', 'Failed to load the links')}
          emptyLabel={t(
            'dashboard.guild.links.empty',
            'No links yet. Add a link, then activate it to make it available through /link in Discord.',
          )}
          onRetry={() => void refetch()}
        />
        <Show when={!links.loading && !links.error}>
          <div class="flex gap-4 p-4">
            <FeatureGate
              capability="guild.links"
              used={!links.loading && !links.error ? links()?.length : undefined}
              loading={links.loading}
              error={links.error}
            >
              <Button
                disabled={busy() || !quotaAccess.canCreate(links()?.length ?? 0)}
                onClick={() => openEditor(emptyLink())}
              >
                {t('dashboard.guild.links.add_link', 'Add Link')}
              </Button>
            </FeatureGate>
          </div>
        </Show>
      </AdminPanel>
    </>
  )
}

export default GuildLinks
