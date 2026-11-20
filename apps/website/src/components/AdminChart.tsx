import type { ParentComponent } from 'solid-js'

const AdminChart: ParentComponent<{ name: string }> = (props) => {
  return (
    <section class="flex flex-col border border-base-200 rounded-lg p-4">
      <h2 class="text-lg font-semibold text-zinc-500">{props.name}</h2>
      {props.children}
    </section>
  )
}

export default AdminChart
