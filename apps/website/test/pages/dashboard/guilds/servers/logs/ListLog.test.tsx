import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render } from '@solidjs/testing-library'
import { AddLogComponent } from '../../../../../../src/pages/dashboard/guilds/servers/logs/ListLog.js'
import { I18nProvider } from '../../../../../../src/i18n.js'

afterEach(() => cleanup())

const createAt = new Date('2024-01-01T00:00:00.000Z')

function renderLog(category: string, data: unknown) {
  return render(() => (
    <I18nProvider>
      <table>
        <tbody>
          <AddLogComponent category={category} data={data} createAt={createAt} />
        </tbody>
      </table>
    </I18nProvider>
  ))
}

function messageCell(container: HTMLElement) {
  return container.querySelectorAll('td')[2] as HTMLTableCellElement
}

describe('pages/dashboard/guilds/servers/logs/ListLog.tsx', () => {
  describe('AddLogComponent category rendering', () => {
    it.each([
      ['player_say', { ply: { name: 'Bob' }, text: 'hello world' }, ['Bob', 'say', 'hello world']],
      ['player_say', { ply: null, text: 'hello world' }, ['Unknown', 'say', 'hello world']],
      ['player_disconnect', { ply: { name: 'Bob' } }, ['Bob', 'has disconnected']],
      ['player_spawn', { ply: { name: 'Bob' } }, ['Bob', 'has spawned']],
      [
        'player_death',
        { plyTarget: { name: 'Victim' }, plyAttacker: { name: 'Killer' } },
        ['Victim', 'has been killed by', 'Killer'],
      ],
      ['player_ready', { ply: { name: 'Bob' } }, ['Bob', 'is ready']],
      ['player_connect', { name: 'Bob', ip: '1.2.3.4' }, ['Bob', 'is connecting from', '1.2.3.4']],
      [
        'player_change_team',
        { ply: { name: 'Bob' }, oldTeam: 'Red', newTeam: 'Blue' },
        ['Bob', 'has changed team from', 'Red', 'to', 'Blue'],
      ],
      [
        'player_change_group',
        { ply: { name: 'Bob' }, oldGroup: 'user', newGroup: 'admin' },
        ['Bob', 'has changed group from', 'user', 'to', 'admin'],
      ],
      [
        'player_change_name',
        { ply: { name: 'Bob' }, oldName: 'Old', newName: 'New' },
        ['Bob', 'has changed name from', 'Old', 'to', 'New'],
      ],
      ['player_give', { ply: { name: 'Bob' }, wep_class: 'weapon_pistol' }, ['Bob', 'get', 'weapon_pistol']],
      [
        'player_hurt',
        { ply: { name: 'Bob' }, attacker: { name: 'Killer' }, damage: '10' },
        ['Bob', 'has been hurt by', 'Killer', 'for', '10', 'damage'],
      ],
      [
        'player_initial_spawn',
        { ply: { name: 'Bob' } },
        ['Bob', 'has spawned for the first time'],
      ],
      ['dark_rp_drop_money', { ply: { name: 'Bob' }, amount: '100' }, ['Bob', 'has dropped', '100']],
      ['dark_rp_picked_up_money', { ply: { name: 'Bob' }, amount: '100' }, ['Bob', 'has picked up', '100']],
      [
        'dark_rp_picked_up_cheque',
        { ply: { name: 'Bob' }, amount: '100' },
        ['Bob', 'has picked up cheque', '100'],
      ],
      ['ch_atm_send_money', { ply: { name: 'Bob' }, amount: '100' }, ['Bob', 'has sent', '100']],
      ['ch_atm_receive_money', { ply: { name: 'Bob' }, amount: '100' }, ['Bob', 'has received', '100']],
      ['ch_atm_take_money', { ply: { name: 'Bob' }, amount: '100' }, ['Bob', 'has taken', '100']],
      ['ch_atm_withdraw_money', { ply: { name: 'Bob' }, amount: '100' }, ['Bob', 'has withdrawn', '100']],
      ['ch_atm_deposit_money', { ply: { name: 'Bob' }, amount: '100' }, ['Bob', 'has deposited', '100']],
      ['player_warned', { ply: { name: 'Bob' }, reason: 'spam' }, ['Bob', 'has been warned', 'spam']],
      ['player_ban', { ply: { name: 'Bob' }, reason: 'cheating' }, ['Bob', 'has been banned', 'cheating']],
      ['player_unban', { ply: { name: 'Bob' }, reason: 'appeal' }, ['Bob', 'has been unbanned', 'appeal']],
      ['player_kick', { ply: { name: 'Bob' }, reason: 'afk' }, ['Bob', 'has been kicked', 'afk']],
    ] as [string, unknown, string[]][])('renders %s with the expected translated content', (category, data, expected) => {
      const { container } = renderLog(category, data)
      const cell = messageCell(container)
      for (const text of expected) {
        expect(cell.textContent).toContain(text)
      }
    })

    it('renders nothing for server_start (handled but intentionally empty)', () => {
      const { container } = renderLog('server_start', {})
      expect(messageCell(container).textContent?.trim()).toBe('')
    })

    it('renders nothing for server_stop (handled but intentionally empty)', () => {
      const { container } = renderLog('server_stop', {})
      expect(messageCell(container).textContent?.trim()).toBe('')
    })

    it('falls back to the raw JSON for an unrecognized category', () => {
      const { container } = renderLog('totally_unrecognized_category', { foo: 'bar' })
      expect(messageCell(container).textContent).toContain(JSON.stringify({ foo: 'bar' }))
    })

    it('shows the model when the spawned object is a prop', () => {
      const { container } = renderLog('player_spawn_object', {
        ply: { name: 'Bob' },
        object: 'prop',
        model: 'models/props/thing.mdl',
      })
      expect(messageCell(container).textContent).toContain('models/props/thing.mdl')
    })

    it('shows the entity class when the spawned object is not a prop and has an entity', () => {
      const { container } = renderLog('player_spawn_object', {
        ply: { name: 'Bob' },
        object: 'weapon',
        entity: { class: 'weapon_pistol' },
      })
      expect(messageCell(container).textContent).toContain('weapon_pistol')
    })

    it('shows nothing extra when the spawned object is not a prop and has no entity', () => {
      const { container } = renderLog('player_spawn_object', {
        ply: { name: 'Bob' },
        object: 'weapon',
      })
      // Falls into the `props.data.entity ? ... : ""` false branch.
      expect(messageCell(container).textContent).toContain('weapon')
    })
  })

  describe('show more / download actions', () => {
    it('toggles the JSON detail row open and closed, flipping the chevron icon', async () => {
      const { container } = renderLog('player_ready', { ply: { name: 'Bob' } })
      const toggle = container.querySelector('.tooltip-info[data-tip="Show More"]') as HTMLElement
      expect(toggle).toBeTruthy()
      expect(container.querySelector('.fa-chevron-down')).toBeInTheDocument()
      expect(container.querySelector('.fa-chevron-up')).not.toBeInTheDocument()
      expect(container.querySelectorAll('tr')).toHaveLength(1)

      await fireEvent.click(toggle)
      expect(container.querySelector('.fa-chevron-up')).toBeInTheDocument()
      expect(container.querySelector('.fa-chevron-down')).not.toBeInTheDocument()
      expect(container.querySelectorAll('tr')).toHaveLength(2)

      // Close it again so the module-level `selectLog` signal (shared across every
      // AddLogComponent instance in this file) doesn't leak an "open" state into later tests.
      await fireEvent.click(toggle)
      expect(container.querySelector('.fa-chevron-down')).toBeInTheDocument()
      expect(container.querySelectorAll('tr')).toHaveLength(1)
    })

    it('renders a download link with a data: URL and a filename derived from the timestamp', () => {
      const { container } = renderLog('player_ready', { ply: { name: 'Bob' } })
      const downloadLink = container.querySelector('a[download]') as HTMLAnchorElement
      expect(downloadLink.getAttribute('href')).toContain('data:text/plain;charset=utf-8,')
      expect(downloadLink.getAttribute('download')).toContain('log-')
      expect(downloadLink.getAttribute('download')).toContain(createAt.toLocaleString())
    })
  })
})
