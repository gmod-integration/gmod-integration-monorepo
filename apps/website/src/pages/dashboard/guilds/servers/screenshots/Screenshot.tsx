import { CopyButton, IconButton, IconButtonLink } from '../../../../../components/ui/index.js'
import { showDialog } from '../../../../../utils/dialog.js'
import { type Component, type ParentProps, Show } from 'solid-js'
import { type ScreenshotStructure } from './ServerScreenshotList'
import { SteamID64 } from '../../../../../components/SteamID64'
import { useI18n } from '../../../../../i18n'

interface ScreenshotProps extends ParentProps {
  screenshot: ScreenshotStructure
  setFocusImg: (screenshot: ScreenshotStructure) => void
}

export const Screenshot: Component<ScreenshotProps> = (props) => {
  const { t } = useI18n()
  return (
    <div class="flex min-w-0 flex-col gap-2 border-base-200 border p-4 rounded-lg shadow-md">
      <h2 class="min-h-12 min-w-0 text-lg font-bold flex items-center [overflow-wrap:anywhere]">
        {props.screenshot.title || t('dashboard.server.screenshots_list.no_title', 'Untitled screenshot')}
      </h2>

      {/* wrapper relatif pour l’overlay */}
      <div class="relative group w-full">
        <img
          src={props.screenshot.url}
          alt={t('dashboard.server.screenshots_list.image_alt', 'Game screenshot')}
          class="w-full aspect-video rounded-lg object-cover"
          onClick={() => {
            props.setFocusImg(props.screenshot)
            showDialog('focusImgModal')
          }}
        />

        {/* overlay top-right, visible au hover */}
        <div
          class="absolute top-2 right-2 flex flex-wrap items-center gap-1 rounded-lg border border-base-content/10 bg-base-100/95 p-1 shadow-sm
                 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity"
        >
          {/* View */}
          <IconButton
            icon="eye"
            label={t('dashboard.server.screenshots_list.view', 'View screenshot')}
            onClick={() => {
              props.setFocusImg(props.screenshot)
              showDialog('focusImgModal')
            }}
          />

          {/* Open in new tab */}
          <IconButtonLink
            icon="external-link"
            href={props.screenshot.url}
            target="_blank"
            rel="noopener noreferrer"
            label={t('dashboard.server.screenshots_list.open_new_tab', 'Open screenshot in a new tab')}
          />

          {/* Copy URL */}
          <CopyButton
            value={props.screenshot.url}
            label={t('dashboard.server.screenshots_list.copy_url', 'Copy screenshot URL')}
          />
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
            {props.screenshot.player.name || t('dashboard.server.screenshots_list.no_name', 'Player name unavailable')}
          </p>
          <p class="text-sm text-base-content/50">
            {t('dashboard.server.screenshots_list.steam_id64', 'SteamID64')} :
            {props.screenshot.player.steamID64 ? (
              <SteamID64 steamID64={props.screenshot.player.steamID64} />
            ) : (
              t('dashboard.server.screenshots_list.no_steam_id', 'SteamID64 unavailable')
            )}
          </p>
        </Show>
      </div>
    </div>
  )
}
