import { afterEach, describe, expect, it, vi } from 'vitest'

import { loadAllFollowedSuperTopics, signSuperTopic } from '@/lib/weibo/data/io/super-topic'

const wbGet = vi.fn()

vi.mock('@/lib/weibo/services/client', () => ({
  wbGet: (...args: unknown[]) => wbGet(...args),
}))

function listPage(titles: string[], maxPage: number) {
  return {
    data: {
      max_page: maxPage,
      list: titles.map((title, index) => ({
        title,
        oid: `1022:100808${index}${title}`,
      })),
    },
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('loadAllFollowedSuperTopics', () => {
  it('从 oid 冒号后取出超话 id', async () => {
    wbGet.mockResolvedValueOnce(listPage(['甲'], 1))

    const topics = await loadAllFollowedSuperTopics()

    expect(topics).toEqual([{ title: '甲', chaohuaId: '1008080甲' }])
  })

  it('按 max_page 逐页拉全量', async () => {
    wbGet
      .mockResolvedValueOnce(listPage(['甲', '乙'], 2))
      .mockResolvedValueOnce(listPage(['丙'], 2))

    const topics = await loadAllFollowedSuperTopics()

    expect(topics.map((topic) => topic.title)).toEqual(['甲', '乙', '丙'])
    expect(wbGet).toHaveBeenCalledTimes(2)
    expect(wbGet).toHaveBeenNthCalledWith(2, expect.any(String), {
      tabid: '231093_-_chaohua',
      page: 2,
    })
  })

  it('丢掉没有 id 的条目', async () => {
    wbGet.mockResolvedValueOnce({
      data: { max_page: 1, list: [{ title: '空', oid: '' }] },
    })

    expect(await loadAllFollowedSuperTopics()).toEqual([])
  })
})

describe('signSuperTopic', () => {
  it('成功码 100000 判为签到成功，并带回提示语', async () => {
    wbGet.mockResolvedValueOnce({ code: 100000, data: { tipMessage: '签到成功，经验+8' } })

    await expect(signSuperTopic('100808abc')).resolves.toEqual({
      status: 'signed',
      message: '签到成功，经验+8',
    })
  })

  it('382004 判为今天已签', async () => {
    wbGet.mockResolvedValueOnce({ code: 382004, msg: '今天已经签到过了' })

    await expect(signSuperTopic('100808abc')).resolves.toEqual({
      status: 'already',
      message: '今天已经签到过了',
    })
  })

  it('其它响应码判为失败并带上码', async () => {
    wbGet.mockResolvedValueOnce({ code: 400, msg: '被风控' })

    await expect(signSuperTopic('100808abc')).resolves.toEqual({
      status: 'failed',
      message: '响应码 400',
    })
  })

  it('响应里没有 code 时也是失败而不是抛异常', async () => {
    wbGet.mockResolvedValueOnce({})

    await expect(signSuperTopic('100808abc')).resolves.toEqual({
      status: 'failed',
      message: '响应格式异常',
    })
  })

  it('请求参数里带上超话 id 和转发用的 api 地址', async () => {
    wbGet.mockResolvedValueOnce({ code: 100000, data: { tipMessage: 'ok' } })

    await signSuperTopic('100808abc')

    expect(wbGet).toHaveBeenCalledWith(
      expect.stringContaining('/p/aj/general/button'),
      expect.objectContaining({
        api: 'http://i.huati.weibo.com/aj/super/checkin',
        id: '100808abc',
        location: 'page_100808_super_index',
        texta: '签到',
        textb: '已签到',
      }),
    )
  })
})
