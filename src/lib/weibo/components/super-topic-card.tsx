import { useQuery } from '@tanstack/react-query'
import { CalendarCheck, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardDescription } from '@/components/ui/card'
import { RefreshCWIcon } from '@/components/ui/refresh-cw'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { SuperTopicItemLink } from '@/lib/weibo/components/super-topic-item-link'
import { useSuperTopicCheckin } from '@/lib/weibo/components/use-super-topic-checkin'
import { followedSuperTopicsQueryOptions } from '@/lib/weibo/data/weibo-data'

interface SuperTopicCardProps {
  className?: string
}

export function SuperTopicCard({ className }: SuperTopicCardProps) {
  const superTopicsQuery = useQuery(followedSuperTopicsQueryOptions)

  const items = superTopicsQuery.data?.items ?? []
  const title = superTopicsQuery.data?.name ?? '我关注的超话'

  const { signing, signAll } = useSuperTopicCheckin(() => {
    void superTopicsQuery.refetch()
  })

  return (
    <Card className={className}>
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="min-w-0">
          <h2 className="truncate text-sm leading-tight font-semibold">{title}</h2>
          {items.length > 0 && (
            <p className="text-muted-foreground mt-0.5 text-xs leading-tight">{items.length} 个</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => void signAll()}
            disabled={signing || superTopicsQuery.isFetching}
            title="一键签到全部超话"
            aria-label="一键签到"
          >
            {signing ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <CalendarCheck className="size-3" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => superTopicsQuery.refetch()}
            disabled={superTopicsQuery.isFetching}
            title="刷新超话"
            aria-label="刷新超话"
          >
            <RefreshCWIcon className={cn(superTopicsQuery.isFetching && 'animate-spin')} />
          </Button>
        </div>
      </div>
      {superTopicsQuery.isLoading ? (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      ) : superTopicsQuery.isError ? (
        <CardDescription className="px-2 pb-2">超话加载失败</CardDescription>
      ) : items.length === 0 ? (
        <CardDescription className="px-2 pb-2">暂无关注的超话</CardDescription>
      ) : (
        <div className="max-h-[180px] w-full scrollbar-none overflow-x-hidden overflow-y-auto">
          {items.map((item) => (
            <SuperTopicItemLink key={item.oid || item.link || item.title} item={item} />
          ))}
        </div>
      )}
    </Card>
  )
}
