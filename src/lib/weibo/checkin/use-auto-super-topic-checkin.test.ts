import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAutoSuperTopicCheckin } from '@/lib/weibo/checkin/use-auto-super-topic-checkin'

const {
  appendCheckinLog,
  localDateString,
  saveAutoCheckinState,
  runSuperTopicCheckinWithRetry,
  sendMessage,
  onMessage,
} = vi.hoisted(() => ({
  appendCheckinLog: vi.fn<(entry: unknown) => Promise<void>>(async () => {}),
  localDateString: vi.fn(() => '2026-10-27'),
  saveAutoCheckinState: vi.fn<(state: unknown) => Promise<void>>(async () => {}),
  runSuperTopicCheckinWithRetry: vi.fn(),
  sendMessage: vi.fn(),
  onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
}))

vi.mock('@/lib/weibo/checkin/checkin-log', () => ({
  appendCheckinLog,
  localDateString,
  saveAutoCheckinState,
}))
vi.mock('@/lib/weibo/checkin/checkin-runner', () => ({ runSuperTopicCheckinWithRetry }))
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  }),
}))

const summary = { total: 1, signed: 1, already: 0, failed: [], doneTitles: ['甲'] }

describe('useAutoSuperTopicCheckin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(globalThis, 'browser', {
      writable: true,
      configurable: true,
      value: {
        runtime: {
          sendMessage,
          onMessage,
        },
      },
    })
  })

  it('拿到许可就跑签到', async () => {
    sendMessage.mockResolvedValueOnce({ granted: true })
    runSuperTopicCheckinWithRetry.mockResolvedValueOnce(summary)

    renderHook(() => useAutoSuperTopicCheckin())

    await waitFor(() => expect(runSuperTopicCheckinWithRetry).toHaveBeenCalled())
    expect(appendCheckinLog).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: 'auto-open', signed: 1 }),
    )
    expect(saveAutoCheckinState).toHaveBeenCalledWith(
      expect.objectContaining({ date: '2026-10-27', status: 'done' }),
    )
  })

  it('收到保底消息后由当前页面领取，再确认投递成功', async () => {
    sendMessage.mockResolvedValueOnce({ granted: false }).mockResolvedValueOnce({ granted: true })
    runSuperTopicCheckinWithRetry.mockResolvedValueOnce(summary)
    renderHook(() => useAutoSuperTopicCheckin())

    const listener = onMessage.addListener.mock.calls[0]?.[0] as (
      message: unknown,
      sender: unknown,
      respond: (response: { accepted: boolean }) => void,
    ) => boolean
    const respond = vi.fn()
    expect(listener({ type: 'checkin-run' }, {}, respond)).toBe(true)

    await waitFor(() => expect(respond).toHaveBeenCalledWith({ accepted: true }))
    await waitFor(() => expect(runSuperTopicCheckinWithRetry).toHaveBeenCalledOnce())
    expect(sendMessage).toHaveBeenNthCalledWith(2, {
      type: 'checkin-claim',
      trigger: 'auto-fallback',
    })
  })

  it('被后台拒绝时不跑签到，也不记日志（今天是已经签过了）', async () => {
    sendMessage.mockResolvedValueOnce({ granted: false })

    renderHook(() => useAutoSuperTopicCheckin())
    await waitFor(() => expect(sendMessage).toHaveBeenCalled())

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(runSuperTopicCheckinWithRetry).not.toHaveBeenCalled()
    expect(appendCheckinLog).not.toHaveBeenCalled()
  })

  it('消息发不出去时记一条失败日志，而不是静默吞掉', async () => {
    sendMessage.mockRejectedValueOnce(new Error('Could not establish connection'))

    renderHook(() => useAutoSuperTopicCheckin())

    await waitFor(() => expect(appendCheckinLog).toHaveBeenCalled())
    expect(appendCheckinLog.mock.calls[0]?.[0]).toMatchObject({
      trigger: 'auto-open',
      total: 0,
      error: expect.stringContaining('Could not establish connection'),
    })
    expect(runSuperTopicCheckinWithRetry).not.toHaveBeenCalled()
  })

  it('后台没回结果时同样记日志', async () => {
    sendMessage.mockResolvedValueOnce(undefined)

    renderHook(() => useAutoSuperTopicCheckin())

    await waitFor(() => expect(appendCheckinLog).toHaveBeenCalled())
    expect(appendCheckinLog.mock.calls[0]?.[0]).toMatchObject({
      error: expect.stringContaining('后台没有返回结果'),
    })
  })

  it('拿不到扩展 API 时安静退出，不炸页面', () => {
    Object.defineProperty(globalThis, 'browser', {
      writable: true,
      configurable: true,
      value: { runtime: {} },
    })

    expect(() => renderHook(() => useAutoSuperTopicCheckin())).not.toThrow()
    expect(sendMessage).not.toHaveBeenCalled()
  })
})
