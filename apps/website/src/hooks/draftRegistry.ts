import { createContext, onCleanup, useContext, type Accessor } from 'solid-js'

export type DraftEntry = { dirty: Accessor<boolean>; pending: Accessor<boolean>; discard: () => void }
export const DraftRegistryContext = createContext<{ register: (entry: DraftEntry) => () => void }>()

/** Register an existing editor without changing its presentation or API ownership. */
export function useDraftGuard(entry: DraftEntry) {
  const unregister = useContext(DraftRegistryContext)?.register(entry)
  onCleanup(() => unregister?.())
}
