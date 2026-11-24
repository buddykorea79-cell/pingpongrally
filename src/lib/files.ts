// 첨부 규칙(설계서 5.2·12.2): 이미지 자동 압축, 문서 10MB 이하, 실행 파일 차단

export const MAX_FILE_BYTES = 10 * 1024 * 1024
export const MAX_ATTACHMENTS = 6

const BLOCKED_EXT = new Set([
  'exe', 'msi', 'bat', 'cmd', 'com', 'scr', 'ps1', 'vbs', 'vbe', 'js', 'jse', 'jar', 'sh', 'apk', 'dmg', 'pkg',
  'app', 'dll', 'reg', 'lnk', 'hta', 'wsf', 'cpl', 'msc', 'iso', 'img', 'html', 'htm', 'svg', 'xhtml',
])

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
  md: 'text/markdown',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  hwp: 'application/x-hwp',
  hwpx: 'application/vnd.hancom.hwpx',
  zip: 'application/zip',
}

export const ACCEPT_DOCS = Object.keys(MIME_BY_EXT)
  .filter((e) => !['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(e))
  .map((e) => `.${e}`)
  .join(',')

export const ACCEPT_IMAGES = 'image/jpeg,image/png,image/webp,image/gif'

export function extensionOf(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]{1,8})$/)
  return m ? m[1] : ''
}

export function contentTypeFor(name: string, fallback?: string): string {
  return MIME_BY_EXT[extensionOf(name)] ?? (fallback || 'application/octet-stream')
}

export function isImageFile(file: File): boolean {
  return /^image\/(jpeg|png|webp|gif)$/.test(file.type) || ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(extensionOf(file.name))
}

/** 올릴 수 없는 파일이면 이유를, 괜찮으면 null 을 돌려준다 */
export function validateFile(file: File): string | null {
  const ext = extensionOf(file.name)
  if (BLOCKED_EXT.has(ext)) return `실행 파일·웹 문서(.${ext})는 올릴 수 없어요.`
  if (!isImageFile(file) && !MIME_BY_EXT[ext]) return `지원하지 않는 형식이에요(.${ext || '확장자 없음'}). PDF·오피스·한글·이미지 파일을 올려 주세요.`
  if (!isImageFile(file) && file.size > MAX_FILE_BYTES) return '문서는 10MB 이하만 올릴 수 있어요.'
  if (isImageFile(file) && file.size > 30 * 1024 * 1024) return '이미지가 너무 커요(30MB 이하).'
  return null
}

export interface PreparedImage {
  original: Blob
  thumb: Blob
  width: number
  height: number
}

/** 원본(가로 최대 1,280px·약 500KB)과 썸네일(400px·약 40KB) 두 벌을 만든다 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  const { default: imageCompression } = await import('browser-image-compression')
  const isGif = file.type === 'image/gif'
  const original = isGif && file.size < 2 * 1024 * 1024
    ? file
    : await imageCompression(file, { maxWidthOrHeight: 1280, maxSizeMB: 0.5, useWebWorker: true, initialQuality: 0.85 })
  const thumb = await imageCompression(file, {
    maxWidthOrHeight: 400,
    maxSizeMB: 0.05,
    useWebWorker: true,
    fileType: 'image/jpeg',
    initialQuality: 0.8,
  })
  let width = 0
  let height = 0
  try {
    const bmp = await createImageBitmap(original)
    width = bmp.width
    height = bmp.height
    bmp.close()
  } catch {
    /* 크기를 몰라도 표시는 된다 */
  }
  return { original, thumb, width, height }
}

export function fileIconTone(name: string): { label: string; tone: string } {
  const ext = extensionOf(name)
  if (ext === 'pdf') return { label: 'PDF', tone: 'bg-[#E5484D] text-white' }
  if (['hwp', 'hwpx'].includes(ext)) return { label: 'HWP', tone: 'bg-[#1C8BD8] text-white' }
  if (['doc', 'docx'].includes(ext)) return { label: 'DOC', tone: 'bg-[#2B5BD7] text-white' }
  if (['xls', 'xlsx', 'csv'].includes(ext)) return { label: ext === 'csv' ? 'CSV' : 'XLS', tone: 'bg-[#1E8E54] text-white' }
  if (['ppt', 'pptx'].includes(ext)) return { label: 'PPT', tone: 'bg-[#D9622B] text-white' }
  if (ext === 'zip') return { label: 'ZIP', tone: 'bg-ink-600 text-white' }
  return { label: (ext || 'FILE').toUpperCase().slice(0, 4), tone: 'bg-ink-500 text-white' }
}
