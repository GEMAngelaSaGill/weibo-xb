import { defineBackground } from 'wxt/utils/define-background'

import {
  appendCheckinLog,
  loadAutoCheckinState,
  localDateString,
  saveAutoCheckinState,
  type CheckinTrigger,
} from '@/lib/weibo/checkin/checkin-log'
import type { MweiboFetchResponse } from '@/lib/weibo/platform/messages'

export default defineBackground(() => {
  void ensureMediaRequestHeaderRules()
  void ensureFallbackCheckinAlarm()

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'mweibo-fetch') {
      handleMweiboFetch(message as MweiboFetchMessage)
        .then(sendResponse)
        .catch((err: unknown) => {
          sendResponse({
            ok: false,
            error: err instanceof Error ? err.message : 'Unknown error',
          })
        })
      return true // async sendResponse
    }

    if (message?.type === 'media-head') {
      handleMediaHead(message as MediaHeadMessage, getMediaReferrer(sender.url))
        .then(sendResponse)
        .catch((err: unknown) => {
          sendResponse({
            ok: false,
            error: err instanceof Error ? err.message : 'Unknown error',
          })
        })
      return true
    }

    if (message?.type === 'checkin-claim') {
      // 内容脚本问「我现在可以自动签到吗」——决定权收在后台，避免多标签页各签一遍。
      claimAutoCheckin((message as { trigger?: CheckinTrigger }).trigger ?? 'auto-open')
        .then((granted) => sendResponse({ granted }))
        .catch(() => sendResponse({ granted: false }))
      return true
    }

    if (message?.type === 'media-fetch') {
      handleMediaFetch(message as MediaFetchMessage, getMediaReferrer(sender.url))
        .then(sendResponse)
        .catch((err: unknown) => {
          sendResponse({
            ok: false,
            error: err instanceof Error ? err.message : 'Unknown error',
          })
        })
      return true
    }
  })
})

// ─── m.weibo.cn fetch ───

interface MweiboFetchMessage {
  type: 'mweibo-fetch'
  url: string
}

export function assertAllowedMweiboFetchUrl(url: string): void {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'm.weibo.cn') {
    throw new Error('unsupported-mweibo-url')
  }

  const allowed =
    parsed.pathname === '/api/remind/unread' ||
    (parsed.pathname === '/api/container/getIndex' &&
      parsed.searchParams.get('page_type') === 'searchall')

  if (!allowed) {
    throw new Error('unsupported-mweibo-endpoint')
  }
}

function getResponseContentType(response: Response): string | undefined {
  return response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() || undefined
}

export async function handleMweiboFetch(message: MweiboFetchMessage): Promise<MweiboFetchResponse> {
  assertAllowedMweiboFetchUrl(message.url)

  const xsrfCookie = await browser.cookies.get({
    url: 'https://m.weibo.cn',
    name: 'XSRF-TOKEN',
  })

  const headers: Record<string, string> = {
    'x-requested-with': 'XMLHttpRequest',
    accept: 'application/json, text/plain, */*',
    ...(xsrfCookie?.value ? { 'x-xsrf-token': xsrfCookie.value } : {}),
  }

  const response = await fetch(message.url, {
    credentials: 'include',
    headers,
  })
  const contentType = getResponseContentType(response)

  if (!response.ok) {
    return {
      ok: false,
      error: `mweibo-fetch-failed:${response.status}`,
      status: response.status,
      contentType,
    }
  }

  if (contentType === 'text/html' || contentType === 'application/xhtml+xml') {
    return {
      ok: false,
      error: 'mweibo-fetch-unexpected-content',
      status: response.status,
      contentType,
    }
  }

  try {
    const data = await response.json()
    return { ok: true, data, status: response.status, contentType }
  } catch {
    return {
      ok: false,
      error: 'mweibo-fetch-unexpected-content',
      status: response.status,
      contentType,
    }
  }
}

// ─── media fetch proxy ───

interface MediaHeadMessage {
  type: 'media-head'
  url: string
}

interface MediaHeadResponse {
  ok: boolean
  size?: number
  error?: string
}

interface MediaFetchMessage {
  type: 'media-fetch'
  url: string
}

interface MediaFetchResponse {
  ok: boolean
  data?: string
  contentType?: string
  error?: string
}

const allowedMediaHostSuffixes = ['sinaimg.cn', 'sinajs.cn', 'weibocdn.com']
export const maxBackgroundMediaBytes = 150 * 1024 * 1024
const mediaRequestHeaderRuleId = 10_401

let mediaRequestHeaderRulesPromise: Promise<void> | null = null

export function createMediaRequestHeaderRule(): Browser.declarativeNetRequest.Rule {
  return {
    id: mediaRequestHeaderRuleId,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [
        {
          header: 'referer',
          operation: 'set',
          value: 'https://weibo.com/',
        },
        {
          header: 'Origin',
          operation: 'remove',
        },
      ],
    },
    condition: {
      regexFilter: '^https://[^/]+\\.(sinaimg\\.cn|sinajs\\.cn|weibocdn\\.com)/',
      // 取字节走的是 background 的 fetch（xmlhttprequest）；其余类型一并留着，
      // 页面自身加载微博图/视频时不带 Referer 也能拿到。
      resourceTypes: ['xmlhttprequest', 'media', 'image', 'other'],
    },
  }
}

async function ensureMediaRequestHeaderRules(): Promise<void> {
  if (!mediaRequestHeaderRulesPromise) {
    mediaRequestHeaderRulesPromise = installMediaRequestHeaderRules()
  }

  await mediaRequestHeaderRulesPromise
}

async function installMediaRequestHeaderRules(): Promise<void> {
  if (!browser.declarativeNetRequest?.updateSessionRules) return

  try {
    await browser.declarativeNetRequest.updateDynamicRules?.({
      removeRuleIds: [mediaRequestHeaderRuleId],
    })
  } catch (error) {
    console.warn('清理旧媒体下载动态请求头规则失败', error)
  }

  try {
    await browser.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [mediaRequestHeaderRuleId],
      addRules: [createMediaRequestHeaderRule()],
    })
  } catch (error) {
    console.warn('安装媒体下载请求头规则失败', error)
  }
}

function getMediaReferrer(senderUrl: string | undefined): string {
  if (!senderUrl) return 'https://weibo.com/'

  try {
    const parsed = new URL(senderUrl)
    const isWeiboPage =
      parsed.protocol === 'https:' &&
      (parsed.hostname === 'weibo.com' || parsed.hostname === 'www.weibo.com')

    if (isWeiboPage) {
      return `${parsed.origin}/`
    }
  } catch {
    // Fall back to the canonical Weibo origin below.
  }

  return 'https://weibo.com/'
}

function isAllowedMediaHost(hostname: string): boolean {
  return allowedMediaHostSuffixes.some(
    (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
  )
}

export function assertAllowedMediaUrl(url: string): void {
  const parsed = new URL(url)

  if (parsed.protocol !== 'https:') {
    throw new Error('unsupported-media-url')
  }

  if (!isAllowedMediaHost(parsed.hostname)) {
    throw new Error('unsupported-media-host')
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunks: string[] = []
  const chunkSize = 0x8000

  for (let i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)))
  }

  return btoa(chunks.join(''))
}

function getMediaRequestInit(
  referrer: string,
): Pick<RequestInit, 'credentials' | 'headers' | 'referrer' | 'referrerPolicy'> {
  return {
    credentials: 'include',
    headers: {
      accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,video/*',
    },
    referrer,
    referrerPolicy: 'unsafe-url',
  }
}

function isMediaContentType(contentType: string | null): contentType is string {
  return (
    contentType?.startsWith('image/') === true ||
    contentType?.startsWith('video/') === true ||
    contentType === 'application/octet-stream'
  )
}

function getMediaContentType(response: Response): string | null {
  return response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() || null
}

function getResponseContentLength(response: Response): number | null {
  const value = response.headers.get('content-length')
  if (!value) return null

  const size = Number.parseInt(value, 10)
  return Number.isFinite(size) && size >= 0 ? size : null
}

function concatenateChunks(chunks: Uint8Array[], totalLength: number): ArrayBuffer {
  const bytes = new Uint8Array(totalLength)
  let offset = 0

  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  return bytes.buffer
}

async function readArrayBufferWithLimit(
  response: Response,
): Promise<{ ok: true; data: ArrayBuffer } | { ok: false; error: string }> {
  const contentLength = getResponseContentLength(response)

  if (contentLength !== null && contentLength > maxBackgroundMediaBytes) {
    return { ok: false, error: 'media-fetch-too-large' }
  }

  if (!response.body) {
    if (contentLength === null) {
      return { ok: false, error: 'media-fetch-size-unknown' }
    }

    const data = await response.arrayBuffer()
    return data.byteLength > maxBackgroundMediaBytes
      ? { ok: false, error: 'media-fetch-too-large' }
      : { ok: true, data }
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalLength = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      totalLength += value.byteLength
      if (totalLength > maxBackgroundMediaBytes) {
        await reader.cancel()
        return { ok: false, error: 'media-fetch-too-large' }
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  return { ok: true, data: concatenateChunks(chunks, totalLength) }
}

export async function handleMediaHead(
  message: MediaHeadMessage,
  referrer: string,
): Promise<MediaHeadResponse> {
  assertAllowedMediaUrl(message.url)
  await ensureMediaRequestHeaderRules()

  const response = await fetch(message.url, {
    ...getMediaRequestInit(referrer),
    method: 'HEAD',
  })

  if (!response.ok) {
    return {
      ok: false,
      error: `media-head-failed:${response.status}`,
    }
  }

  if (!isMediaContentType(getMediaContentType(response))) {
    return {
      ok: false,
      error: 'unsupported-media-content-type',
    }
  }

  return {
    ok: true,
    size: Number.parseInt(response.headers.get('content-length') || '0', 10),
  }
}

export async function handleMediaFetch(
  message: MediaFetchMessage,
  referrer: string,
): Promise<MediaFetchResponse> {
  assertAllowedMediaUrl(message.url)
  await ensureMediaRequestHeaderRules()

  const response = await fetch(message.url, getMediaRequestInit(referrer))

  if (!response.ok) {
    return {
      ok: false,
      error: `media-fetch-failed:${response.status}`,
    }
  }

  const contentType = getMediaContentType(response)
  if (!isMediaContentType(contentType)) {
    return {
      ok: false,
      error: 'unsupported-media-content-type',
    }
  }
  const mediaContentType = contentType

  const data = await readArrayBufferWithLimit(response)
  if (!data.ok) {
    return data
  }

  return {
    ok: true,
    contentType: mediaContentType,
    data: arrayBufferToBase64(data.data),
  }
}

// ─── 超话自动签到调度 ───
//
// 两个触发点：
//   1. 打开 weibo.com 时内容脚本问一句（主力）
//   2. 每天 22:00 的 alarms 保底（当天一直没签才跑）
// 判定「今天签过没有」的标记**在开工之前**就落盘，宁可漏签不可重发。

const FALLBACK_CHECKIN_ALARM = 'xb-super-topic-checkin-fallback'
const FALLBACK_CHECKIN_HOUR = 20

/** 单个 SW 生命周期内的串行锁：storage 的读-改-写挡不住同刻并发，这个能。 */
let autoCheckinClaimed = false

export async function claimAutoCheckin(trigger: CheckinTrigger): Promise<boolean> {
  if (autoCheckinClaimed) return false

  const today = localDateString()
  const state = await loadAutoCheckinState()
  if (state?.date === today) return false

  autoCheckinClaimed = true
  await saveAutoCheckinState({
    date: today,
    startedAt: Date.now(),
    trigger,
    status: 'running',
  })

  return true
}

/**
 * 注册（或重注册）保底闹钟。
 *
 * 每次都重建而不是「有就跳过」——否则改了保底时间之后，浏览器里那个旧闹钟会一直赖着，
 * 新配置永远不生效。create 同名闹钟本身就是覆盖，重复调用是幂等的。
 */
async function ensureFallbackCheckinAlarm(): Promise<void> {
  try {
    const next = new Date()
    next.setHours(FALLBACK_CHECKIN_HOUR, 0, 0, 0)
    if (next.getTime() <= Date.now()) {
      next.setDate(next.getDate() + 1)
    }

    await browser.alarms.create(FALLBACK_CHECKIN_ALARM, {
      when: next.getTime(),
      periodInMinutes: 24 * 60,
    })
  } catch (error) {
    console.warn('注册签到保底闹钟失败', error)
  }
}

/**
 * 20 点保底：当天还没签就补一次。
 *
 * IO 走的是页面桥接，后台自己发不了请求，所以得有一个 weibo.com 标签页在跑——
 * 没有就临时开一个后台标签页，签完自己关掉（查询参数就是给那边的信号）。
 */
async function runFallbackCheckin(): Promise<void> {
  if (!(await claimAutoCheckin('auto-fallback'))) return

  try {
    const [existing] = await browser.tabs.query({ url: 'https://weibo.com/*' })
    if (existing?.id !== undefined) {
      await browser.tabs.sendMessage(existing.id, { type: 'checkin-run' })
      return
    }

    await browser.tabs.create({ url: 'https://weibo.com/?xb_checkin=auto', active: false })
  } catch (error) {
    await appendCheckinLog({
      at: Date.now(),
      trigger: 'auto-fallback',
      total: 0,
      signed: 0,
      already: 0,
      failed: [],
      error: error instanceof Error ? error.message : '保底签到启动失败',
    })
  }
}

browser.alarms?.onAlarm.addListener((alarm) => {
  if (alarm.name !== FALLBACK_CHECKIN_ALARM) return
  void runFallbackCheckin()
})
