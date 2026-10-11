import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Cover } from '../../components/Cover'
import { StarDisplay, StarRow } from '../../components/Stars'
import { canBeCaughtUp, isCaughtUp } from '../../domain/progress'
import type { Item, ItemType, LogEntry } from '../../domain/types'

interface Props {
  item: Item
  log: LogEntry | undefined
  prominent?: boolean
  onStart: () => void
  onFinish: (rating: number) => void
  onDrop: () => void
  onDelete: () => void
  onCaughtUp: (value: boolean) => void
  onSaveProgress: (text: string) => void
}

const TYPE_LABEL = { book: 'Book', movie: 'Movie', show: 'Show' } as const
const PROGRESS_HINT: Record<ItemType, string> = { book: 'p. 142', show: 'S2E4', movie: '45 min' }

const primaryBtn =
  'min-h-11 shrink-0 rounded-xl bg-amber-500 px-4 text-sm font-semibold text-stone-950 active:opacity-70'
const menuItem =
  'min-h-11 w-full rounded-lg px-3 text-left text-sm active:bg-stone-100 dark:active:bg-stone-700'

export function ItemCard({
  item,
  log,
  prominent,
  onStart,
  onFinish,
  onDrop,
  onDelete,
  onCaughtUp,
  onSaveProgress,
}: Props) {
  const [rating, setRating] = useState(false)
  const [menu, setMenu] = useState(false)

  const meta = [TYPE_LABEL[item.type], item.creator, item.year].filter(Boolean).join(' · ')
  const caughtUp = isCaughtUp(item, log)
  const choose = (action: () => void) => () => {
    setMenu(false)
    action()
  }

  return (
    <li className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
      <div className="flex items-center gap-2">
        <Link to={`/item/${item.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl">
          <Cover title={item.title} url={item.coverUrl} className={prominent ? 'h-24 w-16 shrink-0' : 'h-16 w-11 shrink-0'} />

          <div className="min-w-0 flex-1">
            <p className={`truncate font-medium ${prominent ? 'text-base' : 'text-sm'}`}>
              {item.title}
              {item.isDraft && (
                <span className="ml-2 rounded bg-stone-200 px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wide dark:bg-stone-700">
                  draft
                </span>
              )}
            </p>
            <p className="truncate text-xs opacity-60">{meta}</p>
            {caughtUp && (
              <p className="mt-0.5 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                Caught up
              </p>
            )}
            {item.status === 'finished' && <StarDisplay rating={log?.rating} />}
            {item.status === 'finished' && log?.finishedAt && (
              <p className="text-xs opacity-50">Finished {log.finishedAt}</p>
            )}
            {item.status === 'dropped' && log?.droppedAt && (
              <p className="text-xs opacity-50">Dropped {log.droppedAt}</p>
            )}
          </div>
        </Link>

        <div className="relative flex shrink-0 items-center gap-1">
          {item.status === 'want' && (
            <button type="button" className={primaryBtn} onClick={onStart}>
              Start
            </button>
          )}
          {item.status === 'in_progress' && !caughtUp && (
            <button type="button" className={primaryBtn} onClick={() => setRating((v) => !v)} aria-expanded={rating}>
              Finished
            </button>
          )}
          {item.status === 'in_progress' && caughtUp && (
            <button type="button" className={primaryBtn} onClick={() => onCaughtUp(false)}>
              Watching
            </button>
          )}
          {(item.status === 'finished' || item.status === 'dropped') && (
            <button
              type="button"
              className="min-h-11 rounded-xl px-3 text-sm font-medium ring-1 ring-stone-300 active:bg-stone-100 dark:ring-stone-600 dark:active:bg-stone-800"
              onClick={onStart}
            >
              {item.status === 'finished' ? 'Again' : 'Resume'}
            </button>
          )}

          <button
            type="button"
            aria-label="More actions"
            aria-expanded={menu}
            className="flex min-h-11 w-11 items-center justify-center rounded-xl text-xl active:bg-stone-100 dark:active:bg-stone-800"
            onClick={() => setMenu((v) => !v)}
          >
            ⋯
          </button>

          {menu && (
            <>
              {/* tap anywhere outside to close */}
              <button
                type="button"
                aria-label="Close menu"
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setMenu(false)}
              />
              <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-xl bg-white p-1 shadow-lg ring-1 ring-stone-200 dark:bg-stone-800 dark:ring-stone-700">
                {item.status === 'in_progress' && canBeCaughtUp(item) && !caughtUp && (
                  <button type="button" className={menuItem} onClick={choose(() => onCaughtUp(true))}>
                    Caught up
                  </button>
                )}
                {item.status === 'in_progress' && caughtUp && (
                  <button type="button" className={menuItem} onClick={choose(() => setRating(true))}>
                    Finished
                  </button>
                )}
                {item.status === 'in_progress' && (
                  <button type="button" className={menuItem} onClick={choose(onDrop)}>
                    Drop
                  </button>
                )}
                <button
                  type="button"
                  className={`${menuItem} text-red-600 dark:text-red-400`}
                  onClick={choose(onDelete)}
                >
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {item.status === 'in_progress' && (
        <ProgressField
          key={log?.id}
          value={log?.progress}
          hint={PROGRESS_HINT[item.type]}
          onSave={onSaveProgress}
        />
      )}

      {item.status === 'in_progress' && rating && (
        <div className="mt-2 border-t border-stone-200 pt-1 dark:border-stone-800">
          <p className="px-1 pt-1 text-center text-xs opacity-60">Tap a star: left half for a half star</p>
          <StarRow
            onPick={(r) => {
              setRating(false)
              onFinish(r)
            }}
          />
        </div>
      )}
    </li>
  )
}

/** Tap-to-edit progress line (e.g. "S4E7", "p. 142"). Saves on Enter or blur; Escape cancels. */
function ProgressField({ value, hint, onSave }: { value: string | undefined; hint: string; onSave: (text: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')

  const commit = () => {
    setEditing(false)
    if (draft.trim() !== (value ?? '')) onSave(draft)
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(value ?? '')
          setEditing(true)
        }}
        className="mt-1 flex min-h-9 w-full items-center gap-2 rounded-lg px-1 text-left text-xs active:bg-stone-100 dark:active:bg-stone-800"
      >
        <span className="opacity-50">Progress</span>
        <span className={value ? 'font-medium' : 'opacity-40'}>{value ?? `Add (e.g. ${hint})`}</span>
      </button>
    )
  }
  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setDraft(value ?? '')
          setEditing(false)
        }
      }}
      placeholder={`Progress, e.g. ${hint}`}
      aria-label="Progress"
      className="mt-1 min-h-9 w-full rounded-lg bg-stone-100 px-2 text-sm outline-none ring-1 ring-stone-300 focus:ring-2 focus:ring-amber-500 dark:bg-stone-800 dark:ring-stone-600"
    />
  )
}
