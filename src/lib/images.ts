import { AppError, errMsg, rpc } from './api'
import { supabase } from './supabase'
import { can, useAuth } from './auth'

const BUCKET = 'product-images'
const MARK = `/${BUCKET}/`
const THUMB_SIZE = 360
const bucket = () => supabase.storage.from(BUCKET)
const put = (path: string, blob: Blob) => bucket().upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false })
const pathOf = (url: string) => url.slice(url.indexOf(MARK) + MARK.length)

/** الصورة المصغرة بتتخزن جنب الأصلية بنفس الاسم + _s، وهي اللي بتظهر في القوايم */
export function thumbUrl(url: string): string | null {
  return url.includes(MARK) && url.endsWith('.jpg') ? url.replace(/\.jpg$/, '_s.jpg') : null
}

/** بيصغّر الصورة لأقصى 900px وجودة 80% قبل الرفع */
export async function compressImage(file: Blob, max = 900, quality = 0.8): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image()
      i.onload = () => res(i)
      i.onerror = () => rej(new AppError('الملف ده مش صورة'))
      i.src = url
    })
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.max(1, Math.round(img.naturalWidth * scale))
    const h = Math.max(1, Math.round(img.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)
    return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new AppError('مقدرناش نجهز الصورة'))), 'image/jpeg', quality))
  } finally {
    URL.revokeObjectURL(url)
  }
}

let shopId: string | null = null

export async function uploadProductImage(file: File): Promise<string> {
  const [blob, thumb] = await Promise.all([compressImage(file), compressImage(file, THUMB_SIZE, 0.75)])
  shopId ??= useAuth.getState().profile?.shop_id ?? (await rpc<string | null>('my_shop'))
  if (!shopId) throw new AppError('حسابك لسه مش متفعّل')
  const name = `${shopId}/p_${Date.now()}`
  // لو المصغرة فشلت القايمة بتعرض الأصلية، فمش بتوقف الرفع
  const [{ error }] = await Promise.all([put(`${name}.jpg`, blob), put(`${name}_s.jpg`, thumb)])
  if (error) throw new AppError(`مقدرناش نرفع الصورة: ${errMsg(error)}`)
  return bucket().getPublicUrl(`${name}.jpg`).data.publicUrl
}

const madeThumbs = new Set<string>()

/** الصور اللي اترفعت قبل المصغرات: بنعملها مصغرة أول ما تظهر */
export async function makeThumb(url: string) {
  const t = thumbUrl(url)
  if (!t || madeThumbs.has(url) || !can('products')) return
  madeThumbs.add(url)
  try {
    const res = await fetch(url)
    if (res.ok) await put(pathOf(t), await compressImage(await res.blob(), THUMB_SIZE, 0.75))
  } catch {
    /* القايمة بتعرض الأصلية */
  }
}

/** بعد تغيير صورة منتج: الملف القديم بيتمسح لو مفيش منتج تاني بيستخدمه ("صورة للكل" أو منتج محذوف) */
export async function deleteImageIfUnused(url: string) {
  if (!url.includes(MARK)) return
  const { count, error } = await supabase.from('products').select('id', { count: 'exact', head: true }).eq('image_url', url)
  if (error || count !== 0) return
  const t = thumbUrl(url)
  await bucket().remove(t ? [pathOf(url), pathOf(t)] : [pathOf(url)])
}
