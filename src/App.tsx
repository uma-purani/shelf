import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './data/db'

export default function App() {
  const count = useLiveQuery(() => db.items.count(), [])
  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-semibold">Shelf</h1>
      <p className="mt-2 text-sm opacity-70">{count ?? 0} items</p>
    </main>
  )
}
