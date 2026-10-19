/**
 * Pure document edits. Every function returns a new document; nothing mutates
 * in place, so React state updates and the dirty check stay honest.
 */

/** True when the working copy differs from what was last loaded or saved. */
export function isDirty(doc, baseline) {
  if (!doc || !baseline) return false
  return JSON.stringify(doc.orders) !== JSON.stringify(baseline.orders)
}

const withDay = (doc, dateKey, day) => ({ ...doc, orders: { ...doc.orders, [dateKey]: day } })

const mapGroup = (doc, dateKey, groupIndex, fn) =>
  withDay(doc, dateKey, (doc.orders[dateKey] ?? []).map((g, i) => (i === groupIndex ? fn(g) : g)))

export const emptyGroup = () => ({ vendor: '', items: [{ name: '', qty: 0 }] })

export function ensureDay(doc, dateKey) {
  if (doc.orders[dateKey]) return doc
  return withDay(doc, dateKey, [emptyGroup()])
}

export function removeDay(doc, dateKey) {
  if (!doc.orders[dateKey]) return doc
  const orders = { ...doc.orders }
  delete orders[dateKey]
  return { ...doc, orders }
}

export function addGroup(doc, dateKey) {
  return withDay(doc, dateKey, [...(doc.orders[dateKey] ?? []), emptyGroup()])
}

export function removeGroup(doc, dateKey, groupIndex) {
  return withDay(doc, dateKey, (doc.orders[dateKey] ?? []).filter((_, i) => i !== groupIndex))
}

export function setVendor(doc, dateKey, groupIndex, vendor) {
  return mapGroup(doc, dateKey, groupIndex, g => ({ ...g, vendor }))
}

export function addItem(doc, dateKey, groupIndex) {
  return mapGroup(doc, dateKey, groupIndex, g => ({ ...g, items: [...g.items, { name: '', qty: 0 }] }))
}

export function removeItem(doc, dateKey, groupIndex, itemIndex) {
  return mapGroup(doc, dateKey, groupIndex, g => ({ ...g, items: g.items.filter((_, i) => i !== itemIndex) }))
}

/** Updates one dish line. Quantities are clamped to whole numbers 0-9999. */
export function setItem(doc, dateKey, groupIndex, itemIndex, patch) {
  const next = { ...patch }
  if ('qty' in next) {
    next.qty = Number.isFinite(next.qty) ? Math.max(0, Math.min(9999, Math.round(next.qty))) : 0
  }
  return mapGroup(doc, dateKey, groupIndex, g => ({
    ...g,
    items: g.items.map((item, i) => (i === itemIndex ? { ...item, ...next } : item)),
  }))
}

/**
 * Tidies a document before sync: unnamed dish lines are dropped, and a
 * restaurant left with nothing in it goes too. A day left empty is removed.
 */
export function cleanDoc(doc) {
  const orders = {}
  for (const [key, day] of Object.entries(doc.orders)) {
    const groups = day
      .map(g => ({ vendor: g.vendor.trim(), items: g.items.filter(i => i.name.trim()) }))
      .filter(g => g.items.length > 0)
    if (groups.length > 0) orders[key] = groups
  }
  return { ...doc, orders }
}

/**
 * Applies imported days. Each day replaces that date's order outright rather
 * than merging, so a re-import of a corrected sheet is not additive.
 */
export function applyImport(doc, days) {
  const orders = { ...doc.orders }
  for (const day of days) {
    orders[day.dateKey] = day.groups.map(g => ({
      vendor: g.vendor,
      items: g.items.map(i => ({ name: i.name, qty: i.qty })),
    }))
  }
  return { ...doc, orders }
}
