/**
 * Photo helpers: client-side compression (used by both backends before
 * upload/store) and a tiny IndexedDB wrapper for local-mode photo storage.
 * Local photo URLs use the scheme `idb://<id>`.
 */

const DB_NAME = 'culinary-passport'
const STORE = 'photos'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        const req = run(t.objectStore(STORE))
        t.oncomplete = () => resolve((req as IDBRequest<T> | undefined)?.result as T)
        t.onerror = () => reject(t.error)
      }),
  )
}

export function idbPutPhoto(id: string, dataUrl: string): Promise<void> {
  return tx('readwrite', (s) => void s.put(dataUrl, id))
}

export function idbDeletePhotos(ids: string[]): Promise<void> {
  return tx('readwrite', (s) => void ids.forEach((id) => s.delete(id)))
}

export async function idbLoadAllPhotos(): Promise<Map<string, string>> {
  const [keys, values] = await Promise.all([
    tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys()),
    tx<string[]>('readonly', (s) => s.getAll()),
  ])
  const map = new Map<string, string>()
  keys.forEach((k, i) => map.set(String(k), values[i]))
  return map
}

/** Resize + re-encode a photo to keep storage small (JPEG, longest edge capped). */
export async function compressPhoto(file: File, maxDim = 1400, quality = 0.82): Promise<Blob> {
  const bitmap = await loadBitmap(file)
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.drawImage(bitmap, 0, 0, w, h)
  if ('close' in bitmap) bitmap.close()
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality))
  if (!blob) throw new Error('Could not encode photo')
  return blob
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => {
        URL.revokeObjectURL(url)
        resolve(img)
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('Could not read photo'))
      }
      img.src = url
    })
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result))
    fr.onerror = () => reject(fr.error)
    fr.readAsDataURL(blob)
  })
}
