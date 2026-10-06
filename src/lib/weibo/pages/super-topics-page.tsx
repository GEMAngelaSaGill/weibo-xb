import { useQuery } from '@tanstack/react-query'
import { CalendarCheck, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { CardDescription } from '@/components/ui/card'
import { RefreshCWIcon } from '@/components/ui/refresh-cw'
import { Spinner } from '@/components/ui/spinner'
import { useImmersiveHeaderClassName } from '@/lib/weibo/app/immersive-header'
import { SuperTopicItemLink } from '@/lib/weibo/components/super-topic-item-link'
import { useSuperTopicCheckin } from '@/lib/weibo/components/use-super-topic-checkin'
import { followedSuperTopicsQueryOptions } from '@/lib/weibo/data/weibo-data'

export function SuperTopicsPage() {
  const headerClassName = useImmersiveHeaderClassName('bg-muted/80 sticky top-0 z-10 backdrop-blur')
  const superTopicsQuery = useQuery(followedSuperTopicsQueryOptions)

  const items = superTopicsQuery.data?.items ?? []
  const title = superTopicsQuery.data?.name ?? '我关注的超话'

  const { signing, signAll } = useSuperTopicCheckin(() => {
    void superTopicsQuery.refetch()
  })

  return (
    <div className="flex flex-col gap-3">
      <div className={headerClassName}>
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg leading-tight font-semibold">{title}</h2>
            {items.length > 0 ? (
              <p className="text-muted-foreground mt-0.5 text-xs leading-tight">
                {items.length} 个
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="secondary"
              size="sm"
              aria-label="一键签到"
              title="一键签到全部超话"
              onClick={() => void signAll()}
              disabled={signing || superTopicsQuery.isFetching}
            >
              {signing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CalendarCheck className="size-4" />
              )}
              一键签到
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="刷新超话"
              title="刷新超话"
              onClick={() => superTopicsQuery.refetch()}
              disabled={superTopicsQuery.isFetching}
            >
              <RefreshCWIcon className={superTopicsQuery.isFetching ? 'animate-spin' : undefined} />
            </Button>
          </div>
        </div>
      </div>

      {superTopicsQuery.isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size="sm" />
        </div>
      ) : superTopicsQuery.isError ? (
        <CardDescription className="px-4">
          超话加载失败，
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() => void superTopicsQuery.refetch()}
          >
            重试
          </button>
        </CardDescription>
      ) : items.length === 0 ? (
        <CardDescription className="px-4">暂无关注的超话</CardDescription>
      ) : (
        <div className="flex flex-col px-2">
          {items.map((item) => (
            <SuperTopicItemLink key={item.oid || item.link || item.title} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}
