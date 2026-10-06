import type { FeedItem } from '@/lib/weibo/models/feed'

export interface SuperTopicItem {
  title: string
  intro: string
  fansText: string
  link: string
  pic: string
  oid: string
  topicName: string
  statusCount: number
  followCount: number
}

export interface SuperTopicPage {
  name: string
  items: SuperTopicItem[]
  totalNumber: number
}

/** 超话页内的分区（热门 / 最新 / 精华 / …）。 */
export interface SuperTopicChannel {
  id: string
  title: string
  /** 该分区对应的 flowId，请求时直接用它。 */
  flowId: string
}

export interface SuperTopicHeaderStat {
  value: string
  label: string
}

export interface SuperTopicHeader {
  name: string
  avatarUrl: string
  stats: SuperTopicHeaderStat[]
}

export type SuperTopicCheckinStatus = 'signed' | 'already' | 'failed'

export interface SuperTopicCheckinOutcome {
  status: SuperTopicCheckinStatus
  /** 接口返回的提示语，失败时用来排查。 */
  message: string
}

/** 超话信息流的一页。 */
export interface SuperTopicFlowPage {
  items: FeedItem[]
  nextCursor: string | null
  channels: SuperTopicChannel[]
  header: SuperTopicHeader | null
}
