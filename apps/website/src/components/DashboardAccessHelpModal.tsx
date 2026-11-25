import { Show } from 'solid-js'
import type { DashboardAccessDenialReason } from '@gmod/schema/user/DashboardAccessSchema.js'
import AdminModal from './AdminModal.js'
import { Button, ButtonLink, Icon } from './ui/index.js'
import { useI18n } from '../i18n.js'
import { closeDialog } from '../utils/dialog.js'

export const DASHBOARD_ACCESS_HELP_DIALOG_ID = 'dashboard-access-help'

export interface DashboardAccessHelpModalProps {
  id?: string
  reason?: DashboardAccessDenialReason
  loading?: boolean
  onRecheck?: () => void
}

/** The parent owns opening, permission checks and closing after restored access. */
export default function DashboardAccessHelpModal(props: DashboardAccessHelpModalProps) {
  const { t } = useI18n()
  const id = () => props.id ?? DASHBOARD_ACCESS_HELP_DIALOG_ID
  const reason = () => {
    switch (props.reason) {
      case 'discord_admin_required':
        return t(
          'dashboard_access_help.discord_required',
          'This Discord account needs the Administrator permission in the community.',
        )
      case 'steam_link_required':
        return t(
          'dashboard_access_help.steam_required',
          'Link your Steam account so its game administrator group can be checked.',
        )
      case 'game_admin_required':
        return t(
          'dashboard_access_help.game_required',
          'Your linked Steam account does not yet have a recorded game administrator group for the dashboard you requested.',
        )
      case 'scope_unavailable':
        return t(
          'dashboard_access_help.scope_unavailable',
          'This community or game server could not be verified. Choose the correct community or ask its owner to check the setup.',
        )
      default:
        return t(
          'dashboard_access_help.review_requirements',
          'Check the dashboard access requirements below, then verify your access again.',
        )
    }
  }
  return (
    <AdminModal
      id={id()}
      title={t('dashboard_access_help.title', 'Get dashboard access')}
      description={t(
        'dashboard_access_help.description',
        'Access uses your Discord permissions and the game administrator group reported by the addon.',
      )}
      size="wide"
      onCancel={() => closeDialog(id())}
      footer={
        <div class="flex flex-wrap items-center justify-end gap-2">
          <ButtonLink href="/account" variant="ghost">
            {t('dashboard_access_help.open_account', 'Open Account')}
          </ButtonLink>
          <ButtonLink href="/dashboard/guilds" variant="ghost">
            {t('access.choose_community', 'Choose another community')}
          </ButtonLink>
          <Button variant="ghost" onClick={() => closeDialog(id())}>
            {t('ui.close', 'Close')}
          </Button>
          <Show when={props.onRecheck}>
            <Button variant="primary" loading={props.loading} onClick={() => props.onRecheck?.()}>
              {t('dashboard_access_help.recheck', 'Recheck access')}
            </Button>
          </Show>
        </div>
      }
    >
      <div
        role="region"
        aria-label={t('dashboard_access_help.procedure_label', 'Access requirements and steps')}
        tabIndex={0}
        class="flex max-h-[55vh] min-w-0 flex-col gap-5 overflow-y-auto pr-1 text-sm leading-relaxed"
      >
        <div role="alert" class="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4">
          <Icon name="shield" size={20} class="mt-0.5 shrink-0 text-warning" />
          <p class="min-w-0 [overflow-wrap:anywhere]">{reason()}</p>
        </div>
        <section class="space-y-2" aria-labelledby={`${id()}-requirements`}>
          <h3 id={`${id()}-requirements`} class="font-semibold text-base-content">
            {t('dashboard_access_help.requirements_title', 'Who can open the dashboard?')}
          </h3>
          <p>
            {t(
              'dashboard_access_help.requirements',
              'You need Discord Administrator permission and a linked Steam account with a configured game administrator group. Community access requires that group on at least one linked server; a game server dashboard requires it on that server.',
            )}
          </p>
          <p>
            {t(
              'dashboard_access_help.exceptions',
              'The Discord server owner and the buyer whose active GmodStore purchase is assigned to this community are exempt from this combined requirement. A purchase assigned to another community does not grant access here. Buyers should link the Steam account used for their purchase and check its associated community in Account.',
            )}
          </p>
        </section>
        <section class="space-y-3" aria-labelledby={`${id()}-steps`}>
          <h3 id={`${id()}-steps`} class="font-semibold text-base-content">
            {t('dashboard_access_help.steps_title', 'Steps for other administrators')}
          </h3>
          <ol class="ml-5 list-decimal space-y-4 pr-1">
            <li class="pl-1">
              <strong class="font-semibold text-base-content">
                {t('dashboard_access_help.discord_step_title', 'Check your Discord account')}
              </strong>
              <p>
                {t(
                  'dashboard_access_help.discord_step',
                  'Sign in with the correct Discord account. Ask the community owner to check that it has the Administrator permission.',
                )}
              </p>
            </li>
            <li class="pl-1">
              <strong class="font-semibold text-base-content">
                {t('dashboard_access_help.steam_step_title', 'Link the correct Steam account')}
              </strong>
              <p>
                {t(
                  'dashboard_access_help.steam_step',
                  'Open Account, then link the Steam account you use on the game server.',
                )}
              </p>
            </li>
            <li class="pl-1">
              <strong class="font-semibold text-base-content">
                {t('dashboard_access_help.game_step_title', 'Ask an authorized person to assign your game group')}
              </strong>
              <p>
                {t(
                  'dashboard_access_help.game_step',
                  'Ask the game server owner to give your Steam account an administrator group in game. Someone who already has dashboard access must include that exact group in Server configuration → Game administrator groups.',
                )}
              </p>
            </li>
            <li class="pl-1">
              <strong class="font-semibold text-base-content">
                {t('dashboard_access_help.sync_step_title', 'Report the updated group and recheck')}
              </strong>
              <p>
                {t(
                  'dashboard_access_help.sync_step',
                  'After the group is assigned, join the game server once, wait a few seconds, then disconnect so the addon reports it. Wait for synchronization, then select Recheck access. You do not need to stay connected to the game.',
                )}
              </p>
            </li>
          </ol>
        </section>
      </div>
    </AdminModal>
  )
}
