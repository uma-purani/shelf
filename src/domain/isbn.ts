/** Strip the hyphens and spaces people (and barcodes' human-readable text) put in ISBNs. */
const clean = (raw: string) => raw.replace(/[\s-]/g, '').toUpperCase()

export function isValidIsbn13(isbn: string): boolean {
  if (!/^\d{13}$/.test(isbn)) return false
  if (!isbn.startsWith('978') && !isbn.startsWith('979')) return false
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(isbn[i]) * (i % 2 === 0 ? 1 : 3)
  return (10 - (sum % 10)) % 10 === Number(isbn[12])
}

export function isValidIsbn10(isbn: string): boolean {
  if (!/^\d{9}[\dX]$/.test(isbn)) return false
  let sum = 0
  for (let i = 0; i < 10; i++) sum += (isbn[i] === 'X' ? 10 : Number(isbn[i])) * (10 - i)
  return sum % 11 === 0
}

export function isbn10To13(isbn10: string): string {
  const body = `978${isbn10.slice(0, 9)}`
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(body[i]) * (i % 2 === 0 ? 1 : 3)
  return `${body}${(10 - (sum % 10)) % 10}`
}

/**
 * Canonical ISBN-13 for a scanned or typed value, or undefined when it is not a valid ISBN.
 * Accepts ISBN-13 and ISBN-10 (converted), with or without hyphens/spaces; checksums must pass,
 * so a misread barcode or a price add-on code is rejected instead of looked up.
 */
export function normalizeIsbn(raw: string): string | undefined {
  const s = clean(raw)
  if (isValidIsbn13(s)) return s
  if (isValidIsbn10(s)) return isbn10To13(s)
  return undefined
}

/** True when the whole query is shaped like an ISBN (valid or not): search it as an ISBN, not as words. */
export function looksLikeIsbn(query: string): boolean {
  return /^(\d{13}|\d{9}[\dX])$/.test(clean(query))
}
