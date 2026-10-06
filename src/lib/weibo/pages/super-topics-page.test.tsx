import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { APP_SETTINGS_STORAGE_KEY } from '@/lib/app-settings'
import { getAppSettingsStore, resetAppSettingsStoreForTest } from '@/lib/app-settings-store'
import { AppShell } from '@/lib/weibo/app/app-shell'
import { loadFollowedSuperTopics } from '@/lib/weibo/data/weibo-io'
import { SuperTopicsPage } from '@/lib/weibo/pages/super-topics-page'

vi.mock('@/lib/weibo/data/weibo-io', async () => {
  const actual = await vi.importActual<typeof import('@/lib/weibo/data/weibo-io')>(
    '@/lib/weibo/data/weibo-io',
  )

  return {
    ...actual,
    loadFollowedSuperTopics: vi.fn(),
  }
})

function superTopic(title: string, link: string) {
  return {
    title,
    intro: '',
    fansText: '32万粉丝',
    link,
    pic: '',
    oid: '',
    topicName: title,
    statusCount: 0,
    followCount: 0,
  }
}

function renderSuperTopicsPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/chaohua']}>
        <Routes>
          <Route path="*" element={<AppShell />}>
            <Route path="chaohua" element={<SuperTopicsPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('SuperTopicsPage', () => {
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

  it('列出关注的超话，条目走站内跳转', async () => {
    vi.mocked(loadFollowedSuperTopics).mockResolvedValue({
      name: '我关注的超话',
      totalNumber: 2,
      items: [
        superTopic('AHyeon', 'https://weibo.com/p/100808aaa/super_index'),
        superTopic('心动的信号', 'https://weibo.com/p/100808bbb'),
      ],
    })

    renderSuperTopicsPage()

    expect(await screen.findByRole('heading', { name: '我关注的超话' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /AHyeon/ })).toHaveAttribute(
      'href',
      '/p/100808aaa/super_index',
    )
    expect(screen.getByRole('link', { name: /心动的信号/ })).toHaveAttribute('href', '/p/100808bbb')
  })

  it('没有关注的超话时给出空状态', async () => {
    vi.mocked(loadFollowedSuperTopics).mockResolvedValue({
      name: '我关注的超话',
      totalNumber: 0,
      items: [],
    })

    renderSuperTopicsPage()

    expect(await screen.findByText('暂无关注的超话')).toBeInTheDocument()
  })

  it('加载失败时给出可重试提示', async () => {
    vi.mocked(loadFollowedSuperTopics).mockRejectedValue(new Error('boom'))

    renderSuperTopicsPage()

    expect(await screen.findByText(/超话加载失败/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
  })
})
