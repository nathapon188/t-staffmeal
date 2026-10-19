import { timingSafeEqual } from 'node:crypto'

export const CURRENT_KEY = 'current'
export const SNAPSHOT_PREFIX = 'snapshots/'
export const MAX_SNAPSHOTS = 40

const MAX_VENDORS_PER_DAY = 20
const MAX_ITEMS_PER_VENDOR = 100
const MAX_NAME_LENGTH = 120

/** Constant-time key comparison. */
export function keysMatch(supplied, expected) {
  const a = Buffer.from(String(supplied ?? ''))
  const b = Buffer.from(String(expected ?? ''))
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b)
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

const isText = (value, { allowEmpty = false } = {}) =>
  typeof value === 'string' && value.length <= MAX_NAME_LENGTH && (allowEmpty || value.trim().length > 0)

/**
 * Guards the stored document. The save endpoint accepts a whole document from
 * the browser, so everything is checked before it reaches the store.
 *
 * Shape: { orders: { "YYYY-MM-DD": [ { vendor, items: [ { name, qty } ] } ] } }
 */
export function validateDoc(doc) {
  if (!doc || typeof doc !== 'object') return 'Document must be an object'
  if (!doc.orders || typeof doc.orders !== 'object' || Array.isArray(doc.orders)) return 'orders must be an object'

  for (const [dateKey, day] of Object.entries(doc.orders)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return `Bad date key: ${dateKey}`
    if (!Array.isArray(day)) return `Order for ${dateKey} must be a list of restaurants`
    if (day.length > MAX_VENDORS_PER_DAY) return `Too many restaurants on ${dateKey}`

    for (const group of day) {
      if (!group || typeof group !== 'object') return `Every restaurant on ${dateKey} must be an object`
      if (!isText(group.vendor, { allowEmpty: true })) {
        return `Restaurant name on ${dateKey} must be text up to ${MAX_NAME_LENGTH} characters`
      }
      if (!Array.isArray(group.items)) return `Items for ${group.vendor || 'a restaurant'} on ${dateKey} must be a list`
      if (group.items.length > MAX_ITEMS_PER_VENDOR) return `Too many items for ${group.vendor} on ${dateKey}`

      for (const item of group.items) {
        if (!item || !isText(item.name)) {
          return `Every item on ${dateKey} needs a name up to ${MAX_NAME_LENGTH} characters`
        }
        if (!Number.isInteger(item.qty) || item.qty < 0 || item.qty > 9999) {
          return `Quantity for ${item.name} on ${dateKey} must be a whole number between 0 and 9999`
        }
      }
    }
  }
  return null
}

/** Strips anything that is not part of the document contract. */
function normalise(doc) {
  const orders = {}
  for (const [dateKey, day] of Object.entries(doc.orders)) {
    orders[dateKey] = day.map(group => ({
      vendor: group.vendor.trim(),
      items: group.items.map(item => ({ name: item.name.trim(), qty: item.qty })),
    }))
  }
  return { orders }
}

export async function loadDoc(store, seed) {
  const stored = await store.getJSON(CURRENT_KEY)
  if (stored) return stored
  // Nothing saved yet: serve the seed committed in the repo.
  return { ...normalise(seed), updatedAt: null }
}

/**
 * Saves a new document. `ifMatch` is the updatedAt the client loaded; a
 * mismatch means somebody else saved in the meantime, so we reject rather
 * than silently discarding their work.
 */
export async function saveDoc(store, doc, { ifMatch, now }) {
  const problem = validateDoc(doc)
  if (problem) throw new ApiError(400, problem)

  const current = await store.getJSON(CURRENT_KEY)
  const currentStamp = current?.updatedAt ?? null

  if (ifMatch !== undefined && ifMatch !== currentStamp) {
    throw new ApiError(409, 'Someone else saved changes since you loaded this. Reload before saving again.')
  }

  // Snapshot what we are about to replace, so a bad edit can be rolled back.
  if (current) {
    await store.setJSON(`${SNAPSHOT_PREFIX}${currentStamp ?? now}`, current)
    await pruneSnapshots(store)
  }

  const next = { ...normalise(doc), updatedAt: now }
  await store.setJSON(CURRENT_KEY, next)
  return next
}

async function pruneSnapshots(store) {
  const keys = await store.list(SNAPSHOT_PREFIX)
  if (keys.length <= MAX_SNAPSHOTS) return
  const oldest = keys.sort().slice(0, keys.length - MAX_SNAPSHOTS)
  for (const key of oldest) await store.remove(key)
}

export async function listSnapshots(store) {
  const keys = await store.list(SNAPSHOT_PREFIX)
  return keys
    .map(key => key.slice(SNAPSHOT_PREFIX.length))
    .sort()
    .reverse()
}

export async function getSnapshot(store, id) {
  if (!id || id.includes('/')) throw new ApiError(400, 'Bad snapshot id')
  const doc = await store.getJSON(`${SNAPSHOT_PREFIX}${id}`)
  if (!doc) throw new ApiError(404, 'Snapshot not found')
  return doc
}
