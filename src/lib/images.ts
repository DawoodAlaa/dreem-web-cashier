import { AppError, errMsg, rpc } from './api'
import { supabase } from './supabase'
import { useAuth } from './auth'

/** بيصغّر الصورة لأقصى 900px وجودة 80% قبل الرفع */
export async function compressImage(file: File, max = 900, quality = 0.8): Promise<Blob> {
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
  const blob = await compressImage(file)
  shopId ??= useAuth.getState().profile?.shop_id ?? (await rpc<string | null>('my_shop'))
  if (!shopId) throw new AppError('حسابك لسه مش متفعّل')
  const path = `${shopId}/p_${Date.now()}.jpg`
  const bucket = supabase.storage.from('product-images')
  const { error } = await bucket.upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false })
  if (error) throw new AppError(`مقدرناش نرفع الصورة: ${errMsg(error)}`)
  return bucket.getPublicUrl(path).data.publicUrl
}
