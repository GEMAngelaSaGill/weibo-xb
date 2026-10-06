import { describe, expect, it } from 'vitest'

import {
  adaptSuperTopicFlowResponse,
  adaptSuperTopicResponse,
  type SuperTopicFlowPayload,
} from '@/lib/weibo/services/adapters/super-topic'

describe('adaptSuperTopicResponse', () => {
  it('normalizes protocol-relative super-topic links', () => {
    const result = adaptSuperTopicResponse({
      data: {
        list: [
          {
            title: '测试超话',
            link: '//weibo.com/p/100808abc',
          },
        ],
      },
    })

    expect(result.items[0]?.link).toBe('https://weibo.com/p/100808abc')
  })

  it('drops unsafe super-topic link schemes', () => {
    const result = adaptSuperTopicResponse({
      data: {
        list: [
          {
            title: '测试超话',
            link: 'javascript:alert(1)',
          },
        ],
      },
    })

    expect(result.items[0]?.link).toBe('')
  })
})

const status = {
  idstr: '5351180555258816',
  text_raw: '超话里的第一条',
  created_at: 'Tue Apr 08 10:00:00 +0800 2026',
  attitudes_count: 12,
  comments_count: 20,
  reposts_count: 1,
  user: {
    idstr: '1969776354',
    screen_name: '衔蝶',
    avatar_hd: 'https://wx1.sinaimg.cn/large/avatar.jpg',
  },
}

function buildPayload(overrides: Partial<SuperTopicFlowPayload> = {}): SuperTopicFlowPayload {
  return {
    items: [
      { category: 'cell' },
      { category: 'feed', data: status },
      { category: 'feed', data: null },
    ],
    channelInfo: {
      channels: [
        { channelId: 'recommend', title: '热门', flowId: '100808abc_-_recommend' },
        { channelId: 'feed', title: '最新', flowId: '100808abc_-_feed' },
        { channelId: 'broken', title: '', flowId: '100808abc_-_broken' },
      ],
    },
    header: {
      data: {
        nick: 'AHyeon',
        portrait: 'https://wx3.sinaimg.cn/thumb180/avatar.jpg',
        desc_more: [
          { desc_num: '57万', desc: '帖子' },
          { desc_num: '32万', desc: '粉丝' },
        ],
      },
    },
    ...overrides,
  }
}

describe('adaptSuperTopicFlowResponse', () => {
  it('只取 category 为 feed 的条目，跳过占位和空数据', () => {
    const result = adaptSuperTopicFlowResponse(buildPayload(), 1)

    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.id).toBe('5351180555258816')
    expect(result.items[0]?.text).toBe('超话里的第一条')
    expect(result.items[0]?.author.name).toBe('衔蝶')
  })

  it('去掉标题或 flowId 缺失的分区', () => {
    const result = adaptSuperTopicFlowResponse(buildPayload(), 1)

    expect(result.channels).toEqual([
      { id: 'recommend', title: '热门', flowId: '100808abc_-_recommend' },
      { id: 'feed', title: '最新', flowId: '100808abc_-_feed' },
    ])
  })

  it('提取超话头部信息', () => {
    const result = adaptSuperTopicFlowResponse(buildPayload(), 1)

    expect(result.header).toEqual({
      name: 'AHyeon',
      avatarUrl: 'https://wx3.sinaimg.cn/thumb180/avatar.jpg',
      stats: [
        { value: '57万', label: '帖子' },
        { value: '32万', label: '粉丝' },
      ],
    })
  })

  it('没有 header 时返回 null', () => {
    expect(adaptSuperTopicFlowResponse(buildPayload({ header: undefined }), 1).header).toBeNull()
  })

  it('还有内容时下一页游标递增，空页则结束', () => {
    expect(adaptSuperTopicFlowResponse(buildPayload(), 3).nextCursor).toBe('4')
    expect(adaptSuperTopicFlowResponse(buildPayload({ items: [] }), 3).nextCursor).toBeNull()
  })

  it('字段缺失时不抛异常', () => {
    const result = adaptSuperTopicFlowResponse({}, 1)

    expect(result.items).toEqual([])
    expect(result.channels).toEqual([])
    expect(result.header).toBeNull()
    expect(result.nextCursor).toBeNull()
  })
})
