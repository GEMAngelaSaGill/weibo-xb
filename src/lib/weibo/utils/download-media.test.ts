import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildMediaAssets,
  type MediaAsset,
} from '@/lib/weibo/components/media-region/media-region-model'
import type { FeedItem } from '@/lib/weibo/models/feed'

import {
  createMediaUrl,
  downloadMediaToFolder,
  estimateTotalSize,
  extractMediaUrls as extractMediaUrlsFromAssets,
  formatDownloadTimestamp,
  inferExtension,
} from './download-media'

function extractMediaUrls(item: FeedItem) {
  return extractMediaUrlsFromAssets(buildMediaAssets(item))
}

/** 取出 `YYYYMMDD_HHmmss` 前缀，避免断言写死秒数导致跨秒抖动。 */
function timestampOf(filename: string): string {
  return filename.slice(0, 15)
}

/** 记录 anchor 落盘时用的文件名，用来断言时间戳命名。 */
const downloadedFilenames: string[] = []

/**
 * 落盘流程：media-fetch 取字节（background 带 Referer）→ anchor + blob URL 存盘。
 * anchor 的 download 属性是唯一能同时躲开 CDN 403、又保住文件名的路。
 */
function mockMediaRuntime(handlers: { fetch?: unknown } = {}) {
  let blobSeq = 0

  const sendMessage = vi.fn((message: { type: string; url: string; filename?: string }) => {
    if (message.type === 'media-fetch') {
      return Promise.resolve(
        handlers.fetch ?? {
          ok: true,
          data: btoa('image-bytes'),
          contentType: 'image/jpeg',
        },
      )
    }
    return Promise.resolve(undefined)
  })

  Object.defineProperty(globalThis, 'browser', {
    writable: true,
    configurable: true,
    value: { runtime: { sendMessage } },
  })
  Object.defineProperty(URL, 'createObjectURL', {
    writable: true,
    configurable: true,
    value: vi.fn(() => `blob:mock-${++blobSeq}`),
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    writable: true,
    configurable: true,
    value: vi.fn(),
  })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
    function (this: HTMLAnchorElement) {
      downloadedFilenames.push(this.download)
    },
  )

  return sendMessage
}

afterEach(() => {
  vi.restoreAllMocks()
  Object.defineProperty(globalThis, 'browser', {
    writable: true,
    configurable: true,
    value: {
      runtime: {
        getManifest: () => ({ version: '0.0.0-test' }),
      },
    },
  })
})

describe('inferExtension', () => {
  it('应该从 URL 中推断出正确的扩展名', () => {
    expect(inferExtension('https://example.com/image.jpg')).toBe('jpg')
    expect(inferExtension('https://example.com/image.jpeg')).toBe('jpeg')
    expect(inferExtension('https://example.com/image.png')).toBe('png')
    expect(inferExtension('https://example.com/image.gif')).toBe('gif')
    expect(inferExtension('https://example.com/image.webp')).toBe('webp')
    expect(inferExtension('https://example.com/video.mp4')).toBe('mp4')
    expect(inferExtension('https://example.com/video.mov')).toBe('mov')
  })

  it('应该处理带查询参数的 URL', () => {
    expect(inferExtension('https://example.com/image.jpg?size=large')).toBe('jpg')
    expect(inferExtension('https://example.com/video.mp4?token=abc123')).toBe('mp4')
  })

  it('应该为无扩展名的 URL 返回默认值', () => {
    expect(inferExtension('https://example.com/image')).toBe('jpg')
    expect(inferExtension('https://example.com/video/stream')).toBe('mp4')
  })
})

describe('extractMediaUrls', () => {
  const createMockItem = (overrides: Partial<FeedItem> = {}): FeedItem => ({
    id: '1',
    mblogId: 'abc123',
    isLongText: false,
    author: {
      id: 'user1',
      name: '测试用户',
      avatarUrl: null,
    },
    text: '这是一条测试微博',
    createdAt: '2024-01-01',
    createdAtLabel: '1小时前',
    stats: {
      likes: 0,
      comments: 0,
      reposts: 0,
    },
    images: [],
    media: null,
    ...overrides,
  })

  it('按传入素材顺序导出、保持 Live Photo 相邻并按 URL 去重', () => {
    const assets: MediaAsset[] = [
      {
        kind: 'video',
        id: 'video-1',
        playable: true,
        video: {
          type: 'video',
          id: 'video-1',
          videoStreamUrl: 'https://example.com/video.mp4',
        },
      },
      {
        kind: 'image',
        id: 'live-photo-1',
        image: {
          id: 'live-photo-1',
          thumbnailUrl: 'https://example.com/live-thumb.jpg',
          largeUrl: 'https://example.com/live.jpg',
          livePhotoVideoUrl: 'https://example.com/live.mov',
        },
      },
      {
        kind: 'video',
        id: 'duplicate-video-url',
        playable: true,
        video: {
          type: 'video',
          id: 'duplicate-video-url',
          videoStreamUrl: 'https://example.com/video.mp4',
        },
      },
      {
        kind: 'standalone',
        id: 'audio-1',
        media: {
          type: 'audio',
          title: '音频',
          streamUrl: 'https://example.com/audio',
          coverUrl: null,
        },
      },
    ]

    const urls = extractMediaUrlsFromAssets(assets)
    const timestamp = timestampOf(urls[0]!.filename)

    expect(urls.map(({ url, type, filename }) => ({ url, type, filename }))).toEqual([
      {
        url: 'https://example.com/video.mp4',
        type: 'video',
        filename: `${timestamp}_1.mp4`,
      },
      {
        url: 'https://example.com/live.jpg',
        type: 'image',
        filename: `${timestamp}_2.jpg`,
      },
      {
        url: 'https://example.com/live.mov',
        type: 'video',
        filename: `${timestamp}_3.mov`,
      },
      {
        url: 'https://example.com/audio',
        type: 'audio',
        filename: `${timestamp}_4.m4a`,
      },
    ])
  })

  it('应该提取纯图片微博的所有图片', () => {
    const item = createMockItem({
      images: [
        {
          id: '1',
          thumbnailUrl: 'https://example.com/thumb1.jpg',
          largeUrl: 'https://example.com/large1.jpg',
        },
        {
          id: '2',
          thumbnailUrl: 'https://example.com/thumb2.jpg',
          largeUrl: 'https://example.com/large2.jpg',
        },
      ],
    })

    const urls = extractMediaUrls(item)

    expect(urls).toHaveLength(2)
    expect(urls[0]!.url).toBe('https://example.com/large1.jpg')
    expect(urls[0]!.type).toBe('image')
    expect(urls[0]!.filename).toMatch(/^\d{8}_\d{6}_1\.jpg$/)
    expect(urls[1]!.url).toBe('https://example.com/large2.jpg')
    expect(urls[1]!.filename).toMatch(/^\d{8}_\d{6}_2\.jpg$/)
    expect(timestampOf(urls[1]!.filename)).toBe(timestampOf(urls[0]!.filename))
  })

  it('应该保留图片下载候选 URL', () => {
    const item = createMockItem({
      images: [
        {
          id: '1',
          thumbnailUrl: 'https://example.com/thumb1.jpg',
          largeUrl: 'https://example.com/large1.jpg',
          downloadUrls: ['https://example.com/large1.jpg', 'https://example.com/original1.jpg'],
        },
      ],
    })

    const urls = extractMediaUrls(item)

    expect(urls[0]!.fallbackUrls).toEqual([
      'https://example.com/large1.jpg',
      'https://example.com/original1.jpg',
    ])
  })

  it('应该为 sinaimg 图片补充常见尺寸候选并规范化协议', () => {
    const item = createMockItem({
      images: [
        {
          id: '1',
          thumbnailUrl: 'http://wx1.sinaimg.cn/thumbnail/pic.jpg',
          largeUrl: 'http://wx1.sinaimg.cn/large/pic.jpg',
          downloadUrls: ['https://wx1.sinaimg.cn/woriginal/pic.jpg'],
        },
      ],
    })

    const urls = extractMediaUrls(item)

    expect(urls[0]!.url).toBe('https://wx1.sinaimg.cn/large/pic.jpg')
    expect(urls[0]!.fallbackUrls).toEqual([
      'https://wx1.sinaimg.cn/large/pic.jpg',
      'https://wx1.sinaimg.cn/woriginal/pic.jpg',
      'https://wx1.sinaimg.cn/mw2000/pic.jpg',
      'https://wx1.sinaimg.cn/original/pic.jpg',
      'https://wx1.sinaimg.cn/orj1080/pic.jpg',
      'https://wx1.sinaimg.cn/orj960/pic.jpg',
      'https://wx1.sinaimg.cn/bmiddle/pic.jpg',
      'https://wx1.sinaimg.cn/thumbnail/pic.jpg',
    ])
  })

  it('应该提取 Live Photo 的图片和视频', () => {
    const item = createMockItem({
      images: [
        {
          id: '1',
          thumbnailUrl: 'https://example.com/thumb1.jpg',
          largeUrl: 'https://example.com/large1.jpg',
          type: 'livephoto',
          livePhotoVideoUrl: 'http://livephoto.us.sinaimg.cn/video1.mp4',
        },
      ],
    })

    const urls = extractMediaUrls(item)

    expect(urls).toHaveLength(2)
    expect(urls[0]!.url).toBe('https://example.com/large1.jpg')
    expect(urls[0]!.type).toBe('image')
    expect(urls[1]!.url).toBe('https://livephoto.us.sinaimg.cn/video1.mp4')
    expect(urls[1]!.type).toBe('video')
  })

  it('应该提取单视频微博', () => {
    const item = createMockItem({
      media: {
        type: 'video',
        streamUrl: 'https://example.com/stream.mp4',
        title: '测试视频',
        coverUrl: null,
        downloadUrl: 'https://example.com/download.mp4',
      },
    })

    const urls = extractMediaUrls(item)

    expect(urls).toHaveLength(1)
    expect(urls[0]!.url).toBe('https://example.com/download.mp4')
    expect(urls[0]!.type).toBe('video')
  })

  it('应该在没有 downloadUrl 时降级到 streamUrl', () => {
    const item = createMockItem({
      media: {
        type: 'video',
        streamUrl: 'https://example.com/stream.mp4',
        title: '测试视频',
        coverUrl: null,
      },
    })

    const urls = extractMediaUrls(item)

    expect(urls).toHaveLength(1)
    expect(urls[0]!.url).toBe('https://example.com/stream.mp4')
  })

  it('应该提取混合媒体中的图片和视频', () => {
    const item = createMockItem({
      mixMediaInfo: [
        {
          type: 'pic',
          id: '1',
          image: {
            id: '1',
            thumbnailUrl: 'https://example.com/thumb1.jpg',
            largeUrl: 'https://example.com/large1.jpg',
          },
        },
        {
          type: 'video',
          id: '2',
          videoCoverUrl: 'https://example.com/cover.jpg',
          videoStreamUrl: 'https://example.com/stream.mp4',
          videoDownloadUrl: 'https://example.com/download.mp4',
        },
      ],
    })

    const urls = extractMediaUrls(item)

    expect(urls).toHaveLength(2)
    expect(urls[0]!.url).toBe('https://example.com/large1.jpg')
    expect(urls[0]!.type).toBe('image')
    expect(urls[1]!.url).toBe('https://example.com/download.mp4')
    expect(urls[1]!.type).toBe('video')
  })

  it('应该处理混合媒体中的 Live Photo', () => {
    const item = createMockItem({
      mixMediaInfo: [
        {
          type: 'pic',
          id: '1',
          image: {
            id: '1',
            thumbnailUrl: 'https://example.com/thumb1.jpg',
            largeUrl: 'https://example.com/large1.jpg',
            type: 'livephoto',
            livePhotoVideoUrl: 'https://example.com/video1.mp4',
          },
        },
      ],
    })

    const urls = extractMediaUrls(item)

    expect(urls).toHaveLength(2)
    expect(urls[0]!.type).toBe('image')
    expect(urls[1]!.type).toBe('video')
  })

  it('应该跳过没有 URL 的混合媒体视频', () => {
    const item = createMockItem({
      mixMediaInfo: [
        {
          type: 'video',
          id: '1',
          videoCoverUrl: 'https://example.com/cover.jpg',
        },
      ],
    })

    const urls = extractMediaUrls(item)

    expect(urls).toHaveLength(0)
  })

  it('应该为空微博返回空数组', () => {
    const item = createMockItem()

    const urls = extractMediaUrls(item)

    expect(urls).toHaveLength(0)
  })

  it('用下载时刻的时间戳命名，同一批多张追加序号', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 7, 14, 30, 52))

    try {
      const item = createMockItem({
        images: [
          {
            id: '1',
            thumbnailUrl: 'https://example.com/thumb1.jpg',
            largeUrl: 'https://example.com/large1.jpg',
          },
          {
            id: '2',
            thumbnailUrl: 'https://example.com/thumb2.jpg',
            largeUrl: 'https://example.com/large2.jpg',
          },
        ],
      })

      expect(extractMediaUrls(item).map((url) => url.filename)).toEqual([
        '20261007_143052_1.jpg',
        '20261007_143052_2.jpg',
      ])
    } finally {
      vi.useRealTimers()
    }
  })

  it('只有一个素材时不追加序号', () => {
    const item = createMockItem({
      images: [
        {
          id: '1',
          thumbnailUrl: 'https://example.com/thumb1.jpg',
          largeUrl: 'https://example.com/large1.jpg',
        },
      ],
    })

    expect(extractMediaUrls(item)[0]!.filename).toMatch(/^\d{8}_\d{6}\.jpg$/)
  })

  it('扩展名跟随素材实际类型', () => {
    const item = createMockItem({
      media: {
        type: 'video',
        streamUrl: 'https://example.com/stream.mp4',
        title: '测试视频',
        coverUrl: null,
      },
    })

    expect(extractMediaUrls(item)[0]!.filename).toMatch(/^\d{8}_\d{6}\.mp4$/)
  })

  it('文件名不含作者和正文，仅由时间戳构成', () => {
    const item = createMockItem({
      author: { id: 'user1', name: '张三', avatarUrl: null },
      text: '今天天气真好啊，出去玩了一整天',
      images: [
        {
          id: '1',
          thumbnailUrl: 'https://example.com/thumb1.jpg',
          largeUrl: 'https://example.com/large1.jpg',
        },
      ],
    })

    expect(extractMediaUrls(item)[0]!.filename).toMatch(/^\d{8}_\d{6}\.jpg$/)
  })

  it('formatDownloadTimestamp 补零到 YYYYMMDD_HHmmss', () => {
    expect(formatDownloadTimestamp(new Date(2026, 0, 2, 3, 4, 5))).toBe('20260102_030405')
    expect(formatDownloadTimestamp(new Date(2026, 11, 31, 23, 59, 59))).toBe('20261231_235959')
  })
})

describe('download media proxy', () => {
  it('应该通过 background 代理预估媒体大小', async () => {
    const sendMessage = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, size: 1024 })
      .mockResolvedValueOnce({ ok: true, size: 2048 })

    Object.defineProperty(globalThis, 'browser', {
      writable: true,
      configurable: true,
      value: {
        runtime: {
          sendMessage,
        },
      },
    })

    await expect(
      estimateTotalSize([
        { url: 'https://wx1.sinaimg.cn/large/a.jpg', filename: 'a.jpg', type: 'image' },
        { url: 'https://wx2.sinaimg.cn/large/b.jpg', filename: 'b.jpg', type: 'image' },
      ]),
    ).resolves.toBe(3072)

    expect(sendMessage).toHaveBeenCalledWith({
      type: 'media-head',
      url: 'https://wx1.sinaimg.cn/large/a.jpg',
    })
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'media-head',
      url: 'https://wx2.sinaimg.cn/large/b.jpg',
    })
  })

  it('limits concurrent media-head requests when estimating total size', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const pending: Array<(value: { ok: true; size: number }) => void> = []

    const sendMessage = vi.fn(() => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      return new Promise<{ ok: true; size: number }>((resolve) => {
        pending.push((value) => {
          inFlight--
          resolve(value)
        })
      })
    })

    Object.defineProperty(globalThis, 'browser', {
      writable: true,
      configurable: true,
      value: {
        runtime: {
          sendMessage,
        },
      },
    })

    const urls = Array.from({ length: 8 }, (_, i) => ({
      url: `https://wx1.sinaimg.cn/large/${i}.jpg`,
      filename: `${i}.jpg`,
      type: 'image' as const,
    }))

    const done = estimateTotalSize(urls)

    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledTimes(5)
    })
    expect(maxInFlight).toBeLessThanOrEqual(5)

    const firstBatch = pending.splice(0, pending.length)
    for (const resolve of firstBatch) {
      resolve({ ok: true, size: 100 })
    }

    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledTimes(8)
    })

    const secondBatch = pending.splice(0, pending.length)
    for (const resolve of secondBatch) {
      resolve({ ok: true, size: 100 })
    }

    await expect(done).resolves.toBe(800)
    expect(maxInFlight).toBeLessThanOrEqual(5)
  })

  it('取字节成功后用时间戳文件名落盘', async () => {
    const sendMessage = mockMediaRuntime()
    downloadedFilenames.length = 0

    const result = await downloadMediaToFolder([
      { url: 'https://wx1.sinaimg.cn/large/a.jpg', filename: '20261007_143052.jpg', type: 'image' },
    ])

    expect(result).toEqual({ successCount: 1, failCount: 0 })
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'media-fetch',
      url: 'https://wx1.sinaimg.cn/large/a.jpg',
    })
    // anchor 的 download 属性拿到的是纯时间戳名（不再带目录前缀）
    expect(downloadedFilenames).toEqual(['20261007_143052.jpg'])
  })

  it('主图取字节失败时换下一个候选', async () => {
    let call = 0
    const sendMessage = mockMediaRuntime()
    sendMessage.mockImplementation((message: { type: string; url: string; filename?: string }) => {
      if (message.type === 'media-fetch') {
        call++
        return Promise.resolve(
          call === 1
            ? { ok: false, error: 'media-fetch-failed:403' }
            : { ok: true, data: btoa('x'), contentType: 'image/jpeg' },
        )
      }
      return Promise.resolve(undefined)
    })

    await expect(
      downloadMediaToFolder([
        {
          url: 'https://wx1.sinaimg.cn/large/a.jpg',
          fallbackUrls: [
            'https://wx1.sinaimg.cn/large/a.jpg',
            'https://wx1.sinaimg.cn/orj1080/a.jpg',
          ],
          filename: 'a.jpg',
          type: 'image',
        },
      ]),
    ).resolves.toEqual({ successCount: 1, failCount: 0 })

    const fetchedUrls = sendMessage.mock.calls
      .filter(([message]) => (message as { type: string }).type === 'media-fetch')
      .map(([message]) => (message as { url: string }).url)

    expect(fetchedUrls).toEqual([
      'https://wx1.sinaimg.cn/large/a.jpg',
      'https://wx1.sinaimg.cn/orj1080/a.jpg',
    ])
  })

  it('所有候选都失败时抛错并带上具体原因', async () => {
    mockMediaRuntime({ fetch: { ok: false, error: 'media-fetch-failed:403' } })

    const first = { url: 'https://example.com/a.jpg', filename: 'a.jpg', type: 'image' as const }
    const second = { url: 'https://example.com/b.jpg', filename: 'b.jpg', type: 'image' as const }

    await expect(downloadMediaToFolder([first, second])).rejects.toThrow('media-fetch-failed:403')
  })

  it('部分失败时返回成功与失败计数', async () => {
    let call = 0
    const sendMessage = mockMediaRuntime()
    sendMessage.mockImplementation((message: { type: string; url: string; filename?: string }) => {
      if (message.type === 'media-fetch') {
        call++
        return Promise.resolve(
          call === 1
            ? { ok: true, data: btoa('ok'), contentType: 'image/jpeg' }
            : { ok: false, error: 'media-fetch-failed:403' },
        )
      }
      return Promise.resolve(undefined)
    })

    const first = { url: 'https://example.com/a.jpg', filename: 'a.jpg', type: 'image' as const }
    const second = { url: 'https://example.com/b.jpg', filename: 'b.jpg', type: 'image' as const }
    const progress: Array<{ stage: string; completed: number; total: number }> = []

    const result = await downloadMediaToFolder([first, second], (event) => {
      progress.push(event)
    })

    expect(progress).toEqual([
      { stage: 'downloading', completed: 1, total: 2 },
      { stage: 'downloading', completed: 2, total: 2 },
    ])
    expect(result).toEqual({ successCount: 1, failCount: 1, failedUrls: [second] })
  })

  it('进度回调异常时不应中断下载', async () => {
    mockMediaRuntime()

    await expect(
      downloadMediaToFolder(
        [{ url: 'https://example.com/a.jpg', filename: 'a.jpg', type: 'image' }],
        () => {
          throw new Error('callback failed')
        },
      ),
    ).resolves.toMatchObject({ successCount: 1, failCount: 0 })
  })

  it('没有可下载的媒体时抛错', async () => {
    await expect(downloadMediaToFolder([])).rejects.toThrow('没有可下载的媒体资源')
  })
})

describe('createMediaUrl', () => {
  it('生成时间戳文件名并保留 sinaimg 尺寸候选', () => {
    const mediaUrl = createMediaUrl('http://wx1.sinaimg.cn/large/pic.jpg')

    expect(mediaUrl.url).toBe('https://wx1.sinaimg.cn/large/pic.jpg')
    expect(mediaUrl.filename).toMatch(/^\d{8}_\d{6}\.jpg$/)
    expect(mediaUrl.fallbackUrls).toContain('https://wx1.sinaimg.cn/original/pic.jpg')
  })

  it('视频不做尺寸候选展开', () => {
    const mediaUrl = createMediaUrl('https://f.video.weibocdn.com/video.mp4', 'video')

    expect(mediaUrl.filename).toMatch(/^\d{8}_\d{6}\.mp4$/)
    expect(mediaUrl.fallbackUrls).toBeUndefined()
  })
})
