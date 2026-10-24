import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useSuperTopicCheckin } from '@/lib/weibo/components/use-super-topic-checkin'

const { appendCheckinLog, saveAutoCheckinState, localDateString, runSuperTopicCheckin } =
  vi.hoisted(() => ({
    appendCheckinLog: vi.fn<(entry: unknown) => Promise<void>>(async () => {}),
    saveAutoCheckinState: vi.fn<(state: unknown) => Promise<void>>(async () => {}),
    localDateString: vi.fn(() => '2026-10-24'),
    runSuperTopicCheckin: vi.fn(),
  }))

vi.mock('@/lib/weibo/checkin/checkin-log', () => ({
  appendCheckinLog,
  saveAutoCheckinState,
  localDateString,
}))
vi.mock('@/lib/weibo/checkin/checkin-runner', () => ({ runSuperTopicCheckin }))
vi.mock('sonner', () => ({
  toast: Object.assign(
    vi.fn(() => 'toast-1'),
    {
      success: vi.fn(),
      warning: vi.fn(),
      error: vi.fn(),
    },
  ),
}))

describe('useSuperTopicCheckin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('手动签到成功后写「今天已签」标记，避免当天再被自动跑一轮', async () => {
    runSuperTopicCheckin.mockResolvedValueOnce({
      total: 2,
      signed: 2,
      already: 0,
      failed: [],
      doneTitles: ['甲', '乙'],
    })

    const { result } = renderHook(() => useSuperTopicCheckin())
    await act(async () => {
      await result.current.signAll()
    })

    expect(saveAutoCheckinState).toHaveBeenCalledWith(
      expect.objectContaining({ date: '2026-10-24', trigger: 'manual', status: 'done' }),
    )
  })

  it('一个超话都没有时不写标记', async () => {
    runSuperTopicCheckin.mockResolvedValueOnce({
      total: 0,
      signed: 0,
      already: 0,
      failed: [],
      doneTitles: [],
    })

    const { result } = renderHook(() => useSuperTopicCheckin())
    await act(async () => {
      await result.current.signAll()
    })

    expect(saveAutoCheckinState).not.toHaveBeenCalled()
  })

  it('整体失败时不写标记，留给下次自动签到重试', async () => {
    runSuperTopicCheckin.mockRejectedValueOnce(new Error('weibo-request-timeout'))

    const { result } = renderHook(() => useSuperTopicCheckin())
    await act(async () => {
      await result.current.signAll()
    })

    expect(saveAutoCheckinState).not.toHaveBeenCalled()
  })
})
