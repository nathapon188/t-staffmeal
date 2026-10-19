import { LOW_CONFIDENCE } from './localExtract'
import { DOW_FULL, auDate, dowIndex, hasOrder, parseKey } from './orders'

/**
 * Turns what the reader found into days ready to apply, plus a list of things
 * the operator should check first. Nothing is guessed silently: anything
 * doubtful becomes an issue rather than a quiet correction.
 */
export function mapExtraction(extraction, doc) {
  const issues = []

  const days = (extraction.days ?? []).map(raw => {
    const date = parseKey(raw.dateKey)
    const weekday = DOW_FULL[dowIndex(date)]
    const label = `${weekday} ${auDate(date)}`

    if (raw.printedWeekday && raw.printedWeekday !== weekday.toLowerCase()) {
      issues.push(
        `${label}: the sheet says "${raw.heading}", but ${auDate(date)} is a ${weekday}. ` +
        'Check the date before applying.',
      )
    }
    if (hasOrder(doc, raw.dateKey)) {
      issues.push(`${label} already has an order. Applying replaces it.`)
    }

    const groups = raw.groups.map(group => {
      if (!group.vendor) {
        issues.push(`${label}: dishes were found with no restaurant name above them. Add one after applying.`)
      } else if (group.confidence < LOW_CONFIDENCE) {
        issues.push(`${label}: the restaurant name "${group.vendor}" was hard to read.`)
      }
      for (const item of group.items) {
        if (item.confidence < LOW_CONFIDENCE) {
          issues.push(`${label}: "${item.qty} ${item.name}" was hard to read. Check the quantity and name.`)
        }
      }
      return group
    })

    return { dateKey: raw.dateKey, label, groups }
  })

  if (days.length === 0) issues.push('Nothing usable was found in this image.')

  return { days, issues, notes: (extraction.notes ?? []).join(' ') }
}
