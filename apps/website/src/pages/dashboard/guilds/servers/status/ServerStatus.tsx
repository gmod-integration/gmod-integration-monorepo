import { type Component } from 'solid-js'
import 'emoji-picker-element'
import ServerStatusButtons from './ServerStatusButtons'
// import ServerStatusCustom from "./ServerStatusCustom";
// import ServerStatusChannel from "./ServerStatusChannel";
import ServerStatusMessage from './ServerStatusMessage'
import { StatusPreviewProvider, useStatusPreview } from './StatusPreviewContext.js'
import DiscordStatusPreview from '../../../../../components/discord/DiscordStatusPreview.js'
import { useI18n } from '../../../../../i18n.js'

const LivePreview: Component = () => {
  const preview = useStatusPreview()!
  return (
    <DiscordStatusPreview
      data={preview.preview()}
      loading={preview.loading()}
      error={preview.error()}
      onRetry={preview.refetch}
    />
  )
}

const ServerStatus: Component = () => {
  const { t } = useI18n()
  return (
    <StatusPreviewProvider>
      <div class="grid grid-cols-1 xl:grid-cols-2 items-start gap-6 min-w-0">
        <div data-status-configuration class="flex flex-col gap-6 min-w-0">
          <ServerStatusMessage />
          <ServerStatusButtons />
        </div>
        <aside
          data-status-simulation
          aria-label={t('dashboard.server.status.preview.simulation', 'Simulation')}
          class="min-w-0 xl:sticky xl:top-4"
        >
          <LivePreview />
        </aside>
      </div>
    </StatusPreviewProvider>
  )
}

export default ServerStatus
