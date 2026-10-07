import { afterEach, describe, expect, it, vi } from 'vitest'

import { sendFeedMenuFeedback, shieldStatus, shieldUser } from '@/lib/weibo/data/io/feed-menu'

const wbPostForm = vi.fn()

vi.mock('@/lib/weibo/services/client', () => ({
  wbPostForm: (...args: unknown[]) => wbPostForm(...args),
}))

afterEach(() => {
  vi.clearAllMocks()
})

describe('sendFeedMenuFeedback', () => {
  it('把 actionlog 摊平成 actionlog[字段]=值 再提交', async () => {
    wbPostForm.mockResolvedValueOnce({ result: 1, ok: 1 })

    await sendFeedMenuFeedback({ act_code: 0, mid: '535', source: 'like_reduce' })

    expect(wbPostForm).toHaveBeenCalledWith(expect.stringContaining('/ajax/feed/throwbatch'), {
      'actionlog[act_code]': '0',
      'actionlog[mid]': '535',
      'actionlog[source]': 'like_reduce',
    })
  })

  it('没有 actionlog 时直接拒绝，不发请求', async () => {
    await expect(sendFeedMenuFeedback(undefined)).rejects.toThrow('缺少反馈凭证')
    expect(wbPostForm).not.toHaveBeenCalled()
  })

  it('服务端回非 ok 时抛错并带上 msg', async () => {
    wbPostForm.mockResolvedValueOnce({ ok: 0, msg: '操作过于频繁' })

    await expect(sendFeedMenuFeedback({ mid: '1' })).rejects.toThrow('操作过于频繁')
  })
})

describe('shieldStatus', () => {
  it('按微博 id 提交屏蔽', async () => {
    wbPostForm.mockResolvedValueOnce({ ok: 1 })

    await shieldStatus('5351180555258816')

    expect(wbPostForm).toHaveBeenCalledWith(expect.stringContaining('/ajax/statuses/filterWeibo'), {
      id: '5351180555258816',
    })
  })

  it('失败时抛错', async () => {
    wbPostForm.mockResolvedValueOnce({ ok: 0 })

    await expect(shieldStatus('1')).rejects.toThrow('屏蔽失败')
  })
})

describe('shieldUser', () => {
  it('三个范围开关转成 1/0', async () => {
    wbPostForm.mockResolvedValueOnce({ ok: 1 })

    await shieldUser({
      uid: '1001',
      screenName: '张三',
      status: false,
      interact: true,
      follow: false,
    })

    expect(wbPostForm).toHaveBeenCalledWith(expect.stringContaining('/ajax/statuses/filterUser'), {
      uid: '1001',
      screen_name: '张三',
      status: '0',
      interact: '1',
      follow: '0',
    })
  })
})
