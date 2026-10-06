import type { MediaAsset } from '@/lib/weibo/components/media-region/media-region-model'

export interface MediaUrl {
  url: string
  fallbackUrls?: string[]
  /** 文件名（不含目录），形如 `20261007_143052.jpg` */
  filename: string
  type: 'image' | 'video' | 'audio'
}

export interface MediaSaveResult {
  successCount: number
  failCount: number
  /** Media entries which failed all of their candidate URLs. */
  failedUrls?: MediaUrl[]
}

export type DownloadProgress = { stage: 'downloading'; completed: number; total: number }

export type DownloadProgressCallback = (progress: DownloadProgress) => void

interface MediaHeadResponse {
  ok: boolean
  size?: number
  error?: string
}

interface MediaFetchResponse {
  ok: boolean
  data?: string
  contentType?: string
  error?: string
}

function base64ToBlob(data: string, contentType = 'application/octet-stream'): Blob {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }

  return new Blob([bytes], { type: contentType })
}

export function formatDownloadTimestamp(date: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  const ymd = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
  const hms = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  return `${ymd}_${hms}`
}

const sinaimgDownloadSizes = [
  'large',
  'mw2000',
  'woriginal',
  'original',
  'orj1080',
  'orj960',
  'bmiddle',
  'thumbnail',
]

function canUseBackgroundFetch(): boolean {
  return typeof browser !== 'undefined' && Boolean(browser.runtime?.sendMessage)
}

async function estimateMediaSize(url: string): Promise<number> {
  if (!canUseBackgroundFetch()) {
    const response = await fetch(url, { method: 'HEAD' })
    return Number.parseInt(response.headers.get('content-length') || '0', 10)
  }

  const response = (await browser.runtime.sendMessage({
    type: 'media-head',
    url,
  })) as MediaHeadResponse

  if (!response.ok) {
    throw new Error(response.error || '媒体大小预估失败')
  }

  return response.size ?? 0
}

function uniqueUrls(urls: Array<string | undefined>): string[] {
  const seen = new Set<string>()
  const unique: string[] = []

  for (const url of urls) {
    const trimmed = normalizeDownloadUrl(url)
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    unique.push(trimmed)
  }

  return unique
}

function normalizeDownloadUrl(url: string | undefined): string | undefined {
  const trimmed = url?.trim()
  if (!trimmed) return undefined

  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`
  }

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol === 'http:' && isWeiboMediaHost(parsed.hostname)) {
      parsed.protocol = 'https:'
      return parsed.toString()
    }
  } catch {
    return trimmed
  }

  return trimmed
}

function isWeiboMediaHost(hostname: string): boolean {
  return (
    hostname === 'sinaimg.cn' ||
    hostname.endsWith('.sinaimg.cn') ||
    hostname === 'weibocdn.com' ||
    hostname.endsWith('.weibocdn.com')
  )
}

function isSinaimgHost(hostname: string): boolean {
  return hostname === 'sinaimg.cn' || hostname.endsWith('.sinaimg.cn')
}

function expandSinaimgImageUrls(urls: Array<string | undefined>): string[] {
  const normalized = uniqueUrls(urls)
  const expanded: string[] = [...normalized]

  for (const url of normalized) {
    try {
      const parsed = new URL(url)
      if (!isSinaimgHost(parsed.hostname)) {
        continue
      }

      const parts = parsed.pathname.split('/')
      if (parts.length < 3) {
        continue
      }

      const filename = parts.at(-1)
      if (!filename) {
        continue
      }

      for (const size of sinaimgDownloadSizes) {
        const candidate = new URL(parsed.toString())
        candidate.pathname = `/${size}/${filename}`
        expanded.push(candidate.toString())
      }
    } catch {
      // Keep the original URL; malformed candidates will fail in the fetch layer.
    }
  }

  return uniqueUrls(expanded)
}

function createMediaFallbackUrls(
  url: string,
  fallbackUrls: string[] | undefined,
  type: MediaUrl['type'],
): string[] | undefined {
  const urls =
    type === 'image'
      ? expandSinaimgImageUrls([url, ...(fallbackUrls ?? [])])
      : uniqueUrls([url, ...(fallbackUrls ?? [])])

  return urls.length > 1 ? urls : undefined
}

/**
 * 让 background 用带 Referer 的 fetch 取回字节。
 *
 * 不能把原始 URL 直接交给 downloads API：那条请求没有 Referer、还带
 * Sec-Fetch-Site: none，微博 CDN 会按 403 挡掉。也不能用 data: URL 落盘——
 * Chrome 会忽略 data: URL 上的 filename，存出来是一堆「下载 (N).jpg」。
 */
async function fetchMediaBytes(
  url: string,
): Promise<{ ok: true; blob: Blob } | { ok: false; error: string }> {
  const response = (await browser.runtime.sendMessage({
    type: 'media-fetch',
    url,
  })) as MediaFetchResponse | undefined

  if (!response?.ok || !response.data) {
    return { ok: false, error: response?.error ?? 'media-fetch-empty-response' }
  }

  return { ok: true, blob: base64ToBlob(response.data, response.contentType) }
}

/**
 * 把字节存成文件。
 *
 * 走的是 anchor + blob URL：这条路上浏览器会保留 `download` 属性里的文件名。
 * 另外两条路都不行——直传 CDN URL 会被微博 CDN 按 403 挡掉（带 Referer 头也没用），
 * 而 downloads API 收到本地 blob/data URL 时会丢弃 filename。
 *
 * 代价：`download` 属性不认路径，所以文件只能平铺在下载目录根下。
 */
async function saveMediaToFile(mediaUrl: MediaUrl): Promise<void> {
  const urls = uniqueUrls([mediaUrl.url, ...(mediaUrl.fallbackUrls ?? [])])
  const errors: string[] = []

  for (const url of urls) {
    try {
      const fetched = await fetchMediaBytes(url)
      if (!fetched.ok) {
        errors.push(`${url}: ${fetched.error}`)
        continue
      }

      triggerBlobDownload(fetched.blob, mediaUrl.filename)
      return
    } catch (error) {
      errors.push(`${url}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  throw new Error(errors.join('; ') || '媒体保存失败')
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = filename
  link.style.display = 'none'

  document.body.append(link)
  link.click()
  link.remove()

  // 立即 revoke 会让下载拿不到数据，留够时间再回收。
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
}

/**
 * 从 URL 推断文件扩展名
 */
export function inferExtension(url: string, type: MediaUrl['type'] = 'image'): string {
  const match = url.match(/\.(jpg|jpeg|png|gif|webp|mp4|mov|mp3|m4a|aac|wav|ogg)(\?|$)/i)
  const extension = match?.[1]
  if (extension) {
    return extension.toLowerCase()
  }
  // 默认根据类型推断
  if (type === 'audio') return 'm4a'
  return url.includes('video') || url.includes('.mp4') ? 'mp4' : 'jpg'
}

/**
 * 生成文件名：`时间戳.扩展名`；一批多张素材时追加序号，避免相互覆盖。
 */
function buildMediaFilename(
  timestamp: string,
  index: number,
  total: number,
  url: string,
  type: MediaUrl['type'],
): string {
  const suffix = total > 1 ? `_${index}` : ''
  return `${timestamp}${suffix}.${inferExtension(url, type)}`
}

/** 将媒体呈现 module 已经规范化的素材转换为下载候选。 */
export function extractMediaUrls(assets: readonly MediaAsset[]): MediaUrl[] {
  const entries: Array<Omit<MediaUrl, 'filename'>> = []
  const seen = new Set<string>()

  const add = (url: string | undefined, type: MediaUrl['type'], fallbackUrls?: string[]) => {
    const normalized = normalizeDownloadUrl(url)
    if (!normalized || seen.has(normalized)) return
    seen.add(normalized)
    entries.push({
      url: normalized,
      fallbackUrls:
        type === 'image' ? createMediaFallbackUrls(normalized, fallbackUrls, type) : undefined,
      type,
    })
  }

  for (const asset of assets) {
    if (asset.kind === 'image') {
      add(asset.image.largeUrl, 'image', asset.image.downloadUrls)
      add(asset.image.livePhotoVideoUrl, 'video')
      continue
    }

    if (asset.kind === 'video') {
      add(asset.video.videoDownloadUrl || asset.video.videoStreamUrl, 'video')
      continue
    }

    if (asset.media.type === 'audio' || asset.media.type === 'podcast_audio') {
      add(asset.media.streamUrl, 'audio')
    } else if (asset.media.type === 'live') {
      add(asset.media.replayUrl || asset.media.downloadUrl, 'video')
    } else {
      add(asset.media.downloadUrl || asset.media.streamUrl, 'video')
    }
  }

  const timestamp = formatDownloadTimestamp()

  return entries.map((entry, position) => ({
    ...entry,
    filename: buildMediaFilename(timestamp, position + 1, entries.length, entry.url, entry.type),
  }))
}

const MEDIA_SAVE_CONCURRENCY = 3
/** HEAD 探测很轻，可以比实际下载更激进。 */
const MEDIA_HEAD_CONCURRENCY = 5

/** 单个媒体的下载候选，文件名取当前时间戳。 */
export function createMediaUrl(url: string, type: MediaUrl['type'] = 'image'): MediaUrl {
  const normalized = normalizeDownloadUrl(url) ?? url

  return {
    url: normalized,
    fallbackUrls:
      type === 'image' ? createMediaFallbackUrls(normalized, undefined, type) : undefined,
    filename: buildMediaFilename(formatDownloadTimestamp(), 1, 1, normalized, type),
    type,
  }
}

/**
 * 预估总大小（HEAD 请求，限制并发）
 */
export async function estimateTotalSize(urls: MediaUrl[]): Promise<number> {
  let total = 0

  for (let i = 0; i < urls.length; i += MEDIA_HEAD_CONCURRENCY) {
    const batch = urls.slice(i, i + MEDIA_HEAD_CONCURRENCY)
    const sizes = await Promise.all(
      batch.map(async (mediaUrl) => {
        try {
          return await estimateMediaSize(mediaUrl.url)
        } catch {
          return 0
        }
      }),
    )
    total += sizes.reduce((sum, size) => sum + size, 0)
  }

  return total
}

/**
 * 逐个存进用户授权的文件夹，不做打包。
 *
 * 每个素材按候选 URL 依次尝试：主图失败（403、尺寸不存在等）就换下一个候选。
 */
export async function downloadMediaToFolder(
  urls: MediaUrl[],
  onProgress?: DownloadProgressCallback,
): Promise<MediaSaveResult> {
  if (urls.length === 0) {
    throw new Error('没有可下载的媒体资源')
  }

  let successCount = 0
  let failCount = 0
  let completedCount = 0
  const failedUrls: MediaUrl[] = []

  const reportProgress = (progress: DownloadProgress) => {
    try {
      onProgress?.(progress)
    } catch {
      // Progress reporting must never affect the download itself.
    }
  }

  // 全失败时把每个候选 URL 的具体原因带出去，否则只剩一句没法排查的“下载失败”。
  const failureReasons: string[] = []

  for (let i = 0; i < urls.length; i += MEDIA_SAVE_CONCURRENCY) {
    const batch = urls.slice(i, i + MEDIA_SAVE_CONCURRENCY)
    const batchResults = await Promise.allSettled(
      batch.map((mediaUrl) => saveMediaToFile(mediaUrl)),
    )

    for (const [j, mediaUrl] of batch.entries()) {
      const result = batchResults[j]
      if (result?.status === 'fulfilled') {
        successCount++
      } else {
        failCount++
        failedUrls.push(mediaUrl)
        if (result) failureReasons.push(String(result.reason?.message ?? result.reason))
      }
      completedCount++
      reportProgress({ stage: 'downloading', completed: completedCount, total: urls.length })
    }
  }

  if (successCount === 0) {
    const detail = failureReasons.join('; ')
    throw new Error(detail ? `所有资源下载失败：${detail}` : '所有资源下载失败')
  }

  return failedUrls.length > 0
    ? { successCount, failCount, failedUrls }
    : { successCount, failCount }
}
