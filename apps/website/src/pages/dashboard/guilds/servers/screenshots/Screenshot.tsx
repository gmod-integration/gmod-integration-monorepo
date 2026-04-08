import { Component, ParentProps, Show } from 'solid-js'
import { ScreenshotStructure } from './ServerScreenshotList'
import { SteamID64 } from '../../../../../components/SteamID64'
import { A } from '@solidjs/router'
import { useI18n } from '../../../../../i18n'

interface ScreenshotProps extends ParentProps {
  screenshot: ScreenshotStructure
  setFocusImg: (screenshot: ScreenshotStructure) => void
}

export const Screenshot: Component<ScreenshotProps> = (props) => {
  const { t } = useI18n()
  return (
    <div class="flex flex-col gap-2 border-base-200 border p-4 rounded-lg shadow-md">
      <h2 class="text-lg font-bold h-12 flex items-center">
        {props.screenshot.title || t('dashboard.server.screenshots_list.no_title', 'No Title')}
      </h2>

      {/* wrapper relatif pour l’overlay */}
      <div class="relative group w-full">
        <img
          src={props.screenshot.url}
          alt="Screenshot"
          class="w-full aspect-video rounded-lg object-cover"
          onClick={() => {
            props.setFocusImg(props.screenshot)
            // @ts-expect-error -- intentional: legacy typing gap
            focusImgModal.showModal()
          }}
        />

        {/* overlay top-right, visible au hover */}
        <div
          class="absolute top-2 right-2 flex space-x-1
                 opacity-0 group-hover:opacity-100 transition-opacity
                 bg-black/50 p-1 rounded-md"
        >
          {/* View */}
          <button
            class="p-1 hover:text-base-content/70 rounded-sm"
            aria-label="View Screenshot"
            onClick={() => {
              props.setFocusImg(props.screenshot)
              // @ts-expect-error -- intentional: legacy typing gap
              focusImgModal.showModal()
            }}
          >
            <i class="fa-solid fa-eye"></i>
          </button>

          {/* Open in new tab */}
          <A
            href={props.screenshot.url}
            target="_blank"
            rel="noopener noreferrer"
            class="p-1 hover:bg-base-content/20 rounded-sm"
            aria-label="Open in new tab"
          >
            <i class="fa-solid fa-arrow-up-right-from-square"></i>
          </A>

          {/* Copy URL */}
          <button
            class="p-1 hover:bg-base-content/20 rounded-sm"
            aria-label="Copy URL"
            onClick={() => navigator.clipboard.writeText(props.screenshot.url)}
          >
            <i class="fa-solid fa-link"></i>
          </button>
        </div>
      </div>

      {/* Métadonnées */}
      <div class="flex flex-col gap-2 items-start w-full mt-2">
        <p class="text-sm text-base-content/50">
          {t('dashboard.server.screenshots_list.date', 'Date')} : {props.screenshot.createdAt}
        </p>
        <Show when={props.screenshot.player !== null}>
          <p class="text-sm text-base-content/50">
            {t('dashboard.server.screenshots_list.player', 'Player')} :{' '}
            {props.screenshot.player.name || t('dashboard.server.screenshots_list.no_name', 'No Name')}
          </p>
          <p class="text-sm text-base-content/50">
            {t('dashboard.server.screenshots_list.steam_id64', 'Steam ID 64')} :
            {props.screenshot.player.steamID64 ? (
              <SteamID64 steamID64={props.screenshot.player.steamID64} />
            ) : (
              t('dashboard.server.screenshots_list.no_steam_id', 'No Steam ID')
            )}
          </p>
        </Show>
      </div>
    </div>
  )
}
