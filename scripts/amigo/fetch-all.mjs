// بيجيب كل التوفيقات من الموقع (صفحة صفحة، بهدوء) ويحفظها في all.json
import { writeFileSync } from 'node:fs'
import { call } from './probe.mjs'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const cats = (await call('define_getGoodsCategory')).Obj
const out = []
for (const c of cats) {
  for (let page = 1; page < 200; page++) {
    const j = await call('define_getGoods', { category_id: c.id, keyword: '', mobile_name: '', pageIndex: page, pageSize: 50 })
    const rows = j.Obj ?? []
    for (const r of rows) {
      out.push({
        id: r.id,
        code: r.title.trim(),
        category: c.title.trim(),
        devices: JSON.parse(r.mobiles || '[]').map((m) => m.mobile_name.trim()).filter(Boolean),
      })
    }
    if (rows.length < 50) break
    await sleep(400)
  }
}
writeFileSync(new URL('./all.json', import.meta.url), JSON.stringify(out, null, 1))
const byCat = {}
for (const r of out) byCat[r.category] = (byCat[r.category] ?? 0) + 1
console.log('items', out.length, byCat, 'devices', out.reduce((s, r) => s + r.devices.length, 0))
