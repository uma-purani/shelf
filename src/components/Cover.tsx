import { useState } from 'react'

function hue(title: string): number {
  let h = 0
  for (const ch of title) h = (h * 31 + ch.charCodeAt(0)) % 360
  return h
}

/** Cover image, or a generated placeholder showing the title. */
export function Cover({ title, url, className = '' }: { title: string; url?: string; className?: string }) {
  const [failed, setFailed] = useState(false)

  if (url && !failed) {
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className={`rounded-md object-cover ${className}`}
      />
    )
  }
  const h = hue(title)
  return (
    <div
      className={`flex items-center justify-center overflow-hidden rounded-md p-1.5 text-center text-xs font-medium leading-tight text-white ${className}`}
      // muted, slightly earthy tones so generated covers sit well with the green theme
      style={{ background: `linear-gradient(145deg, hsl(${h} 28% 38%), hsl(${(h + 30) % 360} 30% 27%))` }}
      aria-hidden
    >
      <span className="line-clamp-4 break-words">{title}</span>
    </div>
  )
}
