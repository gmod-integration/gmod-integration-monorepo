import { Icon } from '../ui/index.js'
import { Component } from 'solid-js'
import { useI18n } from '../../i18n'
import { A } from '@solidjs/router'

export const NeedWebsocket: Component = () => {
  const { t } = useI18n()
  return (
    <>
      <div class="text-info flex min-h-12 items-center rounded-lg border-info border p-4 gap-4">
        <Icon name="info" />
        <span>
          {t('tools.needWS_1', 'Install the') + ' '}
          <A class="link" href="https://docs.gmod-integration.com/getting-started/installation#dll">
            GWSockets
          </A>{' '}
          {t(
            'tools.needWS_2',
            "module on your Garry's Mod server and check that the addon is connected. Open the installation guide for the setup steps.",
          ) + ' '}
        </span>
      </div>
    </>
  )
}
