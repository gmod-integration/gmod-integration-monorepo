import { useBeforeLeave, useLocation, type BeforeLeaveEventArgs } from '@solidjs/router'
import { createSignal, onCleanup, onMount, type ParentComponent } from 'solid-js'
import { DraftRegistryContext, type DraftEntry } from '../hooks/draftRegistry.js'
import AdminModal from './AdminModal.js'
import { Button } from './ui/Button.js'
import { useI18n } from '../i18n.js'
import { closeDialog, showDialog } from '../utils/dialog.js'

export const DraftEditingProvider: ParentComponent = (props) => {
  const { t } = useI18n()
  const location = useLocation()
  const [entries, setEntries] = createSignal<DraftEntry[]>([])
  const [navigation, setNavigation] = createSignal<BeforeLeaveEventArgs>()
  const pending = () => entries().some((entry) => entry.pending())
  const unsaved = () => entries().some((entry) => entry.dirty() || entry.pending())
  const dialogId = 'discard-dashboard-changes'
  useBeforeLeave((event) => {
    if (event.defaultPrevented || !unsaved()) return
    if (
      typeof event.to === 'string' &&
      new URL(event.to, window.location.origin + location.pathname).pathname === location.pathname
    )
      return
    event.preventDefault()
    setNavigation(event)
    showDialog(dialogId)
  })
  onMount(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!unsaved()) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', beforeUnload)
    onCleanup(() => window.removeEventListener('beforeunload', beforeUnload))
  })
  return (
    <DraftRegistryContext.Provider
      value={{
        register(entry) {
          setEntries((previous) => [...previous, entry])
          return () => setEntries((previous) => previous.filter((existing) => existing !== entry))
        },
      }}
    >
      {props.children}
      <AdminModal
        id={dialogId}
        title={t('ui.leave_title', 'Leave without saving?')}
        description={
          pending()
            ? t('ui.wait_saving', 'Wait for saving to finish before leaving.')
            : t('ui.leave_description', 'Your unsaved changes will be discarded.')
        }
        onClose={() => setNavigation(undefined)}
      >
        <div class="flex flex-wrap justify-end gap-2">
          <Button onClick={() => closeDialog(dialogId)}>{t('ui.stay', 'Stay on this page')}</Button>
          <Button
            variant="danger"
            disabled={pending()}
            onClick={() => {
              const next = navigation()
              entries().forEach((entry) => entry.discard())
              closeDialog(dialogId)
              next?.retry(true)
            }}
          >
            {t('ui.discard_leave', 'Discard and leave')}
          </Button>
        </div>
      </AdminModal>
    </DraftRegistryContext.Provider>
  )
}
