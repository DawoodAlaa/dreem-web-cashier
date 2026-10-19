// قايمة الجرابات الجاهزة (231 جراب) — نفس قايمة البرنامج القديم بالظبط

const CASES: Record<string, string[]> = {
  Samsung: [
    'A01', 'A03', 'A04', 'A04s', 'A05', 'A05s', 'A06', 'A07', 'A10', 'A11', 'A12', 'A13', 'A14', 'A15', 'A16', 'A17', 'A20',
    'A21s', 'A22', 'A23', 'A25', 'A31', 'A33', 'A34', 'A35', 'A36', 'A37', 'A50', 'A51', 'A52', 'A53', 'A54', 'A55', 'A56',
    'A57', 'A70', 'A72', 'A73', 'S8', 'S9', 'S10', 'S21 Ultra', 'S22', 'S22 Ultra', 'S23 Ultra', 'S24 Ultra', 'S25 Ultra',
    'S26 Ultra', 'Note 8', 'Note 10', 'Note 10+', 'Note 10 Lite', 'Note 20 Ultra', 'M32', 'M52', 'J6+', 'J7 Pro', 'J7 Prime',
    'G530',
  ],
  OPPO: [
    'Reno 3', 'Reno 3 Pro', 'Reno 4', 'Reno 4 Pro', 'Reno 5', 'Reno 6', 'Reno 7', 'Reno 8', 'Reno 8T', 'Reno 10', 'Reno 11',
    'Reno 11F', 'Reno 12', 'Reno 13', 'Reno 13F', 'Reno 14/14F', 'Reno 15', 'A3s', 'A3X', 'A5', 'A5 Pro', 'A5X', 'A6 Pro',
    'A9 2020', 'A15', 'A16', 'A17', 'A17K', 'A18', 'A52', 'A53', 'A54', 'A55', 'A57', 'A58', 'A59', 'A60', 'A74', 'A76', 'A77',
    'A78', 'A79', 'A80', 'A94', 'A98', 'F9', 'F11 Pro', 'F17',
  ],
  Realme: [
    'C30s', 'C35', 'C55', 'C61', 'C63', 'C65', 'C67', 'C71', 'C75', 'C85', 'Realme 3 Pro', 'Realme 5', 'Realme 6 Pro',
    'Realme 7i', 'Realme 7 Pro', 'Realme 10', 'Realme 11', 'Realme 12', 'Realme 12+', 'Realme 12 Pro+', 'Realme 12x',
    'Realme 13', 'Note 60',
  ],
  Redmi: [
    '8A', '9', '9A', '9C', '9T', '10', '10A', '10C', '12', '12C', '13', '13C', '14C', '15C', 'Note 8', 'Note 8 Pro', 'Note 9',
    'Note 9S', 'Note 10', 'Note 10 Pro', 'Note 11 Pro', 'Note 12', 'Note 13', 'Note 13 Pro', 'Note 14', 'Note 14 Pro',
    'Note 15', 'Xiaomi 11 Lite', 'A1+', 'A3', 'A5', 'C75', 'Poco C65', 'Poco X5', 'Poco F3',
  ],
  Huawei: [
    'Y5 2018', 'Y6 2018', 'Y6 Pro', 'Y7 2018', 'Y7 2019', 'Y7A', 'Y8P', 'Y9 2019', 'Nova 3i', 'Nova 5T', 'Nova 7i',
    'P20 Lite', 'Mate 10 Lite',
  ],
  Honor: ['Honor 400', 'Honor 400 Lite', 'Honor X9D'],
  Vivo: ['Y03', 'Y19s', 'Y20s', 'Y21D', 'Y28', 'Y29', 'Y30/Y50', 'Y53', 'V27e', 'V30', 'V40 Lite', 'Ry 90-5G'],
  Infinix: ['Hot 11S', 'Hot 50i', 'Hot 60i'],
  iPhone: [
    '6', '6 Plus', '6s', '6s Plus', '7', '7 Plus', '8', '8 Plus', 'X', 'XR', 'XS', 'XS Max', '11', '11 Pro', '11 Pro Max',
    '12 Mini', '12', '12 Pro', '12 Pro Max', '13 Mini', '13', '13 Pro', '13 Pro Max', '14', '14 Plus', '14 Pro',
    '14 Pro Max', '15', '15 Plus', '15 Pro', '15 Pro Max', '16', '16 Plus', '16 Pro', '16 Pro Max',
  ],
}

function caseName(brand: string, model: string) {
  const m = model.toLowerCase()
  const hasBrand = m.startsWith(brand.toLowerCase()) || m.startsWith('poco') || m.startsWith('xiaomi')
  return `جراب ${hasBrand ? model : `${brand} ${model}`}`
}

/** أندرويد: جملة 40، بيع 70، أقل سعر 50 — آيفون: جملة 50، بيع 150، أقل سعر 75 */
export function starterCaseGroups() {
  return Object.entries(CASES).map(([brand, models]) => {
    const iphone = brand === 'iPhone'
    return { cost: iphone ? 50 : 40, sell: iphone ? 150 : 70, minSell: iphone ? 75 : 50, names: models.map((m) => caseName(brand, m)) }
  })
}
