import { Icon } from '../ui/index.js'
import { Component, For, ParentProps } from 'solid-js'
import { useI18n } from '../../i18n'
import { A } from '@solidjs/router'

export interface AddonLink {
  name: string
  link: string
}

interface NeedAddonsProps extends ParentProps {
  addons: AddonLink[]
}

export const NeedAddon: Component<NeedAddonsProps> = (props: NeedAddonsProps) => {
  const { t } = useI18n()
  return (
    <>
      <div class="text-info flex min-h-12 items-center rounded-lg border-info border p-4 gap-4">
        <Icon name="info" />
        <span>
          {t('tools.needAddon', "Install these addons on your Garry's Mod server to use this feature: ")}
          <For each={props.addons}>
            {(addon, index) => (
              <>
                {index() > 0 ? ', ' : ''}
                <A class="link" href={addon.link}>
                  {addon.name}
                </A>
              </>
            )}
          </For>
          {'. '}
          {t('tools.needAddon2', 'Then check that the game server is connected to Gmod Integration.')}
        </span>
      </div>
    </>
  )
}
