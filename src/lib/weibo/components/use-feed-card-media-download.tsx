import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { buildMediaAssets } from '@/lib/weibo/components/media-region/media-region-model'
import type { FeedItem } from '@/lib/weibo/models/feed'
import {
  downloadMediaToFolder,
  estimateTotalSize,
  extractMediaUrls,
  type MediaUrl,
} from '@/lib/weibo/utils/download-media'

/** 超过这个体积先弹窗确认，避免误点下载几个 G 的视频。 */
const MEDIA_SIZE_WARNING_MB = 500

/** 把底层错误带进提示，否则失败时只剩一句无信息量的“请稍后再试”。 */
function describeDownloadError(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error)
  return detail ? `媒体下载失败：${detail}` : '媒体下载失败，请稍后再试'
}

export function useFeedCardMediaDownload(item?: FeedItem) {
  const [downloadLoading, setDownloadLoading] = useState(false)
  const [sizeWarningOpen, setSizeWarningOpen] = useState(false)
  const [pendingDownload, setPendingDownload] = useState<{ urls: MediaUrl[] } | null>(null)

  const saveUrls = async (urls: MediaUrl[], toastId: string | number) => {
    let result
    try {
      result = await downloadMediaToFolder(urls, (progress) => {
        toast(`正在下载媒体（${progress.completed}/${progress.total}）`, {
          id: toastId,
        })
      })
    } catch (error) {
      toast.error(describeDownloadError(error), { id: toastId })
      return
    }

    if (result.failCount > 0) {
      const failedUrls = result.failedUrls ?? []
      toast.warning(`已保存 ${result.successCount} 个文件，${result.failCount} 个未完成`, {
        id: toastId,
        action:
          failedUrls.length > 0
            ? {
                label: '重试失败项',
                onClick: () => {
                  void retryFailedDownload(failedUrls, toastId)
                },
              }
            : undefined,
      })
      return
    }

    toast.success(`已下载 ${result.successCount} 个文件`, {
      id: toastId,
    })
  }

  const retryFailedDownload = async (urls: MediaUrl[], toastId: string | number) => {
    setDownloadLoading(true)
    try {
      toast('正在准备媒体', { id: toastId })
      await saveUrls(urls, toastId)
    } finally {
      setDownloadLoading(false)
    }
  }

  const handleDownload = async () => {
    if (!item) return

    setDownloadLoading(true)

    try {
      const urls = extractMediaUrls(buildMediaAssets(item))

      if (urls.length === 0) {
        toast.error('这条微博没有可下载的媒体')
        return
      }

      const totalSize = await estimateTotalSize(urls)
      const sizeMB = totalSize / (1024 * 1024)

      if (sizeMB > MEDIA_SIZE_WARNING_MB) {
        setPendingDownload({ urls })
        setSizeWarningOpen(true)
        return
      }

      await saveUrls(urls, toast('正在准备媒体'))
    } catch (error) {
      toast.error(describeDownloadError(error))
    } finally {
      setDownloadLoading(false)
    }
  }

  const confirmLargeDownload = async () => {
    if (!pendingDownload || !item) return

    setSizeWarningOpen(false)
    setDownloadLoading(true)

    try {
      await saveUrls(pendingDownload.urls, toast('正在准备媒体'))
    } catch (error) {
      toast.error(describeDownloadError(error))
    } finally {
      setDownloadLoading(false)
      setPendingDownload(null)
    }
  }

  const downloadDialog = (
    <Dialog open={sizeWarningOpen} onOpenChange={setSizeWarningOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>媒体文件超过 500MB</DialogTitle>
          <DialogDescription>这条微博的媒体文件较大，下载可能需要更长时间。</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setSizeWarningOpen(false)
              setPendingDownload(null)
            }}
          >
            暂不下载
          </Button>
          <Button type="button" onClick={confirmLargeDownload} disabled={downloadLoading}>
            {downloadLoading ? '下载中…' : '继续下载媒体'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  return {
    downloadDialog,
    downloadLoading,
    handleDownload,
  }
}
