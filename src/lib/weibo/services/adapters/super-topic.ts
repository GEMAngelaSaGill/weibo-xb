import type {
  SuperTopicChannel,
  SuperTopicFlowPage,
  SuperTopicHeader,
  SuperTopicPage,
} from '@/lib/weibo/models/super-topic'
import { normalizeSafeExternalUrl } from '@/lib/weibo/utils/safe-url'

import { type WeiboStatus, toFeedItem } from '../../utils/transform'

interface SuperTopicPayloadItem {
  title?: unknown
  content1?: unknown
  content2?: unknown
  link?: unknown
  pic?: unknown
  oid?: unknown
  topic_name?: unknown
  status_count?: unknown
  follow_count?: unknown
  intro?: unknown
}

export interface SuperTopicPayload {
  data?: {
    name?: unknown
    list?: SuperTopicPayloadItem[]
    total_number?: unknown
  }
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function adaptSuperTopicResponse(payload: SuperTopicPayload): SuperTopicPage {
  const list = payload.data?.list ?? []

  return {
    name: asString(payload.data?.name) || '我关注的超话',
    totalNumber: asNumber(payload.data?.total_number),
    items: list.map((item) => {
      const intro = asString(item.intro) || asString(item.content1)
      return {
        title: asString(item.title),
        intro,
        fansText: asString(item.content2),
        link: normalizeSafeExternalUrl(asString(item.link)) ?? '',
        pic: asString(item.pic),
        oid: asString(item.oid),
        topicName: asString(item.topic_name) || asString(item.title),
        statusCount: asNumber(item.status_count),
        followCount: asNumber(item.follow_count),
      }
    }),
  }
}

// ─── 关注超话列表（/ajax/profile/topicContent） ───

export interface SuperTopicListPayload {
  data?: {
    max_page?: unknown
    list?: SuperTopicPayloadItem[]
  }
}

export interface FollowedSuperTopicRef {
  title: string
  /** 签到接口要的超话 id，取自 oid 冒号后的部分。 */
  chaohuaId: string
}

/** oid 形如 `1022:100808xxxx`，冒号后面才是超话 id。 */
export function chaohuaIdFromOid(oid: string): string {
  const separator = oid.indexOf(':')
  return separator >= 0 ? oid.slice(separator + 1) : oid
}

export function adaptFollowedSuperTopicRefs(payload: SuperTopicListPayload): {
  items: FollowedSuperTopicRef[]
  maxPage: number
} {
  const list = payload.data?.list ?? []
  const maxPage = asNumber(payload.data?.max_page) || 1

  const items = list
    .map((item) => ({
      title: asString(item.title),
      chaohuaId: chaohuaIdFromOid(asString(item.oid)),
    }))
    .filter((item) => item.chaohuaId !== '')

  return { items, maxPage }
}

// ─── 超话信息流（/ajax_proxy/chaohua/page） ───

interface SuperTopicFlowRawItem {
  category?: unknown
  data?: unknown
}

interface SuperTopicFlowRawChannel {
  channelId?: unknown
  title?: unknown
  flowId?: unknown
}

interface SuperTopicFlowRawStat {
  desc_num?: unknown
  desc?: unknown
}

export interface SuperTopicFlowPayload {
  items?: SuperTopicFlowRawItem[]
  channelInfo?: {
    channels?: SuperTopicFlowRawChannel[]
  }
  header?: {
    data?: {
      nick?: unknown
      portrait?: unknown
      desc_more?: SuperTopicFlowRawStat[]
    }
  }
}

/** 分区栏标题为空的条目没法点，直接丢掉。 */
function adaptChannels(payload: SuperTopicFlowPayload): SuperTopicChannel[] {
  const channels = payload.channelInfo?.channels ?? []

  return channels
    .map((channel) => ({
      id: asString(channel.channelId),
      title: asString(channel.title),
      flowId: asString(channel.flowId),
    }))
    .filter((channel) => channel.title !== '' && channel.flowId !== '')
}

function adaptHeader(payload: SuperTopicFlowPayload): SuperTopicHeader | null {
  const data = payload.header?.data
  const name = asString(data?.nick)
  if (!name) return null

  const stats = (data?.desc_more ?? [])
    .map((stat) => ({ value: asString(stat.desc_num), label: asString(stat.desc) }))
    .filter((stat) => stat.value !== '' && stat.label !== '')

  return {
    name,
    avatarUrl: asString(data?.portrait),
    stats,
  }
}

/**
 * 超话信息流的 items 是混排的，只有 `category === 'feed'` 的 data 是微博正文，
 * 其余是占位/广告位。抽出来交给通用的 toFeedItem 处理。
 */
export function adaptSuperTopicFlowResponse(
  payload: SuperTopicFlowPayload,
  page: number,
): SuperTopicFlowPage {
  const items = (payload.items ?? [])
    .filter((item) => item.category === 'feed')
    .map((item) => item.data)
    .filter((data): data is WeiboStatus => data !== null && typeof data === 'object')
    .map((status) => toFeedItem(status))
    .filter((item) => item.id !== '')

  return {
    items,
    nextCursor: items.length > 0 ? String(page + 1) : null,
    channels: adaptChannels(payload),
    header: adaptHeader(payload),
  }
}
