import { FeatureGate } from '../../../../../components/FeatureGate.js'
import { useFeatureAccess } from '../../../../../components/AccessProvider.js'
import { createEffect, createSignal, For, Show, type Component } from 'solid-js'
import {
  StatusConfigurationButtonSchema,
  type StatusConfigurationButton,
} from '@gmod/schema/server/StatusConfigurationSchema.js'
import AdminPanel from '../../../../../components/AdminPanel.js'
import StatusCardActions from './StatusCardActions.js'
import AdminModal from '../../../../../components/AdminModal.js'
import {
  BooleanStatus,
  Button,
  FormActions,
  FormField,
  Icon,
  IconButton,
  TableState,
} from '../../../../../components/ui/index.js'
import { LinkValue } from '../../../../../components/popup/LinkValue.js'
import { createDraftForm } from '../../../../../hooks/createDraftForm.js'
import { showDialog, closeDialog } from '../../../../../utils/dialog.js'
import { useI18n } from '../../../../../i18n.js'
import { useStatusConfiguration } from './StatusConfigurationContext.js'
import DiscordStatusPreview from '../../../../../components/discord/DiscordStatusPreview.js'
import { useStatusPreview } from './StatusPreviewContext.js'

declare module 'solid-js' {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Custom elements extend Solid's JSX namespace.
  namespace JSX {
    interface IntrinsicElements {
      'emoji-picker': HTMLAttributes<HTMLElement> & {
        'on:emoji-click'?: (event: CustomEvent<{ unicode: string }>) => void
      }
    }
  }
}

const emptyButton = (): StatusConfigurationButton => ({ name: '', emoji: '', url: '', enable: false })
const ServerStatusButtons: Component = () => {
  const { t } = useI18n()
  const quotaAccess = useFeatureAccess('status.buttons')
  const editor = useStatusConfiguration()
  const preview = useStatusPreview()
  const [open, setOpen] = createSignal(false)
  const [index, setIndex] = createSignal<number>()
  const [emojiPicker, setEmojiPicker] = createSignal(false)
  const buttonForm = createDraftForm<StatusConfigurationButton>({
    initial: emptyButton(),
    validate: (draft) => {
      const parsed = StatusConfigurationButtonSchema.safeParse(draft)
      if (parsed.success) return {}
      return Object.fromEntries(
        parsed.error.issues.map((issue) => [
          issue.path[0],
          issue.path[0] === 'url'
            ? t('ui.invalid_url', 'Enter a valid HTTP or HTTPS URL.')
            : t('ui.invalid_value', 'Check the entered values.'),
        ]),
      )
    },
  })
  const unavailable = () => !editor.ready() || editor.form.pending()
  createEffect(() => {
    editor.stageButton(open() ? { index: index(), button: buttonForm.draft() } : undefined)
  })
  function discard() {
    if (editor.form.pending()) return
    setOpen(false)
    setEmojiPicker(false)
    buttonForm.discard()
    editor.stageButton(undefined)
  }
  function edit(button?: StatusConfigurationButton, row?: number) {
    if (unavailable() || (row === undefined && !quotaAccess.canCreate(editor.form.draft().buttons.length))) return
    setIndex(row)
    buttonForm.reset(button ?? emptyButton())
    setEmojiPicker(false)
    setOpen(true)
    showDialog('edit_status_button')
  }
  function apply() {
    if (
      !buttonForm.valid() ||
      !buttonForm.dirty() ||
      unavailable() ||
      (index() === undefined && !quotaAccess.canCreate(editor.form.draft().buttons.length))
    )
      return
    const button = StatusConfigurationButtonSchema.parse(buttonForm.draft())
    const buttons = [...editor.form.draft().buttons]
    const row = index()
    if (row === undefined) buttons.push(button)
    else buttons[row] = button
    editor.form.patch({ buttons })
    closeDialog('edit_status_button')
    discard()
  }
  return (
    <>
      <AdminModal
        id="edit_status_button"
        title={
          index() === undefined
            ? t('dashboard.server.status.add_button', 'Add Button')
            : t('dashboard.server.status.edit_button', 'Edit Button')
        }
        busy={editor.form.pending()}
        onClose={discard}
        onCancel={discard}
        size="wide"
      >
        <p class="settings-notice">
          {t(
            'editing.status_buttons_scope',
            'Apply each button to this card’s draft, then save the buttons to update Discord.',
          )}
        </p>
        <FormField
          id="status-button-name"
          label={t('dashboard.server.status.button_name', 'Button label')}
          description={t(
            'dashboard.server.status.button_name_help',
            'Text displayed on the button in Discord, up to 80 characters.',
          )}
          error={buttonForm.dirty() ? buttonForm.errors().name : undefined}
        >
          <input
            id="status-button-name"
            type="text"
            class="input w-full"
            value={buttonForm.draft().name}
            maxLength={80}
            disabled={unavailable()}
            aria-invalid={!!buttonForm.errors().name && buttonForm.dirty()}
            aria-describedby={`status-button-name-description${buttonForm.errors().name && buttonForm.dirty() ? ' status-button-name-error' : ''}`}
            onInput={(event) => buttonForm.patch({ name: event.currentTarget.value })}
          />
        </FormField>
        <FormField id="status-button-emoji" label={t('dashboard.server.status.button_icon', 'Icon')}>
          <div class="flex flex-wrap gap-2">
            <input
              id="status-button-emoji"
              type="text"
              class="input min-w-0 flex-1"
              maxLength={100}
              value={buttonForm.draft().emoji}
              disabled={unavailable()}
              onInput={(event) => buttonForm.patch({ emoji: event.currentTarget.value })}
            />
            <Button
              onClick={() => setEmojiPicker(!emojiPicker())}
              disabled={unavailable()}
              aria-expanded={emojiPicker()}
              aria-controls="status-button-emoji-picker"
            >
              {t('dashboard.server.status.select_emoji', 'Select Emoji')}
            </Button>
          </div>
          <Show when={emojiPicker()}>
            <emoji-picker
              id="status-button-emoji-picker"
              on:emoji-click={(event: CustomEvent) => {
                buttonForm.patch({ emoji: event.detail.unicode })
                setEmojiPicker(false)
              }}
            />
          </Show>
        </FormField>
        <FormField
          id="status-button-url"
          label={t('dashboard.server.status.button_url', 'URL')}
          description={t(
            'dashboard.server.status.button_url_help',
            'HTTP or HTTPS address opened when a member clicks the button.',
          )}
          error={buttonForm.dirty() ? buttonForm.errors().url : undefined}
        >
          <input
            id="status-button-url"
            type="url"
            class="input w-full"
            value={buttonForm.draft().url}
            maxLength={2048}
            disabled={unavailable()}
            aria-invalid={!!buttonForm.errors().url && buttonForm.dirty()}
            aria-describedby={`status-button-url-description${buttonForm.errors().url && buttonForm.dirty() ? ' status-button-url-error' : ''}`}
            onInput={(event) => buttonForm.patch({ url: event.currentTarget.value })}
          />
        </FormField>
        <FormField
          id="status-button-enabled"
          label={t('dashboard.server.status.active', 'Active')}
          description={t(
            'dashboard.server.status.button_active_help',
            'Active buttons appear in the status message after the configuration is saved.',
          )}
        >
          <input
            id="status-button-enabled"
            aria-describedby="status-button-enabled-description"
            type="checkbox"
            class="toggle"
            checked={buttonForm.draft().enable}
            disabled={unavailable()}
            onChange={(event) => buttonForm.patch({ enable: event.currentTarget.checked })}
          />
        </FormField>
        <Show when={open() && preview}>
          <DiscordStatusPreview
            data={preview!.preview()}
            loading={preview!.loading()}
            error={preview!.error()}
            onRetry={preview!.refetch}
          />
        </Show>
        <Show when={open() && index() === undefined}>
          <FeatureGate
            capability="status.buttons"
            used={editor.form.draft().buttons.length}
            loading={editor.loading()}
            error={editor.loadError()}
            showQuota={false}
          />
        </Show>
        <FormActions
          dirty={buttonForm.dirty()}
          disabled={
            unavailable() ||
            !buttonForm.valid() ||
            (index() === undefined && !quotaAccess.canCreate(editor.form.draft().buttons.length))
          }
          saveLabel={t('editing.apply_draft', 'Apply to draft')}
          onSave={apply}
          onCancel={() => {
            closeDialog('edit_status_button')
            discard()
          }}
        />
      </AdminModal>
      <AdminPanel
        title={t('dashboard.server.status.status_buttons', 'Status Buttons')}
        description={t(
          'dashboard.server.status.status_buttons_description',
          'Add links to useful pages, such as your shop or Workshop collection. Apply each button to the draft, then save this card.',
        )}
        type="none"
        footer={<StatusCardActions scope="buttons" />}
        actions={
          <FeatureGate
            capability="status.buttons"
            used={editor.form.draft().buttons.length}
            loading={editor.loading()}
            error={editor.loadError()}
          >
            <Button
              variant="primary"
              disabled={unavailable() || !quotaAccess.canCreate(editor.form.draft().buttons.length)}
              onClick={() => edit()}
            >
              <Icon name="plus" size={17} />
              {t('dashboard.server.status.add_button', 'Add Button')}
            </Button>
          </FeatureGate>
        }
      >
        <div class="min-w-0 w-full overflow-x-auto">
          <table class="status-buttons-table table rounded-none">
            <thead>
              <tr>
                <th>{t('dashboard.server.status.button_icon', 'Icon')}</th>
                <th>{t('dashboard.server.status.button_name', 'Button label')}</th>
                <th>{t('dashboard.server.status.button_url', 'URL')}</th>
                <th class="text-center">{t('dashboard.server.status.active', 'Active')}</th>
                <th class="text-center">{t('dashboard.server.status.actions', 'Actions')}</th>
              </tr>
            </thead>
            <tbody>
              <TableState
                colSpan={5}
                loading={editor.loading()}
                error={editor.loadError()}
                empty={editor.ready() && editor.form.draft().buttons.length === 0}
                onRetry={() => void editor.refetch()}
              >
                <For each={editor.form.draft().buttons}>
                  {(button, row) => (
                    <tr>
                      <td>{button.emoji}</td>
                      <td>{button.name}</td>
                      <td>
                        <Show
                          when={StatusConfigurationButtonSchema.shape.url.safeParse(button.url).success}
                          fallback={<span class="text-sm text-base-content/60">{button.url || '—'}</span>}
                        >
                          <LinkValue url={button.url} />
                        </Show>
                      </td>
                      <td>
                        <div class="flex justify-center">
                          <BooleanStatus value={button.enable} />
                        </div>
                      </td>
                      <td>
                        <div class="flex justify-center gap-2">
                          <IconButton
                            label={t('dashboard.server.status.edit', 'Edit')}
                            icon="pencil"
                            disabled={unavailable()}
                            onClick={() => edit(button, row())}
                          />
                          <IconButton
                            label={t('dashboard.server.status.delete', 'Delete')}
                            icon="trash-2"
                            variant="danger"
                            disabled={unavailable()}
                            onClick={() =>
                              editor.form.patch({
                                buttons: editor.form.draft().buttons.filter((_, current) => current !== row()),
                              })
                            }
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </For>
              </TableState>
            </tbody>
          </table>
        </div>
      </AdminPanel>
    </>
  )
}
export default ServerStatusButtons
