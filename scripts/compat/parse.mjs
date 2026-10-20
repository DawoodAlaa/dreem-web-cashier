// بيحوّل rows.txt (صف = اسكرينة واحدة بتركب على كل الموبايلات اللي فيه) لـ groups.json
// كل جهاز بيتكتب باسم الماركة: "Oppo A5s". ولما السلسلة تتكتب مرة واحدة ("Narzo 10 / 10A") بنكمّلها ("Narzo 10A").
import { readFileSync, writeFileSync } from 'node:fs'

const text = readFileSync(new URL('./rows.txt', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
// سلاسل بتتكمّل لما بعدها رقم بس (زي Reno 4 / 5 / 6)
const SERIES = ['Narzo', 'Spark', 'Reno', 'Nova', 'Camon', 'Pova', 'Hot', 'Pop', 'Play', 'Enjoy', 'Mate', 'Poco']
const DIGITS = /^\d+[A-Za-z]*(?: (?:5G|4G|4G\/5G|Pro|Plus|Lite|Max|SE|Prime|Neo|Go))*$/i
// Poco بتكمّل بس نفس حرف الموديل (X3 ← X3 Pro، M4 ← M5) ومش بتكمّل الأرقام، وNarzo بتكمّل N53
const LETTER = { Poco: /^[A-Z]\d+/, Narzo: /^N\d+/ }
const NO_DIGITS = new Set(['Poco'])

const blocks = text.split(/^صف\s+(\d+)\s*$/m)
const groups = []
const inherited = []
for (let i = 1; i < blocks.length; i += 2) {
  const no = Number(blocks[i])
  const body = blocks[i + 1]
  const segments = body
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' | ')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
  const devices = []
  for (const seg of segments) {
    const m = seg.match(/^([^:]+):\s*(.+)$/)
    if (!m) throw new Error(`صف ${no}: مش لاقي الماركة في "${seg}"`)
    const brand = m[1].trim()
    const items = m[2].split(/\s+\/\s+/).map((x) => x.trim()).filter(Boolean)
    let series = null // السلسلة الحالية، مثلاً "Narzo"
    let letter = '' // أول حرف في موديل السلسلة (لـ Poco)
    for (const raw of items) {
      let item = raw
      const word = raw.split(' ')[0]
      if (SERIES.includes(word) && /\d/.test(raw)) {
        series = word
        letter = raw.split(' ')[1]?.[0] ?? ''
      } else if (
        series &&
        ((!NO_DIGITS.has(series) && DIGITS.test(raw)) || (LETTER[series]?.test(raw) && (series !== 'Poco' || raw[0] === letter)))
      ) {
        item = `${series} ${raw}`
        inherited.push(`صف ${no}: ${brand} "${raw}" ← "${item}"`)
      } else {
        series = null
      }
      devices.push(brand === 'متنوع' ? item : `${brand} ${item}`)
    }
  }
  groups.push({ name: `صف ${no}`, devices: [...new Set(devices)] })
}

writeFileSync(new URL('./groups.json', import.meta.url), JSON.stringify(groups))
console.log('صفوف:', groups.length, ' أجهزة:', groups.reduce((s, g) => s + g.devices.length, 0))
console.log('\nأمثلة:')
for (const n of [1, 4, 18, 36, 41]) console.log(`صف ${n} (${groups[n - 1].devices.length}):`, groups[n - 1].devices.slice(0, 8).join(' | '))
console.log('\nالسلاسل اللي اتكمّلت:\n' + inherited.join('\n'))
