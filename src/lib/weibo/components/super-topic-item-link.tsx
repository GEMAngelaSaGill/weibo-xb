import { Link } from 'react-router'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import type { SuperTopicItem } from '@/lib/weibo/models/super-topic'

/** 微博站内的超话链接转成站内路径，交给 xb 自己渲染；其它链接保持外链。 */
export function toInAppSuperTopicPath(link: string): string | null {
  try {
    const url = new URL(link)
    const isWeiboHost = url.hostname === 'weibo.com' || url.hostname === 'www.weibo.com'
    if (isWeiboHost && url.pathname.startsWith('/p/')) {
      return `${url.pathname}${url.search}`
    }
  } catch {
    // 不是绝对 URL，按外链处理。
  }

  return null
}

interface SuperTopicItemLinkProps {
  item: SuperTopicItem
  className?: string
}

export function SuperTopicItemLink({ item, className }: SuperTopicItemLinkProps) {
  const fallback = item.title.trim().slice(0, 1) || '#'
  const rowClassName = cn(
    'group hover:bg-accent/80 focus-visible:bg-accent/80 focus-visible:ring-ring/50 flex min-w-0 items-center gap-2 rounded-lg px-2 py-2 transition-colors focus-visible:ring-2 focus-visible:outline-none',
    className,
  )
  const content = (
    <>
      <Avatar size="sm" className="size-8">
        <AvatarImage src={item.pic} alt={item.title} />
        <AvatarFallback>{fallback}</AvatarFallback>
      </Avatar>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-foreground truncate text-sm leading-tight font-medium">
          {item.title}
        </span>
        <span className="text-muted-foreground truncate text-xs leading-tight">
          {item.fansText || item.intro || '超话'}
        </span>
      </span>
    </>
  )

  const inAppPath = item.link ? toInAppSuperTopicPath(item.link) : null

  if (inAppPath) {
    return (
      <Link to={inAppPath} className={rowClassName} title={item.title}>
        {content}
      </Link>
    )
  }

  if (!item.link) {
    return (
      <div className={rowClassName} title={item.title}>
        {content}
      </div>
    )
  }

  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      className={rowClassName}
      title={item.title}
    >
      {content}
    </a>
  )
}
