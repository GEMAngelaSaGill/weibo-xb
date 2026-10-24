import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runSuperTopicCheckinWithRetry } from '@/lib/weibo/checkin/checkin-runner'

const { loadAllFollowedSuperTopics, signSuperTopic } = vi.hoisted(() => ({
  loadAllFollowedSuperTopics: vi.fn(),
  signSuperTopic: vi.fn(),
}))

vi.mock('@/lib/weibo/data/weibo-data', () => ({
  loadAllFollowedSuperTopics,
  signSuperTopic,
}))

const topics = [{ title: '甲', chaohuaId: '100808a' }]

describe('runSuperTopicCheckinWithRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('一次成功就不重试', async () => {
    loadAllFollowedSuperTopics.mockResolvedValueOnce(topics)
    signSuperTopic.mockResolvedValueOnce({ status: 'signed', message: 'ok' })

    const summary = await runSuperTopicCheckinWithRetry()

    expect(loadAllFollowedSuperTopics).toHaveBeenCalledTimes(1)
    expect(summary).toMatchObject({ total: 1, signed: 1, already: 0 })
  })

  it('超时类失败会等一会儿再试一次', async () => {
    vi.useFakeTimers()
    loadAllFollowedSuperTopics
      .mockRejectedValueOnce(new Error('weibo-request-timeout'))
      .mockResolvedValueOnce(topics)
    signSuperTopic.mockResolvedValueOnce({ status: 'signed', message: 'ok' })

    const pending = runSuperTopicCheckinWithRetry()
    await vi.advanceTimersByTimeAsync(3000)
    const summary = await pending

    expect(loadAllFollowedSuperTopics).toHaveBeenCalledTimes(2)
    expect(summary).toMatchObject({ signed: 1 })
  })

  it('非超时错误直接抛，不重试（重试也救不了，还会掩盖问题）', async () => {
    loadAllFollowedSuperTopics.mockRejectedValueOnce(new Error('no-login'))

    await expect(runSuperTopicCheckinWithRetry()).rejects.toThrow('no-login')
    expect(loadAllFollowedSuperTopics).toHaveBeenCalledTimes(1)
  })
})
