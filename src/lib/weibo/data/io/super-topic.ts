import type { SuperTopicCheckinOutcome, SuperTopicFlowPage } from '@/lib/weibo/models/super-topic'
import {
  adaptFollowedSuperTopicRefs,
  adaptSuperTopicFlowResponse,
  type FollowedSuperTopicRef,
  type SuperTopicFlowPayload,
  type SuperTopicListPayload,
} from '@/lib/weibo/services/adapters/super-topic'
import { wbGet } from '@/lib/weibo/services/client'
import { WEIBO_ENDPOINTS } from '@/lib/weibo/services/endpoints'

/** 关注超话列表用的 tabid，与右侧栏卡片同源。 */
const CHAOHUA_TAB_ID = '231093_-_chaohua'

const CHECKIN_CODE_SUCCESS = '100000'
const CHECKIN_CODE_ALREADY_SIGNED = '382004'

interface SuperTopicCheckinPayload {
  code?: unknown
  msg?: unknown
  data?: { tipMessage?: unknown }
}

/** 拉全量关注超话（列表接口分页，逐页取到 max_page）。 */
export async function loadAllFollowedSuperTopics(): Promise<FollowedSuperTopicRef[]> {
  const collected: FollowedSuperTopicRef[] = []
  let page = 1
  let maxPage = 1

  do {
    const payload = await wbGet<SuperTopicListPayload>(WEIBO_ENDPOINTS.profileTopicContent, {
      tabid: CHAOHUA_TAB_ID,
      page,
    })
    const { items, maxPage: reportedMaxPage } = adaptFollowedSuperTopicRefs(payload)

    if (page === 1) maxPage = reportedMaxPage
    collected.push(...items)
    page++
  } while (page <= maxPage)

  return collected
}

/**
 * 签到单个超话。
 *
 * 走的是微博网页版的那个 `/p/aj/general/button` 转发接口，`api` 参数指向
 * 超话签到端点——直接打 i.huati.weibo.com 会因为缺 Referer/凭证被拒。
 */
export async function signSuperTopic(chaohuaId: string): Promise<SuperTopicCheckinOutcome> {
  const payload = await wbGet<SuperTopicCheckinPayload>(WEIBO_ENDPOINTS.superTopicCheckin, {
    ajwvr: 6,
    api: 'http://i.huati.weibo.com/aj/super/checkin',
    texta: '签到',
    textb: '已签到',
    status: 0,
    id: chaohuaId,
    location: 'page_100808_super_index',
    timezone: 'GMT+0800',
    lang: 'zh-cn',
    plat: 'Win32',
    ua: navigator.userAgent,
    screen: `${screen.width}*${screen.height}`,
    __rnd: Date.now(),
  })

  const code = payload.code === undefined ? '' : String(payload.code)

  if (code === CHECKIN_CODE_SUCCESS) {
    const tip = payload.data?.tipMessage
    return { status: 'signed', message: typeof tip === 'string' ? tip : '签到成功' }
  }

  if (code === CHECKIN_CODE_ALREADY_SIGNED) {
    const msg = payload.msg
    return { status: 'already', message: typeof msg === 'string' ? msg : '今天已签到' }
  }

  return {
    status: 'failed',
    message: code ? `响应码 ${code}` : '响应格式异常',
  }
}

export interface LoadSuperTopicFlowOptions {
  superTopicId: string
  /** 分区 flowId；不传则用超话默认流（热门）。 */
  flowId?: string | null
  page?: number
}

export async function loadSuperTopicFlow(
  options: LoadSuperTopicFlowOptions,
): Promise<SuperTopicFlowPage> {
  const page = options.page && options.page > 0 ? options.page : 1

  const payload = await wbGet<SuperTopicFlowPayload>(WEIBO_ENDPOINTS.superTopicFlow, {
    flowId: options.flowId || options.superTopicId,
    page,
  })

  return adaptSuperTopicFlowResponse(payload, page)
}
