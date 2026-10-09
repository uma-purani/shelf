import { useState } from 'react'
import { Cover } from '../../components/Cover'
import { StarDisplay, StarRow } from '../../components/Stars'
import type { Item, LogEntry } from '../../domain/types'

interface Props {
  item: Item
  log: LogEntry | undefined
  prominent?: boolean
  onStart: () => void
  onFinish: (rating: number) => void
  onDrop: () => void
}

const TYPE_LABEL = { book: 'Book', movie: 'Movie', show: 'Show' } as const

const primaryBtn =
  'min-h-11 shrink-0 rounded-xl bg-amber-500 px-4 text-sm font-semibold text-stone-950 active:opacity-70'

export function ItemCard({ item, log, prominent, onStart, onFinish, onDrop }: Props) {
  const [rating, setRating] = useState(false)
  const [menu, setMenu] = useState(false)

  const meta = [TYPE_LABEL[item.type], item.creator, item.year].filter(Boolean).join(' · ')

  return (
    <li className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
      <div className="flex items-center gap-3">
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
          {item.status === 'finished' && <StarDisplay rating={log?.rating} />}
          {item.status === 'finished' && log?.finishedAt && (
            <p className="text-xs opacity-50">Finished {log.finishedAt}</p>
          )}
          {item.status === 'dropped' && log?.droppedAt && (
            <p className="text-xs opacity-50">Dropped {log.droppedAt}</p>
          )}
        </div>

        <div className="relative flex shrink-0 items-center gap-1">
          {item.status === 'want' && (
            <button type="button" className={primaryBtn} onClick={onStart}>
              Start
            </button>
          )}
          {item.status === 'in_progress' && (
            <>
              <button type="button" className={primaryBtn} onClick={() => setRating((v) => !v)} aria-expanded={rating}>
                Finished
              </button>
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
                <div className="absolute right-0 top-full z-10 mt-1 w-36 rounded-xl bg-white p-1 shadow-lg ring-1 ring-stone-200 dark:bg-stone-800 dark:ring-stone-700">
                  <button
                    type="button"
                    className="min-h-11 w-full rounded-lg px-3 text-left text-sm active:bg-stone-100 dark:active:bg-stone-700"
                    onClick={() => {
                      setMenu(false)
                      onDrop()
                    }}
                  >
                    Drop
                  </button>
                </div>
              )}
            </>
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
        </div>
      </div>

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
