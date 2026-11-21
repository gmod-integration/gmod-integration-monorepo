import { createEffect, createSignal, For, Show, type Component } from 'solid-js'
import {
  StatusConfigurationButtonSchema,
  type StatusConfigurationButton,
} from '@gmod/schema/server/StatusConfigurationSchema.js'
import AdminPanel from '../../../../../components/AdminPanel.js'
import AdminModal from '../../../../../components/AdminModal.js'
import { Button, FormActions, FormField, Icon, IconButton, TableState } from '../../../../../components/ui/index.js'
import { LinkValue } from '../../../../../components/popup/LinkValue.js'
import { BuyPremiumBtn, premium } from '../../../../../utils/premium.js'
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
    if (unavailable()) return
    setIndex(row)
    buttonForm.reset(button ?? emptyButton())
    setEmojiPicker(false)
    setOpen(true)
    showDialog('edit_status_button')
  }
  function apply() {
    if (!buttonForm.valid() || !buttonForm.dirty() || unavailable()) return
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
          {t('editing.status_scope', 'Changes to the message and its buttons are saved together.')}
        </p>
        <FormField
          id="status-button-name"
          label={t('dashboard.server.status.button_name', 'Name')}
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
            aria-describedby={buttonForm.errors().name && buttonForm.dirty() ? 'status-button-name-error' : undefined}
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
            <Button onClick={() => setEmojiPicker(!emojiPicker())} disabled={unavailable()}>
              {t('dashboard.server.status.select_emoji', 'Select Emoji')}
            </Button>
          </div>
          <Show when={emojiPicker()}>
            <emoji-picker
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
            aria-describedby={buttonForm.errors().url && buttonForm.dirty() ? 'status-button-url-error' : undefined}
            onInput={(event) => buttonForm.patch({ url: event.currentTarget.value })}
          />
        </FormField>
        <FormField id="status-button-enabled" label={t('dashboard.server.status.active', 'Active')}>
          <input
            id="status-button-enabled"
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
        <FormActions
          dirty={buttonForm.dirty()}
          disabled={unavailable() || !buttonForm.valid()}
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
          'Add utility buttons to your server status message.',
        )}
        type="none"
        actions={
          <BuyPremiumBtn
            subCondition={editor.form.draft().buttons.length < 3}
            btnText={t('dashboard.server.status.premium', 'Limited to 3 buttons for free users.')}
            hidden={editor.loading()}
          >
            <Button
              variant="primary"
              disabled={unavailable() || editor.form.draft().buttons.length >= (premium() ? 25 : 3)}
              onClick={() => edit()}
            >
              <Icon name="plus" size={17} />
              {t('dashboard.server.status.add_button', 'Add Button')}
            </Button>
          </BuyPremiumBtn>
        }
      >
        <div class="min-w-0 w-full overflow-x-auto">
          <table class="status-buttons-table table rounded-none">
            <thead>
              <tr>
                <th>{t('dashboard.server.status.button_icon', 'Icon')}</th>
                <th>{t('dashboard.server.status.button_name', 'Name')}</th>
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
                          <Icon
                            name={button.enable ? 'check' : 'x'}
                            class={button.enable ? 'text-success' : 'text-error'}
                          />
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
