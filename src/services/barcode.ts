import { normalizeIsbn } from '../domain/isbn'

// Minimal typing for the Shape Detection API (not in TypeScript's DOM lib).
interface DetectedBarcode {
  rawValue: string
  format: string
}
interface BarcodeDetectorInstance {
  detect(source: ImageBitmapSource): Promise<DetectedBarcode[]>
}
interface BarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): BarcodeDetectorInstance
  getSupportedFormats?: () => Promise<string[]>
}

const detectorConstructor = () => (globalThis as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector

export type ScanSupport =
  | { ok: true }
  | { ok: false; reason: 'insecure' | 'no-api' | 'no-ean13'; message: string }

/**
 * Can this browser read barcodes? Uses the built-in BarcodeDetector only (Chrome on Android);
 * it is exposed only on secure origins (HTTPS or localhost) and not in every browser.
 */
export async function scanSupport(): Promise<ScanSupport> {
  if (!globalThis.isSecureContext) {
    return {
      ok: false,
      reason: 'insecure',
      message: 'Scanning needs a secure (HTTPS) connection. It works on the deployed Shelf site, not on a plain http:// address.',
    }
  }
  const Ctor = detectorConstructor()
  if (!Ctor) {
    return {
      ok: false,
      reason: 'no-api',
      message: "This browser can't read barcodes. Chrome on Android can. You can still type the ISBN below.",
    }
  }
  try {
    const formats = (await Ctor.getSupportedFormats?.()) ?? ['ean_13']
    if (!formats.includes('ean_13')) {
      return { ok: false, reason: 'no-ean13', message: "This device can't read book barcodes (EAN-13). You can type the ISBN below." }
    }
  } catch {
    /* getSupportedFormats unavailable: assume EAN-13 works and let detect() fail loudly if not */
  }
  return { ok: true }
}

/** Book barcodes are EAN-13 (ISBN-13). */
export function createIsbnDetector(): BarcodeDetectorInstance {
  const Ctor = detectorConstructor()
  if (!Ctor) throw new Error('BarcodeDetector is not available')
  return new Ctor({ formats: ['ean_13'] })
}

/** The first valid ISBN among detected barcodes, or undefined (price add-ons and misreads fail the checksum). */
export function isbnFromBarcodes(codes: DetectedBarcode[]): string | undefined {
  for (const code of codes) {
    const isbn = normalizeIsbn(code.rawValue)
    if (isbn) return isbn
  }
  return undefined
}

/** Read an ISBN from a photo (for example from the gallery). */
export async function isbnFromImage(file: Blob): Promise<string | undefined> {
  const detector = createIsbnDetector()
  const bitmap = await createImageBitmap(file)
  try {
    return isbnFromBarcodes(await detector.detect(bitmap))
  } finally {
    bitmap.close()
  }
}
