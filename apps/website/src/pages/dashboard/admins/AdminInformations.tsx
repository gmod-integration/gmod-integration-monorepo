import { Component, createResource, Show } from 'solid-js'
import PieChart from './pieChart'
import AdminChart from '../../../components/AdminChart'
import { fetchAPI } from '../../../utils/api'

const AdminInformations: Component = () => {
  const [adminData, { refetch }] = createResource('adminData', async () => {
    const res = await fetchAPI('/users/:discordID/admins/informations', 'GET')
    if (!res.ok) return null
    return await res.json()
  })

  return (
    <>
      <Show when={!adminData.loading && adminData()} fallback={<div className="skeleton h-[96px]"></div>}>
        <button className="btn btn-outline border-base-200 hover:bg-base-100 hover:border-base-200" onClick={refetch}>
          Refresh Admin Data
        </button>

        <h1 className="text-2xl font-semibold text-zinc-500">General</h1>
        <div class="stats shadow-sm border-base-200 border">
          <div class="stat">
            <div class="stat-title">Total Guilds</div>
            <div class="stat-value">{adminData().guild.total.toLocaleString()}</div>
          </div>
          <div class="stat">
            <div class="stat-title">Total Servers</div>
            <div class="stat-value">{adminData().server.total.toLocaleString()}</div>
          </div>
          <div class="stat">
            <div class="stat-title">Total Users</div>
            <div class="stat-value">{adminData().user.total.toLocaleString()}</div>
          </div>
        </div>
        <h2 class="text-2xl font-semibold text-zinc-500">Users</h2>
        <div class="stats shadow-sm border-base-200 border">
          <div class="stat">
            <div class="stat-title">Total Discord Members</div>
            <div class="stat-value">
              {adminData().user.totalDiscordMembers.toLocaleString()} -{' '}
              {Math.round((adminData().user.totalDiscordMembers / adminData().user.total) * 100)}%
            </div>
          </div>
          <div class="stat">
            <div class="stat-title">Total Discord User</div>
            <div class="stat-value">
              {adminData().user.totalDiscordUser.toLocaleString()} -{' '}
              {Math.round((adminData().user.totalDiscordUser / adminData().user.total) * 100)}%
            </div>
          </div>
          <div class="stat">
            <div class="stat-title">Total Verified</div>
            <div class="stat-value">
              {adminData().user.totalVerified.toLocaleString()} -{' '}
              {Math.round((adminData().user.totalVerified / adminData().user.total) * 100)}%
            </div>
          </div>
          <div class="stat">
            <div class="stat-title">Total Unverified</div>
            <div class="stat-value">
              {adminData().user.totalUnverified.toLocaleString()} -{' '}
              {Math.round((adminData().user.totalUnverified / adminData().user.total) * 100)}%
            </div>
          </div>
          <div class="stat">
            <div class="stat-title">Total Steam Users</div>
            <div class="stat-value">{adminData().user.totalSteamUser.toLocaleString()} -</div>
          </div>
        </div>
      </Show>

      <h1 class="text-2xl font-semibold text-zinc-500">Charts</h1>
      <div class="flex flex-wrap gap-4">
        {/*<AdminChart>*/}
        {/*  <Show when={!adminData.loading} fallback={<div class="skeleton h-[96px]"></div>}>*/}
        {/*    <LinePlot data={[1, 2, 3, 4, 5, 6]} />*/}
        {/*  </Show>*/}
        {/*</AdminChart>*/}

        <AdminChart name="Guilds by Language">
          <Show when={!adminData.loading && adminData()} fallback={<div class="skeleton h-[96px]"></div>}>
            <PieChart data={adminData().guild.language} />
          </Show>
        </AdminChart>
      </div>
    </>
  )
}

export default AdminInformations
