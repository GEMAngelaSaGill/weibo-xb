/**
 * 超话签到日志。
 *
 * 存在 `chrome.storage.local`（不是页面 localStorage）——后台脚本和内容脚本都要读写，
 * 而且后台在 22 点保底唤醒时也得能判断"今天签过没有"。
 */

const STORAGE_KEY = 'xb:super-topic-checkin-log'
const MAX_ENTRIES = 50

export type CheckinTrigger = 'auto-open' | 'auto-fallback' | 'manual'

export interface CheckinLogEntry {
  /** 完成时间戳 */
  at: number
  trigger: CheckinTrigger
  /** 本次涉及的超话总数 */
  total: number
  signed: number
  already: number
  /** 失败的超话名，带原因 */
  failed: string[]
  /** 今天已签的超话名 */
  doneTitles?: string[]
  /** 没签成时的原因，例如拉列表就失败了 */
  error?: string
}

export interface AutoCheckinState {
  /** 本地日期，形如 `2026-10-08` */
  date: string
  startedAt: number
  trigger: CheckinTrigger
  /** 已领取但还没跑的标记，用来挡住并发 */
  status: 'running' | 'done'
}

export const AUTO_CHECKIN_STATE_KEY = 'xb:super-topic-auto-checkin'

export function localDateString(date: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export async function loadCheckinLog(): Promise<CheckinLogEntry[]> {
  try {
    const stored = await browser.storage.local.get(STORAGE_KEY)
    const raw = stored?.[STORAGE_KEY]
    return Array.isArray(raw) ? (raw as CheckinLogEntry[]) : []
  } catch {
    return []
  }
}

/** 最新的排前面；只留最近 MAX_ENTRIES 条。 */
export async function appendCheckinLog(entry: CheckinLogEntry): Promise<void> {
  try {
    const entries = await loadCheckinLog()
    const next = [entry, ...entries].slice(0, MAX_ENTRIES)
    await browser.storage.local.set({ [STORAGE_KEY]: next })
  } catch {
    // 日志写不进去不该影响签到本身
  }
}

export async function clearCheckinLog(): Promise<void> {
  try {
    await browser.storage.local.set({ [STORAGE_KEY]: [] })
  } catch {
    // 同上
  }
}

export async function loadAutoCheckinState(): Promise<AutoCheckinState | null> {
  try {
    const stored = await browser.storage.local.get(AUTO_CHECKIN_STATE_KEY)
    const raw = stored?.[AUTO_CHECKIN_STATE_KEY]
    if (!raw || typeof raw !== 'object') return null

    const state = raw as Partial<AutoCheckinState>
    return typeof state.date === 'string' && typeof state.startedAt === 'number'
      ? {
          date: state.date,
          startedAt: state.startedAt,
          trigger: state.trigger ?? 'auto-open',
          status: state.status === 'done' ? 'done' : 'running',
        }
      : null
  } catch {
    return null
  }
}

export async function saveAutoCheckinState(state: AutoCheckinState): Promise<void> {
  try {
    await browser.storage.local.set({ [AUTO_CHECKIN_STATE_KEY]: state })
  } catch {
    // 同上
  }
}

export function describeCheckinTrigger(trigger: CheckinTrigger): string {
  switch (trigger) {
    case 'auto-open':
      return '自动（打开微博）'
    case 'auto-fallback':
      return '自动（22 点保底）'
    default:
      return '手动'
  }
}
