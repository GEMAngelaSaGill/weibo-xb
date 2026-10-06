import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SuperTopicCard } from '@/lib/weibo/components/super-topic-card'

const { toastMock } = vi.hoisted(() => ({
  toastMock: Object.assign(
    vi.fn(() => 'toast-1'),
    {
      success: vi.fn(),
      warning: vi.fn(),
      error: vi.fn(),
    },
  ),
}))

vi.mock('sonner', () => ({ toast: toastMock }))

const loadFollowedSuperTopics = vi.fn()
const loadAllFollowedSuperTopics = vi.fn()
const signSuperTopic = vi.fn()

vi.mock('@/lib/weibo/data/weibo-io', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/weibo/data/weibo-io')>()
  return {
    ...actual,
    loadFollowedSuperTopics: () => loadFollowedSuperTopics(),
    loadAllFollowedSuperTopics: () => loadAllFollowedSuperTopics(),
    signSuperTopic: (id: string) => signSuperTopic(id),
  }
})

function renderCard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SuperTopicCard />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('SuperTopicCard', () => {
  beforeEach(() => {
    loadFollowedSuperTopics.mockReset()
    loadAllFollowedSuperTopics.mockReset()
    signSuperTopic.mockReset()
  })

  it('微博站内的超话链接走站内跳转', async () => {
    loadFollowedSuperTopics.mockResolvedValue({
      name: '我关注的超话',
      totalNumber: 1,
      items: [
        {
          title: 'AHyeon',
          intro: '',
          fansText: '32万粉丝',
          link: 'https://weibo.com/p/10080822ac697ad6c50539a5cccc69398dafd9/super_index',
          pic: '',
          oid: '',
          topicName: 'AHyeon',
          statusCount: 0,
          followCount: 0,
        },
      ],
    })

    renderCard()

    const link = await screen.findByRole('link', { name: /AHyeon/ })
    expect(link).toHaveAttribute('href', '/p/10080822ac697ad6c50539a5cccc69398dafd9/super_index')
    expect(link).not.toHaveAttribute('target', '_blank')
  })

  it('站外链接保持新标签打开', async () => {
    loadFollowedSuperTopics.mockResolvedValue({
      name: '我关注的超话',
      totalNumber: 1,
      items: [
        {
          title: '外部超话',
          intro: '',
          fansText: '',
          link: 'https://example.com/super/1',
          pic: '',
          oid: '',
          topicName: '外部超话',
          statusCount: 0,
          followCount: 0,
        },
      ],
    })

    renderCard()

    const link = await screen.findByRole('link', { name: /外部超话/ })
    expect(link).toHaveAttribute('href', 'https://example.com/super/1')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('一键签到会逐个签完所有关注的超话', async () => {
    loadFollowedSuperTopics.mockResolvedValue({ name: '我关注的超话', totalNumber: 0, items: [] })
    loadAllFollowedSuperTopics.mockResolvedValue([
      { title: '甲', chaohuaId: '100808a' },
      { title: '乙', chaohuaId: '100808b' },
      { title: '丙', chaohuaId: '100808c' },
    ])
    signSuperTopic
      .mockResolvedValueOnce({ status: 'signed', message: '签到成功' })
      .mockResolvedValueOnce({ status: 'already', message: '今天已签到' })
      .mockResolvedValueOnce({ status: 'failed', message: '响应码 400' })

    renderCard()
    fireEvent.click(await screen.findByRole('button', { name: '一键签到' }))

    await waitFor(() => expect(signSuperTopic).toHaveBeenCalledTimes(3), { timeout: 5000 })
    expect(signSuperTopic).toHaveBeenNthCalledWith(1, '100808a')
    expect(signSuperTopic).toHaveBeenNthCalledWith(2, '100808b')
    expect(signSuperTopic).toHaveBeenNthCalledWith(3, '100808c')

    // 有一个失败时走 warning 分支，并把失败项写进提示
    await waitFor(() => expect(toastMock.warning).toHaveBeenCalled(), { timeout: 5000 })
    expect(String(toastMock.warning.mock.calls.at(-1)?.[0])).toContain('成功 1 个')
    expect(String(toastMock.warning.mock.calls.at(-1)?.[0])).toContain('丙')
  })

  it('没有关注的超话时给出提示且不发请求', async () => {
    loadFollowedSuperTopics.mockResolvedValue({ name: '我关注的超话', totalNumber: 0, items: [] })
    loadAllFollowedSuperTopics.mockResolvedValue([])

    renderCard()
    fireEvent.click(await screen.findByRole('button', { name: '一键签到' }))

    await waitFor(() =>
      expect(toastMock.warning).toHaveBeenCalledWith('没有关注的超话', {
        id: 'toast-1',
      }),
    )
    expect(signSuperTopic).not.toHaveBeenCalled()
  })
})
