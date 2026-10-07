import { Bookmark, Copy, Download, Image, Link, MoreHorizontal, Trash } from 'lucide-react'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { type FeedToolbarButtonId, FEED_TOOLBAR_BUTTON_IDS } from '@/lib/app-settings'
import { cn } from '@/lib/utils'
import { useGenImageDialog } from '@/lib/weibo/components/gen-image-dialog-context'
import { useFeedCardMediaDownload } from '@/lib/weibo/components/use-feed-card-media-download'
import { sendFeedMenuFeedback, shieldStatus, shieldUser } from '@/lib/weibo/data/weibo-data'
import type { FeedItem, FeedMenuItem } from '@/lib/weibo/models/feed'

type ContentType = 'status' | 'comment'

/** 屏蔽关键词、投诉在微博原站也是跳转外部页面，不是接口。 */
const SHIELD_KEYWORD_URL = 'https://weibo.com/set/shield?type=keyword'

function reportUrl(mblogId: string): string {
  return `https://service.account.weibo.com/reportspam?rid=${mblogId}&type=1&from=1FFFF96039`
}

export interface FeedCardMoreMenuProps {
  type: ContentType
  isOwner: boolean
  item?: FeedItem
  favorited?: boolean
  onFavorite?: () => void | Promise<void>
  onDelete?: () => void | Promise<void>
  isDeleting?: boolean
  contentLabel?: string
  visibleActionIds?: FeedToolbarButtonId[]
  onCopyText?: () => void
  className?: string
}

export function FeedCardMoreMenu({
  type,
  isOwner,
  item,
  favorited = false,
  onFavorite,
  onDelete,
  isDeleting,
  contentLabel = '这条内容',
  visibleActionIds = [...FEED_TOOLBAR_BUTTON_IDS],
  onCopyText,
  className,
}: FeedCardMoreMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [favoriteLoading, setFavoriteLoading] = useState(false)
  const [shieldStatusOpen, setShieldStatusOpen] = useState(false)
  const [shieldUserOpen, setShieldUserOpen] = useState(false)
  const [shieldUserLoading, setShieldUserLoading] = useState(false)
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  // 与原站一致：不看他的微博 = 否，禁止互动 = 是，禁止关注 = 否；三项全选即拉黑。
  const [shieldRange, setShieldRange] = useState({ status: false, interact: true, follow: false })
  const { openGenImage } = useGenImageDialog()
  const { downloadDialog, downloadLoading, handleDownload } = useFeedCardMediaDownload(item)

  // 微博服务端随每条微博下发的操作菜单。文案和可用项都由它决定，客户端不写死。
  const menus = item?.menus ?? []
  const feedbackMenus = menus.filter((menu) => menu.type.startsWith('mblog_menus_no_interst'))
  const hasShieldMenu = menus.some((menu) => menu.type.startsWith('mblog_menus_shield'))
  const hasReportMenu = menus.some((menu) => menu.type === 'mblog_menus_report')
  const showServerMenus = type === 'status' && item !== undefined && menus.length > 0

  const showFavorite =
    visibleActionIds.includes('favorite') && type === 'status' && onFavorite !== undefined
  const showGenImage = visibleActionIds.includes('gen-image') && item && type === 'status'
  const showCopyLink = visibleActionIds.includes('copy-link') && type === 'status' && item?.mblogId
  const showCopyText =
    visibleActionIds.includes('copy-text') && type === 'status' && onCopyText !== undefined
  const showDownload =
    visibleActionIds.includes('download-media') &&
    item &&
    type === 'status' &&
    (item.images.length > 0 || item.media !== null || (item.mixMediaInfo?.length ?? 0) > 0)
  const hasVisibleMenuItem =
    showGenImage ||
    showDownload ||
    showFavorite ||
    showCopyLink ||
    showCopyText ||
    isOwner ||
    showServerMenus

  if (!hasVisibleMenuItem) {
    return null
  }

  const runFeedback = async (menu: FeedMenuItem) => {
    setMenuOpen(false)
    setFeedbackLoading(true)
    const toastId = toast('正在提交…')

    try {
      await sendFeedMenuFeedback(menu.actionlog)
      toast.success('已提交，将减少此类内容推荐', { id: toastId })
    } catch (error) {
      toast.error(`操作失败：${error instanceof Error ? error.message : '未知原因'}`, {
        id: toastId,
      })
    } finally {
      setFeedbackLoading(false)
    }
  }

  const runShieldStatus = async () => {
    if (!item) return
    const toastId = toast('正在屏蔽…')

    try {
      await shieldStatus(item.id)
      setShieldStatusOpen(false)
      toast.success('已屏蔽此条微博', { id: toastId })
    } catch (error) {
      toast.error(`屏蔽失败：${error instanceof Error ? error.message : '未知原因'}`, {
        id: toastId,
      })
    }
  }

  const runShieldUser = async () => {
    if (!item) return
    setShieldUserLoading(true)
    const toastId = toast('正在屏蔽…')

    try {
      await shieldUser({
        uid: item.author.id,
        screenName: item.author.name,
        ...shieldRange,
      })
      setShieldUserOpen(false)
      toast.success(`已屏蔽 @${item.author.name}`, { id: toastId })
    } catch (error) {
      toast.error(`屏蔽失败：${error instanceof Error ? error.message : '未知原因'}`, {
        id: toastId,
      })
    } finally {
      setShieldUserLoading(false)
    }
  }

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn('size-8 shrink-0', className)}
            aria-label="更多操作"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
            }}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          onCloseAutoFocus={(event) => event.preventDefault()}
          onClick={(e) => e.stopPropagation()}
        >
          {showGenImage ? (
            <DropdownMenuItem
              onSelect={() => {
                setMenuOpen(false)
                openGenImage(item!)
              }}
            >
              <Image className="mr-2 size-4" />
              生图
            </DropdownMenuItem>
          ) : null}
          {showDownload && (
            <DropdownMenuItem
              onSelect={() => {
                setMenuOpen(false)
                void handleDownload()
              }}
              disabled={downloadLoading}
            >
              <Download className="mr-2 size-4" />
              批量下载
            </DropdownMenuItem>
          )}
          {showFavorite && (
            <DropdownMenuItem
              onSelect={() => {
                setMenuOpen(false)
                if (onFavorite) {
                  void (async () => {
                    setFavoriteLoading(true)
                    try {
                      await onFavorite()
                    } finally {
                      setFavoriteLoading(false)
                    }
                  })()
                }
              }}
              disabled={favoriteLoading}
            >
              <Bookmark className="mr-2 size-4" fill={favorited ? 'currentColor' : 'none'} />
              {favorited ? '取消收藏' : '收藏'}
            </DropdownMenuItem>
          )}
          {showCopyLink && (
            <DropdownMenuItem
              onSelect={() => {
                setMenuOpen(false)
                const url = `https://weibo.com/${item!.author.id}/${item!.mblogId}`
                void navigator.clipboard
                  .writeText(url)
                  .then(() => {
                    toast.success('已复制链接')
                  })
                  .catch(() => {
                    toast.error('复制失败，请稍后再试')
                  })
              }}
            >
              <Link className="mr-2 size-4" />
              复制链接
            </DropdownMenuItem>
          )}
          {showCopyText && (
            <DropdownMenuItem
              onSelect={() => {
                setMenuOpen(false)
                onCopyText?.()
              }}
            >
              <Copy className="mr-2 size-4" />
              复制内容
            </DropdownMenuItem>
          )}
          {showServerMenus ? (
            <>
              <DropdownMenuSeparator />
              {feedbackMenus.map((menu) => (
                <DropdownMenuItem
                  key={`${menu.type}-${menu.name}`}
                  disabled={feedbackLoading}
                  onSelect={() => void runFeedback(menu)}
                >
                  {menu.name}
                </DropdownMenuItem>
              ))}
              {hasShieldMenu ? (
                <>
                  <DropdownMenuItem
                    onSelect={() => {
                      setMenuOpen(false)
                      setShieldStatusOpen(true)
                    }}
                  >
                    屏蔽此条微博
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      setMenuOpen(false)
                      setShieldUserOpen(true)
                    }}
                  >
                    屏蔽该博主
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      setMenuOpen(false)
                      window.open(SHIELD_KEYWORD_URL, '_blank', 'noopener')
                    }}
                  >
                    屏蔽关键词
                  </DropdownMenuItem>
                </>
              ) : null}
              {hasReportMenu && item?.mblogId ? (
                <DropdownMenuItem
                  onSelect={() => {
                    setMenuOpen(false)
                    window.open(reportUrl(item.mblogId!), '_blank', 'noopener')
                  }}
                >
                  投诉
                </DropdownMenuItem>
              ) : null}
            </>
          ) : null}
          {isOwner && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => {
                  setMenuOpen(false)
                  setConfirmOpen(true)
                }}
              >
                <Trash className="mr-2 size-4" />
                删除
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>删除{contentLabel}？</DialogTitle>
            <DialogDescription>删除后无法恢复，微博原站也会同步删除。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              保留{contentLabel}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isDeleting}
              onClick={() => {
                void (async () => {
                  try {
                    await onDelete?.()
                    setConfirmOpen(false)
                  } catch {
                    // Caller shows toast
                  }
                })()
              }}
            >
              {isDeleting ? '删除中…' : `删除${contentLabel}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={shieldStatusOpen} onOpenChange={setShieldStatusOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>确定屏蔽这条微博吗？</DialogTitle>
            <DialogDescription>在「我的首页」将自动屏蔽这条微博。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShieldStatusOpen(false)}>
              取消
            </Button>
            <Button type="button" onClick={() => void runShieldStatus()}>
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={shieldUserOpen} onOpenChange={setShieldUserOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>屏蔽用户</DialogTitle>
            <DialogDescription>
              设置对 @{item?.author.name} 的屏蔽范围，全选即为拉黑用户。
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            {(
              [
                ['status', '不看他的微博'],
                ['interact', '禁止他与我互动'],
                ['follow', '禁止他关注我'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={shieldRange[key]}
                  onChange={(event) =>
                    setShieldRange((prev) => ({ ...prev, [key]: event.target.checked }))
                  }
                />
                {label}
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShieldUserOpen(false)}>
              取消
            </Button>
            <Button type="button" disabled={shieldUserLoading} onClick={() => void runShieldUser()}>
              {shieldUserLoading ? '屏蔽中…' : '确定'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {downloadDialog}
    </>
  )
}
