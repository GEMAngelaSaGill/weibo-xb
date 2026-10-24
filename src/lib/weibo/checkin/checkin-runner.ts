import { loadAllFollowedSuperTopics, signSuperTopic } from '@/lib/weibo/data/weibo-data'

/** 逐个之间留点间隔，连打太快容易被风控。 */
const CHECKIN_INTERVAL_MS = 400

/** 桥接没就绪时等一会儿再重试，给页面注入留时间。 */
const BRIDGE_RETRY_DELAY_MS = 3000

export interface CheckinProgress {
  /** 已处理数量（含失败） */
  done: number
  total: number
  title: string
}

export interface CheckinSummary {
  total: number
  signed: number
  already: number
  /** 失败的超话名，带原因 */
  failed: string[]
  /** 今天已签（含本次签上和本来就签过）的超话名，用于列表页打勾 */
  doneTitles: string[]
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 串行签到所有关注的超话。
 *
 * 手动一键签到和后台自动签到共用这一段——两边各写一份的话，
 * 间隔、失败处理这些细节迟早会漂移。
 *
 * 注意只能在 weibo.com 的页面上下文里跑：IO 走的是页面桥接。
 */
export async function runSuperTopicCheckin(
  onProgress?: (progress: CheckinProgress) => void,
): Promise<CheckinSummary> {
  const topics = await loadAllFollowedSuperTopics()

  const summary: CheckinSummary = {
    total: topics.length,
    signed: 0,
    already: 0,
    failed: [],
    doneTitles: [],
  }

  for (const [index, topic] of topics.entries()) {
    onProgress?.({ done: index, total: topics.length, title: topic.title })

    try {
      const outcome = await signSuperTopic(topic.chaohuaId)
      if (outcome.status === 'signed') {
        summary.signed++
        summary.doneTitles.push(topic.title)
      } else if (outcome.status === 'already') {
        summary.already++
        summary.doneTitles.push(topic.title)
      } else {
        summary.failed.push(`${topic.title}（${outcome.message}）`)
      }
    } catch (error) {
      summary.failed.push(
        `${topic.title}（${error instanceof Error ? error.message : '请求失败'}）`,
      )
    }

    if (index < topics.length - 1) await sleep(CHECKIN_INTERVAL_MS)
  }

  return summary
}

/** 超时类失败多半是页面刚加载、API 桥接还没注入完，值得再试一次。 */
function isBridgeTimeoutError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /timeout/i.test(message)
}

/**
 * 带一次重试的签到。
 *
 * 自动签到在页面刚加载时就发起，此时页面里的 API 桥接可能还没装好，
 * 请求会一直等到 10 秒超时（实测 10-15 那次就是这样）。
 * 只对超时类失败重试——真错了（没登录、接口变了）重试也没用，还会掩盖问题。
 */
export async function runSuperTopicCheckinWithRetry(
  onProgress?: (progress: CheckinProgress) => void,
): Promise<CheckinSummary> {
  try {
    return await runSuperTopicCheckin(onProgress)
  } catch (error) {
    if (!isBridgeTimeoutError(error)) throw error

    await sleep(BRIDGE_RETRY_DELAY_MS)
    return await runSuperTopicCheckin(onProgress)
  }
}
