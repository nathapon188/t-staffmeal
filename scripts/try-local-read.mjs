// Runs the layout logic in src/lib/localExtract.js against a real screenshot,
// from Node.
//
//   node scripts/try-local-read.mjs [path-to-screenshot.png]
//
// The app enlarges the image on a canvas before OCR, which Node has no
// equivalent for, so treat this as a lower bound on accuracy and confirm real
// changes in the app itself.
import { PSM, createWorker } from 'tesseract.js'
import { fileURLToPath } from 'node:url'
import { internals, parseWords } from '../src/lib/localExtract.js'

const IMAGE = process.argv[2] ?? fileURLToPath(new URL('./sample-order.png', import.meta.url))

const reader = await createWorker('eng', 1)
await reader.setParameters({ tessedit_pageseg_mode: PSM.AUTO })
const page = (await reader.recognize(IMAGE, {}, { blocks: true })).data
await reader.terminate()

const words = internals.collectWords(page)
console.log(`words: ${words.length}`)
for (const row of internals.groupRows(words)) {
  console.log('  |', row.words.map(w => `${w.text}(${Math.round(w.confidence)})`).join(' '))
}

const { days, notes } = parseWords(words)
for (const day of days) {
  console.log(`\n== ${day.dateKey}  (heading "${day.heading}")`)
  for (const group of day.groups) {
    console.log(`   ${group.vendor || '(no restaurant)'}`)
    for (const item of group.items) {
      console.log(`     ${String(item.qty).padStart(3)}  ${item.name}${item.confidence < 60 ? '   <- low confidence' : ''}`)
    }
  }
}
if (notes.length) console.log('\nnotes:\n  ' + notes.join('\n  '))
