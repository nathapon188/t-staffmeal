export const DOW_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const DOW_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

const pad = n => String(n).padStart(2, '0')

/** YYYY-MM-DD, the key format used in data/orders.json. */
export const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const parseKey = k => {
  const [y, m, d] = k.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** DD/MM/YYYY. */
export const auDate = d => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`

/** Monday-based weekday index (0 = Monday). */
export const dowIndex = d => (d.getDay() + 6) % 7

export const startOfMonth = d => new Date(d.getFullYear(), d.getMonth(), 1)

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

/** The restaurants ordered from on a date, each { vendor, items: [{ name, qty }] }. */
export const dayGroups = (data, key) => data.orders?.[key] ?? []

export function groupTotal(group) {
  return group.items.reduce((s, item) => s + item.qty, 0)
}

export function dayTotals(data, key) {
  const groups = dayGroups(data, key)
  return {
    meals: groups.reduce((s, g) => s + groupTotal(g), 0),
    dishes: groups.reduce((s, g) => s + g.items.filter(i => i.qty > 0).length, 0),
    vendors: groups.filter(g => groupTotal(g) > 0).length,
  }
}

export function hasOrder(data, key) {
  return dayGroups(data, key).some(group => group.items.some(item => item.qty > 0))
}

/** The seven days of the Monday-start week containing `date`. */
export function weekOf(date) {
  const start = new Date(date)
  start.setDate(start.getDate() - dowIndex(start))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

const dishKey = name => String(name).toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * Totals per dish across a set of days, grouped by restaurant, so the week's
 * order can be read off at a glance. Names are merged case-insensitively.
 */
export function dishTally(data, dates) {
  const vendors = new Map()
  for (const d of dates) {
    for (const group of dayGroups(data, dateKey(d))) {
      const vendorName = group.vendor || 'Unnamed restaurant'
      if (!vendors.has(vendorName)) vendors.set(vendorName, new Map())
      const dishes = vendors.get(vendorName)
      for (const item of group.items) {
        if (item.qty <= 0) continue
        const k = dishKey(item.name)
        const entry = dishes.get(k) ?? { name: item.name, qty: 0 }
        entry.qty += item.qty
        dishes.set(k, entry)
      }
    }
  }
  return [...vendors]
    .map(([vendor, dishes]) => ({ vendor, dishes: [...dishes.values()].sort((a, b) => b.qty - a.qty) }))
    .filter(v => v.dishes.length > 0)
}

/** Today if it has an order, otherwise the next ordered day, otherwise the latest, otherwise today. */
export function defaultSelectedDate(data, today) {
  const todayKey = dateKey(today)
  if (hasOrder(data, todayKey)) return todayKey
  const ordered = Object.keys(data.orders ?? {}).filter(k => hasOrder(data, k)).sort()
  return ordered.find(k => k > todayKey) ?? ordered.at(-1) ?? todayKey
}
