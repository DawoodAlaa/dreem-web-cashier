// بيجهز بيانات الاستيراد من all.json: اسم المنتج، النوع، الملاحظة، والأجهزة (+ اسم iPhone بدل IP)
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const KINDS = {
  '0.4MM BIG EDGE': { kind: 'edge', suffix: '(0.4 حواف)' },
  '0.3MM PRIVACY': { kind: 'privacy', suffix: '(برايفسي)' },
}
const all = JSON.parse(readFileSync(new URL('./all.json', import.meta.url), 'utf8'))
const data = all.map((r) => {
  const K = KINDS[r.category]
  if (!K) throw new Error('نوع جديد: ' + r.category)
  const devs = r.devices.map((d) => d.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const set = new Set(devs)
  for (const d of devs) if (/^IP\s*/i.test(d)) set.add('iPhone ' + d.replace(/^IP\s*/i, ''))
  return { pname: `اسكرينة ${r.code} ${K.suffix}`, kind: K.kind, note: `كتالوج Amigo — ${r.category}`, devices: [...set] }
})
const json = JSON.stringify(data)
if (json.includes('$amigo$')) throw new Error('علامة الاقتباس موجودة في البيانات')
writeFileSync(new URL('./import-data.json', import.meta.url), json)
console.log(
  JSON.stringify({
    items: data.length,
    edge: data.filter((d) => d.kind === 'edge').length,
    privacy: data.filter((d) => d.kind === 'privacy').length,
    devices: data.reduce((s, d) => s + d.devices.length, 0),
    dupNames: data.length - new Set(data.map((d) => d.pname)).size,
    bytes: Buffer.byteLength(json),
    sha256: createHash('sha256').update(json).digest('hex'),
    sample: data[4],
  }),
)
