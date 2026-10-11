import { useEffect, useRef, useState } from 'react'
import { createIsbnDetector, isbnFromBarcodes } from '../../services/barcode'

const SCAN_INTERVAL_MS = 250
/** Ignore the same ISBN again for a few seconds so one book on screen isn't added repeatedly. */
const REPEAT_COOLDOWN_MS = 4000

interface Props {
  /** Called with a valid ISBN-13 each time a (new) barcode is read. Scanning keeps going. */
  onIsbn: (isbn: string) => void
  onStop: () => void
}

/** Live rear-camera preview that reads ISBN barcodes continuously until stopped. */
export function CameraScanner({ onIsbn, onStop }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const onIsbnRef = useRef(onIsbn)
  onIsbnRef.current = onIsbn

  useEffect(() => {
    let cancelled = false
    let stream: MediaStream | undefined
    let timer: ReturnType<typeof setInterval> | undefined
    const lastSeen = new Map<string, number>()

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
          audio: false,
        })
        if (cancelled) return stream.getTracks().forEach((t) => t.stop())
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()
        setReady(true)

        const detector = createIsbnDetector()
        let busy = false
        timer = setInterval(async () => {
          if (busy || video.readyState < 2) return
          busy = true
          try {
            const isbn = isbnFromBarcodes(await detector.detect(video))
            const now = Date.now()
            if (isbn && now - (lastSeen.get(isbn) ?? 0) > REPEAT_COOLDOWN_MS) {
              lastSeen.set(isbn, now)
              onIsbnRef.current(isbn)
            }
          } catch {
            /* a single failed frame is fine */
          } finally {
            busy = false
          }
        }, SCAN_INTERVAL_MS)
      } catch (e) {
        if (cancelled) return
        const name = e instanceof DOMException ? e.name : ''
        setError(
          name === 'NotAllowedError'
            ? 'Camera permission was denied. Allow it in your browser settings, or pick a photo instead.'
            : name === 'NotFoundError'
              ? 'No camera was found. You can pick a photo or type the ISBN instead.'
              : "Couldn't start the camera. You can pick a photo or type the ISBN instead.",
        )
      }
    }
    void start()

    return () => {
      cancelled = true
      clearInterval(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  if (error) {
    return (
      <div role="alert" className="rounded-2xl bg-warn-soft p-4 text-sm text-warn-ink">
        {error}
        <button type="button" onClick={onStop} className="mt-3 block min-h-11 font-semibold underline">
          Close camera
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-ink">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        {/* aiming guide */}
        <div className="pointer-events-none absolute inset-x-8 inset-y-[28%] rounded-xl border-2 border-white/80" />
        {!ready && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-bg">Starting camera…</p>
        )}
      </div>
      <p className="px-1 text-center text-xs text-muted">Point at the barcode on the back of the book.</p>
      <button
        type="button"
        onClick={onStop}
        className="min-h-12 w-full rounded-xl text-base font-medium ring-1 ring-line active:bg-chip"
      >
        Stop camera
      </button>
    </div>
  )
}
