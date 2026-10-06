import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { APP_SETTINGS_STORAGE_KEY } from '@/lib/app-settings'
import { getAppSettingsStore, resetAppSettingsStoreForTest } from '@/lib/app-settings-store'
import { NavigationRail } from '@/lib/weibo/components/navigation-rail'
import type { WeiboPageDescriptor } from '@/lib/weibo/route/page-descriptor'

const getCurrentUserUidMock = vi.fn<() => string | null>()
const checkUnreadNotificationsMock = vi.fn()

vi.mock('@/lib/weibo/platform/current-user', () => ({
  getCurrentUserUid: () => getCurrentUserUidMock(),
}))

vi.mock('@/lib/weibo/data/weibo-io', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/weibo/data/weibo-io')>()
  return {
    ...actual,
    checkUnreadNotifications: () => checkUnreadNotificationsMock(),
  }
})

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches,
      media: '',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

describe('NavigationRail', () => {
  beforeEach(() => {
    getCurrentUserUidMock.mockReset()
    getCurrentUserUidMock.mockReturnValue('1001')
    checkUnreadNotificationsMock.mockReset()
    checkUnreadNotificationsMock.mockResolvedValue({
      mentions: 0,
      comments: 0,
      likes: 0,
      dm: 0,
    })
    Object.defineProperty(globalThis, 'browser', {
      writable: true,
      value: {
        storage: {
          local: {
            get: vi.fn(async () => ({})),
            set: vi.fn(async () => {}),
          },
        },
      },
    })
    mockMatchMedia(false)
    resetAppSettingsStoreForTest()
    const store = getAppSettingsStore({
      get: async () => ({ [APP_SETTINGS_STORAGE_KEY]: undefined }),
      set: async () => {},
    })
    store.setState({
      ...store.getState(),
      homeTab: 'for-you',
      isHydrated: true,
    })
  })
  afterEach(() => {
    cleanup()
  })

  function renderNavigationRail({
    pageKind = 'home',
    viewingProfileUserId = null,
    rewriteEnabled = false,
    immersiveMode = false,
    initialEntries = ['/'],
    onImmersiveModeChange = vi.fn(),
  }: {
    pageKind?: WeiboPageDescriptor['kind']
    viewingProfileUserId?: string | null
    rewriteEnabled?: boolean
    immersiveMode?: boolean
    initialEntries?: string[]
    onImmersiveModeChange?: (enabled: boolean) => void
  } = {}) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={initialEntries}>
          <NavigationRail
            pageKind={pageKind}
            viewingProfileUserId={viewingProfileUserId}
            rewriteEnabled={rewriteEnabled}
            theme="system"
            onRewriteEnabledChange={vi.fn()}
            onThemeChange={vi.fn()}
            onSettingsOpen={vi.fn()}
            onComposeOpen={vi.fn()}
            onSidebarCollapsedChange={vi.fn()}
            immersiveMode={immersiveMode}
            onImmersiveModeChange={onImmersiveModeChange}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    )
  }

  it('renders an accessible navigation landmark', () => {
    renderNavigationRail()
    expect(screen.getByRole('navigation', { name: '主导航' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: '界面控制' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '设置' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '返回主页' })).toHaveAttribute('href', '/')
  })

  it('uses real links for internal destinations', () => {
    renderNavigationRail()

    expect(screen.getByRole('link', { name: '全部关注' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: '最新微博' })).toHaveAttribute('href', '/mygroups')
    // 分组列表未加载时退回到不带 gid 的 /mygroups。
    expect(screen.getByRole('link', { name: '特别关注' })).toHaveAttribute('href', '/mygroups')
    expect(screen.getByRole('link', { name: '超话' })).toHaveAttribute('href', '/chaohua')
    expect(screen.getByRole('link', { name: '收藏' })).toHaveAttribute('href', '/u/page/fav/1001')
  })

  it('超话入口在超话页和超话列表页都算选中', () => {
    const { unmount } = renderNavigationRail({
      pageKind: 'super-topic',
    })
    expect(screen.getByRole('link', { name: '超话' })).toHaveAttribute('aria-current', 'page')
    unmount()

    renderNavigationRail({ pageKind: 'super-topics' })
    expect(screen.getByRole('link', { name: '超话' })).toHaveAttribute('aria-current', 'page')
  })

  it('非超话页时超话入口不选中', () => {
    renderNavigationRail()

    expect(screen.getByRole('link', { name: '超话' })).not.toHaveAttribute('aria-current')
  })

  it('no longer renders the explore entry', () => {
    renderNavigationRail()

    expect(screen.queryByRole('link', { name: '探索' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '主页' })).not.toBeInTheDocument()
  })

  it('renders private messages as a real external link without nesting a button', () => {
    renderNavigationRail()

    const link = screen.getByRole('link', { name: '私信' })
    expect(link).toHaveAttribute('href', 'https://api.weibo.com/chat')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.querySelector('button')).not.toBeInTheDocument()
  })

  it('marks active items through aria-current', () => {
    renderNavigationRail()
    expect(screen.getByRole('link', { name: '全部关注' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: '全部关注' })).toHaveClass('font-semibold')
    expect(screen.getByRole('link', { name: '我的' })).not.toHaveAttribute('aria-current')
  })

  it('moves the active marker to 最新微博 on the default following route', () => {
    renderNavigationRail({ initialEntries: ['/mygroups'] })

    expect(screen.getByRole('link', { name: '最新微博' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: '全部关注' })).not.toHaveAttribute('aria-current')
  })

  it('leaves all three timeline entries inactive on a custom group route', () => {
    renderNavigationRail({ initialEntries: ['/mygroups?gid=123456'] })

    expect(screen.getByRole('link', { name: '最新微博' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: '全部关注' })).not.toHaveAttribute('aria-current')
  })

  it('marks profile as active when viewing current user profile', () => {
    renderNavigationRail({ pageKind: 'profile', viewingProfileUserId: '1001' })
    expect(screen.getByRole('link', { name: '我的' })).toHaveAttribute('aria-current', 'page')
  })

  it('disables account-specific destinations when current user id is missing', () => {
    getCurrentUserUidMock.mockReturnValue(null)
    renderNavigationRail()
    expect(screen.getByRole('button', { name: '我的，登录后可用' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '收藏，登录后可用' })).toBeDisabled()
    expect(screen.queryByRole('link', { name: '我的' })).not.toBeInTheDocument()
  })

  it('does not render the old card description text', () => {
    renderNavigationRail()
    expect(screen.queryByText('随时随地发现新鲜事')).not.toBeInTheDocument()
  })

  it('exposes rewrite toggle state through aria-pressed', () => {
    renderNavigationRail({ rewriteEnabled: true })
    expect(screen.getByRole('button', { name: '切换 xb 重写' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('shows only the exit control while immersive mode is active', () => {
    const onImmersiveModeChange = vi.fn()
    renderNavigationRail({ immersiveMode: true, onImmersiveModeChange })

    expect(screen.queryByRole('navigation', { name: '主导航' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '退出沉浸模式' }))
    expect(onImmersiveModeChange).toHaveBeenCalledWith(false)
  })

  it('uses expanded bottom control width without relying on the CSS xl breakpoint', () => {
    mockMatchMedia(true)
    renderNavigationRail()

    const rewriteLabel = screen.getByText('返回原模式')
    expect(rewriteLabel.parentElement).toHaveClass('justify-between')
    expect(screen.getByRole('complementary')).toHaveClass('w-[204px]', 'overflow-y-auto')
  })

  it('announces unread navigation entries in addition to showing their badge', async () => {
    checkUnreadNotificationsMock.mockResolvedValue({
      mentions: 1,
      comments: 0,
      likes: 0,
      dm: 1,
    })

    renderNavigationRail()

    expect(await screen.findByRole('link', { name: '通知，有未读' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '私信，有未读' })).toBeInTheDocument()
  })

  it('does not poll unread counts when notifications and DMs are hidden', async () => {
    getAppSettingsStore().setState({
      ...getAppSettingsStore().getState(),
      showNotifications: false,
      showDMs: false,
    })

    renderNavigationRail()

    await waitFor(() => {
      expect(checkUnreadNotificationsMock).not.toHaveBeenCalled()
    })
  })

  it('polls unread counts when either notification entry point is visible', async () => {
    getAppSettingsStore().setState({
      ...getAppSettingsStore().getState(),
      showNotifications: false,
      showDMs: true,
    })

    renderNavigationRail()

    await waitFor(() => {
      expect(checkUnreadNotificationsMock).toHaveBeenCalledTimes(1)
    })
  })
})
