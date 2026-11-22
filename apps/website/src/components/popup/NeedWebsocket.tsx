import { Icon } from '../ui/index.js'
import type { Component } from 'solid-js'
import { useI18n } from '../../i18n'

export const NeedWebsocket: Component = () => {
  const { t } = useI18n()
  return (
    <div class="settings-notice" role="note">
      <Icon name="info" size={18} />
      <div class="min-w-0 space-y-2">
        <p class="font-medium text-base-content">{t('tools.needWS_required', 'GWSockets is required')}</p>
        <p>
          {t('tools.needWS_1', 'Install the') + ' '}
          <a class="link" href="https://docs.gmod-integration.com/getting-started/installation#dll">
            GWSockets
          </a>{' '}
          {t(
            'tools.needWS_2',
            "module in garrysmod/lua/bin on your dedicated Garry's Mod server, choosing the build for its operating system and architecture, then restart the server. Without it, the addon cannot connect and none of its game integrations work. Local addon configuration remains available.",
          )}
        </p>
      </div>
    </div>
  )
}
