import { createEffect, Show, type Component, type ParentProps } from 'solid-js'
import type { ScreenshotStructure } from './ServerScreenshotList.js'
import JsonViewer from '../../../../../components/JsonViewer'
import { useI18n } from '../../../../../i18n'
import { IconButton } from '../../../../../components/ui/index.js'
import { closeDialog } from '../../../../../utils/dialog.js'

interface FocusImgProps extends ParentProps {
  focusImg: () => ScreenshotStructure | null
}

export const FocusImg: Component<FocusImgProps> = (props) => {
  const { t } = useI18n()
  let boxRef!: HTMLDivElement

  createEffect(() => {
    if (props.focusImg() !== null) {
      boxRef.scrollTop = 0
    }
  })

  return (
    <Show when={props.focusImg() !== null}>
      <dialog id="focusImgModal" class="dashboard-dialog modal" aria-labelledby="focusImgModal-title">
        <div
          ref={boxRef}
          class="dashboard-dialog-box modal-box
           w-[calc(100vw_-_2rem)] sm:w-[90vw] lg:w-[80vw]
           max-w-6xl
           max-h-[calc(100dvh_-_2rem)]
           min-w-0
           overflow-auto
           rounded-lg
           gap-4
           flex
           flex-col"
        >
          <header class="flex min-w-0 items-start justify-between gap-4">
            <h2 id="focusImgModal-title" class="min-w-0 font-bold text-lg [overflow-wrap:anywhere]">
              {props.focusImg()!.title || t('dashboard.server.screenshots_list.no_title', 'Untitled screenshot')}
            </h2>
            <IconButton
              icon="x"
              class="shrink-0"
              label={t('dashboard.server.screenshots_list.close', 'Close screenshot')}
              onClick={() => closeDialog('focusImgModal')}
            />
          </header>
          <div class="py-4 w-full flex justify-center items-center">
            <img
              src={props.focusImg()!.url}
              alt={t('dashboard.server.screenshots_list.image_alt', 'Game screenshot')}
              class="rounded-lg w-full aspect-video object-contain"
            />
          </div>
          <h2 class="font-bold text-lg">{t('dashboard.server.screenshots_list.information', 'Information')}</h2>
          <div class="py-4 w-full flex flex-col gap-2">
            <p class="text-sm text-base-content/50">
              {t('dashboard.server.screenshots_list.date', 'Date')} : {props.focusImg()!.createdAt}
            </p>
            <p class="text-sm text-base-content/50">
              {t('dashboard.server.screenshots_list.player', 'Player')} :{' '}
              {props.focusImg()!.player?.name ||
                t('dashboard.server.screenshots_list.no_name', 'Player name unavailable')}
            </p>
            <p class="text-sm text-base-content/50">
              {t('dashboard.server.screenshots_list.steamID64', 'SteamID64')} :{' '}
              {props.focusImg()!.player?.steamID64 ||
                t('dashboard.server.screenshots_list.no_steamID64', 'SteamID64 unavailable')}
            </p>
          </div>
          <Show when={props.focusImg()!.player !== null}>
            <h2 class="font-bold text-lg">
              {t('dashboard.server.screenshots_list.player_metadata', 'Player details')}
            </h2>
            <JsonViewer data={props.focusImg()!.player} />
          </Show>
          <Show when={props.focusImg()!.captureData !== null}>
            <h2 class="font-bold text-lg">
              {t('dashboard.server.screenshots_list.capture_metadata', 'Capture details')}
            </h2>
            <JsonViewer data={props.focusImg()!.captureData} />
          </Show>
        </div>
        <form method="dialog" class="modal-backdrop">
          <button tabIndex={-1} aria-hidden="true">
            {t('dashboard.server.screenshots_list.close', 'Close screenshot')}
          </button>
        </form>
      </dialog>
    </Show>
  )
}
