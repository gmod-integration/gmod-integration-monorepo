import { Component, createEffect, ParentProps, Show } from 'solid-js'
import { ScreenshotStructure } from './ServerScreenshotList'
import JsonViewer from '../../../../../components/JsonViewer'
import { useI18n } from '../../../../../i18n'

interface FocusImgProps extends ParentProps {
  focusImg: () => ScreenshotStructure | null
}

export const FocusImg: Component<FocusImgProps> = (props) => {
  const { t } = useI18n()
  let boxRef!: HTMLDivElement

  createEffect(() => {
    console.log('FocusImg changed')
    if (props.focusImg() !== null) {
      boxRef.scrollTop = 0
    }
  })

  return (
    <Show when={props.focusImg() !== null}>
      <dialog id="focusImgModal" class="modal">
        <div
          ref={boxRef}
          class="modal-box
           w-[80vw]
           h-[90vh]
           max-w-none
           max-h-none
           overflow-auto
           rounded-lg
           gap-4
           flex
           flex-col"
        >
          <h2 class="font-bold text-lg">
            {props.focusImg()!.title || t('dashboard.server.screenshots_list.no_title', 'No Title')}
          </h2>
          <div class="py-4 w-full flex justify-center items-center">
            <img src={props.focusImg()!.url} alt="screenshot" class="rounded-lg w-full aspect-video object-contain" />
          </div>
          <h2 class="font-bold text-lg">{t('dashboard.server.screenshots_list.information', 'Information')}</h2>
          <div class="py-4 w-full flex flex-col gap-2">
            <p class="text-sm text-base-content/50">
              {t('dashboard.server.screenshots_list.date', 'Date')} : {props.focusImg()!.createdAt}
            </p>
            <p class="text-sm text-base-content/50">
              {t('dashboard.server.screenshots_list.player', 'Player')} :{' '}
              {props.focusImg()!.player?.name || t('dashboard.server.screenshots_list.no_name', 'No Name')}
            </p>
            <p class="text-sm text-base-content/50">
              {t('dashboard.server.screenshots_list.steamID64', 'Steam ID 64')} :{' '}
              {props.focusImg()!.player?.steamID64 ||
                t('dashboard.server.screenshots_list.no_steamID64', 'No Steam ID 64')}
            </p>
          </div>
          <Show when={props.focusImg()!.player !== null}>
            <h2 class="font-bold text-lg">
              {t('dashboard.server.screenshots_list.player_metadata', 'Player Metadata')}
            </h2>
            <JsonViewer data={props.focusImg()!.player} />
          </Show>
          <Show when={props.focusImg()!.captureData !== null}>
            <h2 class="font-bold text-lg">{t('dashboard.server.screenshots_list.capture_metadata', 'Capture Data')}</h2>
            <JsonViewer data={props.focusImg()!.captureData} />
          </Show>
        </div>
        <form method="dialog" class="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>
    </Show>
  )
}
