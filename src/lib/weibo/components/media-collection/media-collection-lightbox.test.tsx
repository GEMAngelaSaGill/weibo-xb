import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { APP_SETTINGS_STORAGE_KEY } from '@/lib/app-settings'
import { getAppSettingsStore, resetAppSettingsStoreForTest } from '@/lib/app-settings-store'
import { buildMediaCollectionItems, MediaCollection } from '@/lib/weibo/components/media-collection'

function single() {
  return buildMediaCollectionItems([
    {
      id: 'pic-1',
      thumbnailUrl: 'https://example.com/thumb.jpg',
      largeUrl: 'https://example.com/large.jpg',
      width: 800,
      height: 600,
    },
  ])
}

describe('lightbox real render', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(globalThis, 'browser', {
      writable: true,
      value: {
        storage: { local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) } },
      },
    })
    resetAppSettingsStoreForTest()
    const store = getAppSettingsStore({
      get: async () => ({ [APP_SETTINGS_STORAGE_KEY]: undefined }),
      set: async () => {},
    })
    store.setState({ ...store.getState(), isHydrated: true })
  })

  it('opens on the preview and swaps to the original when 查看原图 is clicked', async () => {
    const { container } = render(<MediaCollection items={single()} />)

    const thumbnail = container.querySelector('img')
    expect(thumbnail).not.toBeNull()
    fireEvent.click(thumbnail as Element)

    const photo = await waitFor(() => {
      const node = document.querySelector('img.PhotoView__Photo') as HTMLImageElement | null
      expect(node).not.toBeNull()
      return node as HTMLImageElement
    })
    expect(photo.getAttribute('src')).toBe('https://example.com/thumb.jpg')

    const button = await screen.findByRole('button', { name: '查看原图' })

    // 按钮挂在 react-photo-view 的 overlay 槽里，靠 portal 的 fixed 定位才能贴到底部
    const overlay = button.closest('.PhotoView-Slider__Overlay')
    expect(overlay).not.toBeNull()
    expect(overlay?.closest('.PhotoView-Portal')).not.toBeNull()

    fireEvent.click(button)

    await waitFor(() => {
      const node = document.querySelector('img.PhotoView__Photo') as HTMLImageElement | null
      expect(node?.getAttribute('src')).toBe('https://example.com/large.jpg')
    })
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '查看原图' })).not.toBeInTheDocument()
    })
  })

  it('loads the original straight away in 直接原图 mode', async () => {
    getAppSettingsStore().setState({ photoViewMode: 'original' })

    const { container } = render(<MediaCollection items={single()} />)
    fireEvent.click(container.querySelector('img') as Element)

    await waitFor(() => {
      const node = document.querySelector('img.PhotoView__Photo') as HTMLImageElement | null
      expect(node?.getAttribute('src')).toBe('https://example.com/large.jpg')
    })

    expect(screen.queryByRole('button', { name: '查看原图' })).not.toBeInTheDocument()
  })
})
