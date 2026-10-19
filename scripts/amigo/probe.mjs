// بيجرب API موقع amigogascreen زي ما الموقع نفسه بيناديه
const API = 'https://amigogascreenapi.03800.cn/api/TDMall/Public/PublicApiDefine'
const auth = 'basic ' + Buffer.from(JSON.stringify({ ClientId: 'a1b2c3d4e5f6g7h8', FlashToken: false, Com_Guid: 5, Ref_Guid: '', AppType: 1, OpenId: '' })).toString('base64')

export async function call(addr, procin) {
  const body = new URLSearchParams({ DbApiAddr: addr, ...(procin ? { Procin: JSON.stringify(procin) } : {}), Procout: JSON.stringify({ code: 0, msg: '' }) })
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: auth, Origin: 'https://stock.amigogascreen.com', Referer: 'https://stock.amigogascreen.com/' },
    body,
  })
  return r.json()
}

if (process.argv[2]) {
  const j = await call(process.argv[2], process.argv[3] ? JSON.parse(process.argv[3]) : undefined)
  console.log(JSON.stringify(j, null, 1).slice(0, Number(process.argv[4] || 3000)))
}
