import { PSM, createWorker } from 'tesseract.js'

/**
 * Reads a staff meal order screenshot in the browser: no API key, no network
 * call for the image, nothing leaves the machine.
 *
 * The sheet is a column per day:
 *
 *     Monday, 12 October 2026      <- date heading
 *     Tamrab Thai                  <- restaurant
 *     4 Veg Pad See Ew             <- quantity then dish
 *     16 Chicken Panang
 *
 * Several days can sit side by side or stacked; each date heading claims the
 * cells below it in its own column, up to the next heading. A line that starts
 * with a number is a dish, any other line starts a new restaurant.
 *
 * Returns { days: [{ dateKey, printedWeekday, heading, groups }], notes }.
 */

// Screenshots of a sheet are small, and Tesseract reads small text poorly, so
// the image is enlarged first. A big screenshot gets less, up to the point a
// canvas still fits in memory.
const MAX_SCALE = 3
const TARGET_EDGE = 3000
const MAX_PIXELS = 40e6
export const LOW_CONFIDENCE = 60

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

const pad = n => String(n).padStart(2, '0')

/** Lower-case letters only, undoing the digit-for-letter misreads OCR makes in words. */
const letters = text =>
  String(text ?? '').toLowerCase().replace(/0/g, 'o').replace(/1/g, 'l').replace(/5/g, 's').replace(/[^a-z]/g, '')

function weekdayOf(text) {
  const word = letters(text)
  if (word.length < 3) return null
  return WEEKDAYS.find(day => day === word || day.startsWith(word)) ?? null
}

function monthOf(text) {
  const word = letters(text)
  if (word.length < 3) return null
  const index = MONTHS.findIndex(m => word.startsWith(m))
  return index < 0 ? null : index
}

function dayNumber(text) {
  const clean = String(text ?? '').replace(/(st|nd|rd|th)?[,.]?$/i, '')
  return /^\d{1,2}$/.test(clean) ? Number(clean) : null
}

function yearNumber(text) {
  const clean = String(text ?? '').replace(/[,.]$/, '')
  return /^20\d{2}$/.test(clean) ? Number(clean) : null
}

function makeDate(year, month, day) {
  const d = new Date(year, month, day)
  if (d.getFullYear() !== year || d.getMonth() !== month || d.getDate() !== day) return null
  return `${year}-${pad(month + 1)}-${pad(day)}`
}

/** A heading without a year lands in whichever year puts it nearest today. */
function nearestYear(month, day, today) {
  const distance = year => Math.abs(new Date(year, month, day) - today)
  return [-1, 0, 1].map(offset => today.getFullYear() + offset).sort((a, b) => distance(a) - distance(b))[0]
}

/**
 * Looks for a date heading starting at words[i]. Accepts
 * "Monday, 12 October 2026", "Mon 12 Oct", "12 October 2026" and "Monday 12/10/2026".
 * Returns { dateKey, printedWeekday, length } or null.
 */
function readHeading(words, i, today) {
  let at = i
  const printedWeekday = weekdayOf(words[at]?.text)
  if (printedWeekday) at++

  const slashed = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})[,.]?$/.exec(words[at]?.text ?? '')
  if (slashed) {
    const year = Number(slashed[3].length === 2 ? `20${slashed[3]}` : slashed[3])
    const key = makeDate(year, Number(slashed[2]) - 1, Number(slashed[1]))
    return key ? { dateKey: key, printedWeekday, length: at - i + 1 } : null
  }

  const day = dayNumber(words[at]?.text)
  const month = monthOf(words[at + 1]?.text)
  if (day === null || month === null) return null
  // "4 Mar..." could be a dish line, so without a weekday insist on a year.
  const year = yearNumber(words[at + 2]?.text)
  if (!printedWeekday && year === null) return null

  const key = makeDate(year ?? nearestYear(month, day, today), month, day)
  if (!key) return null
  return { dateKey: key, printedWeekday, length: at - i + (year === null ? 2 : 3) }
}

/** Flattens Tesseract's block/paragraph/line tree into a flat list of words. */
function collectWords(page) {
  const words = []
  for (const block of page.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        for (const word of line.words ?? []) {
          // Cell borders come through as pipes and brackets stuck to a word.
          const text = word.text?.replace(/^[|_[\]{}]+|[|_[\]{}]+$/g, '').trim()
          if (text) words.push({ text, confidence: word.confidence, ...word.bbox })
        }
      }
    }
  }
  return words
}

/** Groups words into rows by vertical overlap, each sorted left to right. */
function groupRows(words) {
  if (words.length === 0) return []

  const heights = words.map(w => w.y1 - w.y0).sort((a, b) => a - b)
  const tolerance = Math.max(4, heights[Math.floor(heights.length / 2)] * 0.6)

  const rows = []
  let current = null

  for (const word of [...words].sort((a, b) => a.y0 + a.y1 - (b.y0 + b.y1))) {
    const centre = (word.y0 + word.y1) / 2
    if (!current || Math.abs(centre - current.centre) > tolerance) {
      current = { y0: word.y0, y1: word.y1, centre, words: [word] }
      rows.push(current)
    } else {
      current.words.push(word)
      current.y0 = Math.min(current.y0, word.y0)
      current.y1 = Math.max(current.y1, word.y1)
      current.centre = (current.y0 + current.y1) / 2
    }
  }

  for (const row of rows) row.words.sort((a, b) => a.x0 - b.x0)
  return rows
}

/** Splits a row wherever the gap between words is wide enough to be a cell boundary. */
function splitCells(row) {
  const height = row.y1 - row.y0
  const cells = []
  let current = null
  for (const word of row.words) {
    if (!current || word.x0 - current.x1 > height * 1.6) {
      current = { x0: word.x0, x1: word.x1, y0: row.y0, y1: row.y1, words: [word] }
      cells.push(current)
    } else {
      current.words.push(word)
      current.x1 = word.x1
    }
  }
  return cells
}

/** Finds every date heading on the page, each with its position. */
function findHeadings(rows, today) {
  const headings = []
  for (const row of rows) {
    const { words } = row
    for (let i = 0; i < words.length; i++) {
      const found = readHeading(words, i, today)
      if (!found) continue
      const used = words.slice(i, i + found.length)
      headings.push({
        ...found,
        heading: used.map(w => w.text).join(' '),
        words: new Set(used),
        x0: used[0].x0,
        y0: row.y0,
        y1: row.y1,
      })
      i += found.length - 1
    }
  }
  return headings
}

const SMALL_WORDS = new Set(['and', 'with', 'of', 'or', 'in', 'on', 'no', 'extra'])

/**
 * OCR flips the case of a word's first letter at random ("8 Chicken pad see
 * Ew"), so lift a lower-case first letter. Anything already capitalised, such
 * as "BBQ", is left as printed.
 */
const tidyName = name =>
  name.split(' ').map((word, i) =>
    /^[a-z]/.test(word) && (i === 0 || !SMALL_WORDS.has(word)) ? word[0].toUpperCase() + word.slice(1) : word,
  ).join(' ')

/** Turns one line of text into a dish ({ qty, name }), a restaurant name, or noise. */
function readLine(text) {
  const clean = text
    .replace(/[|]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[-–•*.,:;'"`\s]+|[-–•*,:;'"`\s]+$/g, '')
  if (!clean) return null
  if (/^total\b/i.test(clean)) return { kind: 'total' }

  // "4 Veg Pad See Ew", "4x Veg...", "4 x Veg..." and the run-together "4Veg...".
  const dish = /^(\d{1,4})\s*[x×]?\s*([A-Za-z(].*)$/i.exec(clean)
  if (dish) return { kind: 'dish', qty: Number(dish[1]), name: tidyName(dish[2].trim()) }

  // "Veg Pad See Ew x 4", written the other way round.
  const trailing = /^([A-Za-z(].*?)\s*[x×-]\s*(\d{1,4})$/i.exec(clean)
  if (trailing) return { kind: 'dish', qty: Number(trailing[2]), name: tidyName(trailing[1].trim()) }

  if (/[a-z]{2,}/i.test(clean)) return { kind: 'vendor', name: tidyName(clean) }
  return { kind: 'noise', text: clean }
}

/**
 * The layout pass, kept apart from OCR so it can run in Node against
 * Tesseract output (see scripts/try-local-read.mjs).
 */
export function parseWords(words, { today = new Date(), fallbackDate = null } = {}) {
  const notes = []
  const rows = groupRows(words)
  let headings = findHeadings(rows, today)

  if (headings.length === 0) {
    if (!fallbackDate) {
      throw new Error('No date heading was found. Include the "Monday, 12 October 2026" row in the screenshot.')
    }
    notes.push('No date heading was found in the image, so everything was put on the date you chose.')
    headings = [{
      dateKey: fallbackDate, printedWeekday: null, heading: '', words: new Set(),
      x0: 0, y0: -Infinity, y1: -Infinity,
    }]
  }

  const heights = words.map(w => w.y1 - w.y0).sort((a, b) => a - b)
  const lineHeight = heights[Math.floor(heights.length / 2)] ?? 10

  // Headings whose spans overlap form one column of the sheet. Spans rather
  // than left edges, because a date cell is often right-aligned while the
  // dishes under it are left-aligned.
  for (const h of headings) h.x1 = Math.max(...[...h.words].map(w => w.x1), h.x0)
  const columns = []
  for (const h of [...headings].sort((a, b) => a.x0 - b.x0)) {
    const last = columns.at(-1)
    if (last && h.x0 < last.x1) last.x1 = Math.max(last.x1, h.x1)
    else columns.push({ x0: h.x0, x1: h.x1 })
  }
  const columnOf = (x0, x1) => {
    const overlap = c => Math.min(x1, c.x1) - Math.max(x0, c.x0)
    const gap = c => Math.max(c.x0 - x1, x0 - c.x1)
    let best = 0
    columns.forEach((c, i) => {
      const b = columns[best]
      if (overlap(c) > overlap(b) || (overlap(b) <= 0 && overlap(c) <= 0 && gap(c) < gap(b))) best = i
    })
    return best
  }
  const headingColumn = headings.map(h => (Number.isFinite(h.y0) ? columnOf(h.x0, h.x1) : 0))

  const headingWords = new Set(headings.flatMap(h => [...h.words]))
  const owned = headings.map(() => [])

  // Each cell belongs to the nearest heading above it in its own column.
  for (const row of rows) {
    for (const cell of splitCells(row)) {
      const cellWords = cell.words.filter(w => !headingWords.has(w))
      if (cellWords.length === 0) continue
      const column = columns.length ? columnOf(cellWords[0].x0, cellWords.at(-1).x1) : 0
      let owner = -1
      headings.forEach((h, i) => {
        if (headingColumn[i] !== column || h.y1 > cell.y0 + lineHeight * 0.5) return
        if (owner < 0 || h.y0 > headings[owner].y0) owner = i
      })
      if (owner < 0) {
        notes.push(`Ignored "${cellWords.map(w => w.text).join(' ')}", which sits above every date heading.`)
        continue
      }
      owned[owner].push({ ...cell, words: cellWords })
    }
  }

  const byDate = new Map()
  headings.forEach((h, i) => {
    const where = h.heading || h.dateKey
    const groups = []
    let current = null

    for (const cell of owned[i].sort((a, b) => a.y0 - b.y0)) {
      const text = cell.words.map(w => w.text).join(' ')
      const confidence = Math.min(...cell.words.map(w => w.confidence ?? 100))
      const line = readLine(text)
      if (!line || line.kind === 'total') continue

      if (line.kind === 'noise') {
        notes.push(`${where}: could not make sense of "${line.text}", so it was skipped.`)
        continue
      }
      if (line.kind === 'vendor') {
        current = { vendor: line.name, confidence, items: [] }
        groups.push(current)
        continue
      }
      if (!current) {
        current = { vendor: '', confidence: 100, items: [] }
        groups.push(current)
      }
      current.items.push({ name: line.name, qty: line.qty, confidence })
    }

    for (const g of groups) {
      if (g.items.length === 0) notes.push(`${where}: "${g.vendor}" had no dishes under it and was left out.`)
    }
    const kept = groups.filter(g => g.items.length > 0)
    if (kept.length === 0) return

    // The same date twice on one sheet: keep both lists under the one day.
    const existing = byDate.get(h.dateKey)
    if (existing) existing.groups.push(...kept)
    else byDate.set(h.dateKey, { dateKey: h.dateKey, printedWeekday: h.printedWeekday, heading: h.heading, groups: kept })
  })

  return { days: [...byDate.values()].sort((a, b) => a.dateKey.localeCompare(b.dateKey)), notes }
}

/**
 * Catmull-Rom weights, the cubic used for the upscale. drawImage's own
 * smoothing reads worse and differs between browsers, so the same sheet would
 * import on one machine and fail on the next.
 */
function cubicWeights(t) {
  const t2 = t * t
  const t3 = t2 * t
  return [
    -0.5 * t3 + t2 - 0.5 * t,
    1.5 * t3 - 2.5 * t2 + 1,
    -1.5 * t3 + 2 * t2 + 0.5 * t,
    0.5 * t3 - 0.5 * t2,
  ]
}

/** Bicubic resample of one ImageData, as two separable passes. */
function upscale(source, width, height) {
  const clampX = x => Math.min(source.width - 1, Math.max(0, x))
  const clampY = y => Math.min(source.height - 1, Math.max(0, y))

  // Horizontal pass into a float buffer, so the vertical pass reads unrounded
  // values and the two roundings do not compound.
  const wide = new Float32Array(width * source.height * 4)
  const xScale = source.width / width

  for (let x = 0; x < width; x++) {
    const at = (x + 0.5) * xScale - 0.5
    const base = Math.floor(at)
    const weights = cubicWeights(at - base)

    for (let y = 0; y < source.height; y++) {
      for (let channel = 0; channel < 4; channel++) {
        let sum = 0
        for (let k = 0; k < 4; k++) {
          sum += weights[k] * source.data[(y * source.width + clampX(base - 1 + k)) * 4 + channel]
        }
        wide[(y * width + x) * 4 + channel] = sum
      }
    }
  }

  const out = new Uint8ClampedArray(width * height * 4)
  const yScale = source.height / height

  for (let y = 0; y < height; y++) {
    const at = (y + 0.5) * yScale - 0.5
    const base = Math.floor(at)
    const weights = cubicWeights(at - base)

    for (let x = 0; x < width; x++) {
      for (let channel = 0; channel < 4; channel++) {
        let sum = 0
        for (let k = 0; k < 4; k++) {
          sum += weights[k] * wide[(clampY(base - 1 + k) * width + x) * 4 + channel]
        }
        out[(y * width + x) * 4 + channel] = sum
      }
    }
  }

  return new ImageData(out, width, height)
}

/** Draws the screenshot upscaled for OCR. */
function toCanvas(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const longEdge = Math.max(img.naturalWidth, img.naturalHeight)
      const room = Math.sqrt(MAX_PIXELS / (img.naturalWidth * img.naturalHeight))
      const factor = Math.max(1, Math.min(MAX_SCALE, TARGET_EDGE / longEdge, room))

      const native = document.createElement('canvas')
      native.width = img.naturalWidth
      native.height = img.naturalHeight
      const nativeCtx = native.getContext('2d', { willReadFrequently: true })
      nativeCtx.drawImage(img, 0, 0)

      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.naturalWidth * factor)
      canvas.height = Math.round(img.naturalHeight * factor)
      const ctx = canvas.getContext('2d', { willReadFrequently: true })

      if (factor === 1) {
        ctx.drawImage(img, 0, 0)
      } else {
        const source = nativeCtx.getImageData(0, 0, native.width, native.height)
        ctx.putImageData(upscale(source, canvas.width, canvas.height), 0, 0)
      }

      resolve(canvas)
    }
    img.onerror = () => reject(new Error('Could not decode that image.'))
    img.src = dataUrl
  })
}

export const internals = { collectWords, groupRows, readHeading, readLine }

/**
 * @param dataUrl      base64 image data URL, as produced by prepareImage
 * @param fallbackDate YYYY-MM-DD used only when the image shows no date heading
 * @param onProgress   optional 0..1 progress callback
 */
export async function extractOrdersLocally(dataUrl, { fallbackDate = null, onProgress } = {}) {
  const canvas = await toCanvas(dataUrl)

  const worker = await createWorker('eng', 1, {
    logger: onProgress ? m => m.status === 'recognizing text' && onProgress(m.progress) : undefined,
  })

  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO })
    // v7 omits the block tree unless it is asked for, and the word boxes in it
    // are what the layout pass depends on.
    const page = (await worker.recognize(canvas, {}, { blocks: true })).data
    const words = collectWords(page)
    if (words.length === 0) throw new Error('No text could be read from that image.')

    const result = parseWords(words, { today: new Date(), fallbackDate })
    if (result.days.length === 0) {
      throw new Error('No dishes were recognised. Check the screenshot shows the quantity and dish lines.')
    }
    return { ...result, engine: 'local' }
  } finally {
    await worker.terminate()
  }
}
