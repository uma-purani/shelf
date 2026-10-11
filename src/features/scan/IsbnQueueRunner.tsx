import { useEffect } from 'react'
import { useToast } from '../../components/Toast'
import { isbnService } from '../../services/isbn'

/**
 * Renders nothing. Looks up ISBNs that were scanned offline: once when the app opens and
 * again whenever the connection comes back.
 */
export function IsbnQueueRunner() {
  const toast = useToast()

  useEffect(() => {
    let alive = true
    const run = async () => {
      try {
        const s = await isbnService.processQueue()
        if (!alive) return
        const added = s.added.length
        const drafts = s.drafts.length
        if (added + drafts === 0) return
        const parts = []
        if (added) parts.push(`Added ${added} scanned ${added === 1 ? 'book' : 'books'}`)
        if (drafts) parts.push(`${drafts} not found, saved as ${drafts === 1 ? 'a draft' : 'drafts'}`)
        toast.show(parts.join(', '), s.undo)
      } catch {
        /* the queue stays put and is retried next time */
      }
    }
    void run()
    window.addEventListener('online', run)
    return () => {
      alive = false
      window.removeEventListener('online', run)
    }
  }, [toast])

  return null
}
