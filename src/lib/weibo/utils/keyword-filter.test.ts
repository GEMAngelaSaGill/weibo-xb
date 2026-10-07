import { describe, expect, it } from 'vitest'

import type { FeedItem } from '@/lib/weibo/models/feed'
import { filterBlockedStatuses, matchesBlockedKeywords } from '@/lib/weibo/utils/keyword-filter'

function item(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id: '1',
    mblogId: '1',
    isLongText: false,
    author: { id: 'u1', name: '张三', avatarUrl: null },
    text: '今天天气不错',
    createdAt: '',
    createdAtLabel: '',
    stats: { likes: 0, comments: 0, reposts: 0 },
    images: [],
    media: null,
    ...overrides,
  }
}

describe('matchesBlockedKeywords', () => {
  it('正文命中关键词', () => {
    expect(matchesBlockedKeywords(item({ text: '转发抽奖送手机' }), ['抽奖'])).toBe(true)
  })

  it('大小写不敏感', () => {
    expect(matchesBlockedKeywords(item({ text: 'iPhone 16 Pro' }), ['iphone'])).toBe(true)
  })

  it('没命中就不拦', () => {
    expect(matchesBlockedKeywords(item({ text: '今天天气不错' }), ['抽奖'])).toBe(false)
  })

  it('空关键词列表一律放行', () => {
    expect(matchesBlockedKeywords(item({ text: '抽奖' }), [])).toBe(false)
  })

  it('只含空白的关键词不算命中', () => {
    expect(matchesBlockedKeywords(item({ text: '今天天气不错' }), ['   '])).toBe(false)
  })

  it('转发微博会连带原微博正文一起匹配', () => {
    const repost = item({
      text: '哈哈哈',
      retweetedStatus: item({ id: 'inner', text: '限时抽奖活动' }),
    })

    expect(matchesBlockedKeywords(repost, ['抽奖'])).toBe(true)
  })

  it('作者名不参与匹配', () => {
    expect(
      matchesBlockedKeywords(item({ author: { id: 'u1', name: '抽奖博主', avatarUrl: null } }), [
        '抽奖',
      ]),
    ).toBe(false)
  })
})

describe('filterBlockedStatuses', () => {
  it('过滤掉命中的帖子，保留其余', () => {
    const items = [item({ id: 'a', text: '正常内容' }), item({ id: 'b', text: '转发抽奖' })]

    expect(filterBlockedStatuses(items, ['抽奖']).map((entry) => entry.id)).toEqual(['a'])
  })

  it('没有关键词时原样返回', () => {
    const items = [item({ id: 'a' }), item({ id: 'b' })]

    expect(filterBlockedStatuses(items, [])).toHaveLength(2)
  })
})
