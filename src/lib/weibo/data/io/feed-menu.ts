import { wbPostForm } from '@/lib/weibo/services/client'
import { WEIBO_ENDPOINTS } from '@/lib/weibo/services/endpoints'

interface WeiboMutationResponse {
  ok?: unknown
  result?: unknown
  msg?: unknown
}

function assertMutationOk(response: WeiboMutationResponse | undefined, fallback: string): void {
  const ok = Number(response?.ok ?? response?.result ?? 0)
  if (Number.isFinite(ok) && ok > 0) return

  const msg = typeof response?.msg === 'string' && response.msg ? response.msg : fallback
  throw new Error(msg)
}

/**
 * 「不感兴趣 / 减少该博主内容 / 今日不再出现此类内容」这类反馈。
 *
 * `actionlog` 是服务端在 `mblog_menus_new` 里逐条算好的对象，客户端拼不出来，必须原样回传。
 * 注意要**摊平成 `actionlog[字段]=值`**：整段 JSON 塞进一个字段会被服务端 500。
 */
export async function sendFeedMenuFeedback(actionlog: unknown): Promise<void> {
  if (!actionlog || typeof actionlog !== 'object') {
    throw new Error('缺少反馈凭证')
  }

  const body: Record<string, string> = {}
  for (const [key, value] of Object.entries(actionlog as Record<string, unknown>)) {
    body[`actionlog[${key}]`] = String(value)
  }

  assertMutationOk(
    await wbPostForm<WeiboMutationResponse>(WEIBO_ENDPOINTS.feedThrowBatch, body),
    '操作失败',
  )
}

/** 屏蔽此条微博，让它不再出现在首页。 */
export async function shieldStatus(statusId: string): Promise<void> {
  assertMutationOk(
    await wbPostForm<WeiboMutationResponse>(WEIBO_ENDPOINTS.shieldStatus, { id: statusId }),
    '屏蔽失败',
  )
}

export interface ShieldUserOptions {
  uid: string
  screenName: string
  /** 不看他的微博 */
  status: boolean
  /** 禁止他与我互动 */
  interact: boolean
  /** 禁止他关注我 */
  follow: boolean
}

/** 按范围屏蔽某博主；三项全选等同于拉黑。 */
export async function shieldUser(options: ShieldUserOptions): Promise<void> {
  assertMutationOk(
    await wbPostForm<WeiboMutationResponse>(WEIBO_ENDPOINTS.shieldUser, {
      uid: options.uid,
      screen_name: options.screenName,
      status: options.status ? '1' : '0',
      interact: options.interact ? '1' : '0',
      follow: options.follow ? '1' : '0',
    }),
    '屏蔽失败',
  )
}
