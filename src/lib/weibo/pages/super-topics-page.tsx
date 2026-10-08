import { useQuery } from '@tanstack/react-query'
import { CalendarCheck, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { CardDescription } from '@/components/ui/card'
import { RefreshCWIcon } from '@/components/ui/refresh-cw'
import { Spinner } from '@/components/ui/spinner'
import { useImmersiveHeaderClassName } from '@/lib/weibo/app/immersive-header'
import {
  clearCheckinLog,
  describeCheckinTrigger,
  loadCheckinLog,
  localDateString,
  type CheckinLogEntry,
} from '@/lib/weibo/checkin/checkin-log'
import { SuperTopicItemLink } from '@/lib/weibo/components/super-topic-item-link'
import { useSuperTopicCheckin } from '@/lib/weibo/components/use-super-topic-checkin'
import { followedSuperTopicsQueryOptions } from '@/lib/weibo/data/weibo-data'

function formatLogTime(at: number): string {
  const date = new Date(at)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function describeLogEntry(entry: CheckinLogEntry): string {
  if (entry.error) return `失败：${entry.error}`
  const parts = [`成功 ${entry.signed}`, `已签 ${entry.already}`]
  if (entry.failed.length > 0) parts.push(`失败 ${entry.failed.length}`)
  return parts.join('，')
}

export function SuperTopicsPage() {
  const headerClassName = useImmersiveHeaderClassName('bg-muted/80 sticky top-0 z-10 backdrop-blur')
  const superTopicsQuery = useQuery(followedSuperTopicsQueryOptions)

  const items = superTopicsQuery.data?.items ?? []
  const title = superTopicsQuery.data?.name ?? '我关注的超话'

  const [log, setLog] = useState<CheckinLogEntry[]>([])
  const reloadLog = useCallback(() => {
    void loadCheckinLog().then(setLog)
  }, [])

  useEffect(() => {
    reloadLog()
  }, [reloadLog])

  const { signing, signAll } = useSuperTopicCheckin(() => {
    void superTopicsQuery.refetch()
    reloadLog()
  })

  // 今天已签的超话名，用来在列表里打勾。取最近一条今天的记录即可——
  // 一天只会跑一次，后面再跑的（手动补签）会覆盖成更全的结果。
  const todayDone = useMemo(() => {
    const today = localDateString()
    const entry = log.find((item) => localDateString(new Date(item.at)) === today)
    return new Set(entry?.doneTitles ?? [])
  }, [log])

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
            <SuperTopicItemLink
              key={item.oid || item.link || item.title}
              item={item}
              checked={todayDone.has(item.title)}
            />
          ))}
        </div>
      )}

      {log.length > 0 ? (
        <details className="border-border/40 mx-2 rounded-lg border">
          <summary className="text-muted-foreground cursor-pointer px-3 py-2 text-xs">
            签到记录（最近 {log.length} 次）
          </summary>
          <div className="flex flex-col gap-1.5 px-3 pb-3">
            {log.slice(0, 20).map((entry) => (
              <div key={entry.at} className="flex items-baseline gap-2 text-xs">
                <span className="text-muted-foreground tabular-nums">
                  {formatLogTime(entry.at)}
                </span>
                <span className="text-muted-foreground shrink-0">
                  {describeCheckinTrigger(entry.trigger)}
                </span>
                <span className={entry.error || entry.failed.length > 0 ? 'text-destructive' : ''}>
                  {describeLogEntry(entry)}
                </span>
              </div>
            ))}
            <button
              type="button"
              className="text-muted-foreground self-start text-xs underline underline-offset-2"
              onClick={() => {
                void clearCheckinLog().then(reloadLog)
              }}
            >
              清空记录
            </button>
          </div>
        </details>
      ) : null}
    </div>
  )
}
