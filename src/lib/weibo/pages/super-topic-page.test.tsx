import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { APP_SETTINGS_STORAGE_KEY } from '@/lib/app-settings'
import { getAppSettingsStore, resetAppSettingsStoreForTest } from '@/lib/app-settings-store'
import { AppShell } from '@/lib/weibo/app/app-shell'
import { loadSuperTopicFlow } from '@/lib/weibo/data/weibo-io'
import { SuperTopicPage } from '@/lib/weibo/pages/super-topic-page'

const SUPER_TOPIC_ID = '10080822ac697ad6c50539a5cccc69398dafd9'

vi.mock('@/lib/weibo/data/weibo-io', async () => {
  const actual = await vi.importActual<typeof import('@/lib/weibo/data/weibo-io')>(
    '@/lib/weibo/data/weibo-io',
  )

  return {
    ...actual,
    loadSuperTopicFlow: vi.fn(),
  }
})

function flowPage() {
  return {
    items: [],
    nextCursor: null,
    channels: [
      { id: 'recommend', title: '热门', flowId: `${SUPER_TOPIC_ID}_-_recommend` },
      { id: 'feed', title: '最新', flowId: `${SUPER_TOPIC_ID}_-_feed` },
    ],
    header: {
      name: 'AHyeon',
      avatarUrl: 'https://wx3.sinaimg.cn/thumb180/avatar.jpg',
      stats: [
        { value: '57万', label: '帖子' },
        { value: '32万', label: '粉丝' },
      ],
    },
  }
}

function renderSuperTopicPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/p/${SUPER_TOPIC_ID}/super_index`]}>
        <Routes>
          <Route path="*" element={<AppShell />}>
            <Route path="p/:superTopicId/*" element={<SuperTopicPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('SuperTopicPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(globalThis, 'browser', {
      writable: true,
      configurable: true,
      value: {
        storage: {
          local: {
            get: vi.fn(async () => ({})),
            set: vi.fn(async () => {}),
          },
        },
      },
    })
    resetAppSettingsStoreForTest()
    const store = getAppSettingsStore({
      get: async () => ({ [APP_SETTINGS_STORAGE_KEY]: undefined }),
      set: async () => {},
    })
    store.setState({
      ...store.getState(),
      rewriteEnabled: true,
      isHydrated: true,
    })
  })

  it('默认用超话 id 拉第一页，并渲染头部和分区栏', async () => {
    vi.mocked(loadSuperTopicFlow).mockResolvedValue(flowPage())

    renderSuperTopicPage()

    expect(await screen.findByRole('heading', { name: 'AHyeon' })).toBeInTheDocument()
    expect(screen.getByText('57万 帖子')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '热门' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '最新' })).toBeInTheDocument()

    expect(loadSuperTopicFlow).toHaveBeenCalledWith({
      superTopicId: SUPER_TOPIC_ID,
      flowId: null,
      page: 1,
    })
  })

  it('切换分区时带上该分区的 flowId 重新拉取', async () => {
    vi.mocked(loadSuperTopicFlow).mockResolvedValue(flowPage())

    renderSuperTopicPage()

    fireEvent.click(await screen.findByRole('button', { name: '最新' }))

    await waitFor(() =>
      expect(loadSuperTopicFlow).toHaveBeenCalledWith({
        superTopicId: SUPER_TOPIC_ID,
        flowId: `${SUPER_TOPIC_ID}_-_feed`,
        page: 1,
      }),
    )
  })

  it('切换分区加载期间，头部和分区栏不消失', async () => {
    vi.mocked(loadSuperTopicFlow)
      .mockResolvedValueOnce(flowPage())
      .mockImplementationOnce(() => new Promise(() => {}))

    renderSuperTopicPage()

    fireEvent.click(await screen.findByRole('button', { name: '最新' }))

    expect(screen.getByRole('heading', { name: 'AHyeon' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '热门' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '最新' })).toBeInTheDocument()
  })

  it('没有内容时展示空状态', async () => {
    vi.mocked(loadSuperTopicFlow).mockResolvedValue(flowPage())

    renderSuperTopicPage()

    expect(await screen.findByText('此超话暂无内容')).toBeInTheDocument()
  })

  it('请求失败时给出可重试的提示', async () => {
    vi.mocked(loadSuperTopicFlow).mockRejectedValue(new Error('boom'))

    renderSuperTopicPage()

    expect(await screen.findByText('超话内容加载失败，请稍后重试。')).toBeInTheDocument()
  })
})
