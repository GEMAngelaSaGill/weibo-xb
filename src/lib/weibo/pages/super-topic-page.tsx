import { useInfiniteQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useAppSettings } from '@/lib/app-settings-store'
import { useImmersiveHeaderClassName } from '@/lib/weibo/app/immersive-header'
import { ChannelBar, type ChannelBarItem } from '@/lib/weibo/components/channel-bar'
import { InfiniteFeedList } from '@/lib/weibo/components/infinite-feed-list'
import { superTopicFlowInfiniteOptions } from '@/lib/weibo/data/weibo-data'
import type { SuperTopicFlowPage, SuperTopicHeader } from '@/lib/weibo/models/super-topic'
import { useWeiboPage } from '@/lib/weibo/route/use-weibo-page'

function SuperTopicHead({ header }: { header: SuperTopicHeader }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Avatar className="size-12 shrink-0">
        <AvatarImage src={header.avatarUrl} alt={header.name} />
        <AvatarFallback>{header.name.slice(0, 1)}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 className="truncate text-lg leading-tight font-semibold">{header.name}</h2>
        {header.stats.length > 0 ? (
          <div className="text-muted-foreground flex gap-3 text-xs">
            {header.stats.map((stat) => (
              <span key={stat.label}>
                {stat.value} {stat.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function SuperTopicPage() {
  const page = useWeiboPage()
  const rewriteEnabled = useAppSettings((s) => s.rewriteEnabled)
  const headerClassName = useImmersiveHeaderClassName('bg-muted/80 sticky top-0 z-10 backdrop-blur')

  const superTopicId = page.kind === 'super-topic' ? page.superTopicId : ''
  const isEnabled = rewriteEnabled && page.kind === 'super-topic' && superTopicId !== ''

  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null)

  const flowQuery = useInfiniteQuery({
    ...superTopicFlowInfiniteOptions(superTopicId, selectedFlowId),
    enabled: isEnabled,
  })

  const pages = flowQuery.data?.pages as SuperTopicFlowPage[] | undefined

  // 分区和超话信息每页都会回传，取第一页即可。切换分区会换 query key，
  // 新查询没有缓存时 data 会短暂变空——所以留一份最后的非空值，
  // 否则分区栏会在手里闪一下消失，再等接口回来才重新长出来。
  const [meta, setMeta] = useState<{
    channels: SuperTopicFlowPage['channels']
    header: SuperTopicFlowPage['header']
  }>({ channels: [], header: null })

  useEffect(() => {
    const firstPage = pages?.[0]
    if (!firstPage) return

    setMeta({ channels: firstPage.channels, header: firstPage.header })
  }, [pages])

  const { channels, header } = meta

  const channelItems: ChannelBarItem[] = useMemo(
    () => channels.map((channel) => ({ id: channel.flowId, label: channel.title })),
    [channels],
  )
  // 未手动选过分区时，默认流就是第一个分区，直接把它显示为选中。
  const activeFlowId = selectedFlowId ?? channelItems[0]?.id ?? ''

  const handleChannelSelect = useCallback((flowId: string) => {
    setSelectedFlowId(flowId)
  }, [])

  const isInitialError = flowQuery.error instanceof Error && !flowQuery.isFetchNextPageError
  const isLoadMoreError = flowQuery.error instanceof Error && flowQuery.isFetchNextPageError
  const errorMessage = isInitialError ? '超话内容加载失败，请稍后重试。' : null
  const loadMoreErrorMessage = isLoadMoreError ? '微博暂时无法加载更多超话内容。' : null

  return (
    <div className="flex flex-col gap-3">
      <div className={headerClassName}>
        {header ? <SuperTopicHead header={header} /> : null}
        {channelItems.length > 0 ? (
          <ChannelBar
            items={channelItems}
            selectedId={activeFlowId}
            onSelect={handleChannelSelect}
          />
        ) : null}
      </div>

      <InfiniteFeedList
        pages={pages}
        emptyLabel="此超话暂无内容"
        loadingLabel="正在加载超话内容…"
        errorMessage={errorMessage}
        loadMoreErrorMessage={loadMoreErrorMessage}
        isLoading={flowQuery.isLoading}
        hasNextPage={Boolean(flowQuery.hasNextPage)}
        isFetchingNextPage={flowQuery.isFetchingNextPage}
        fetchNextPage={flowQuery.fetchNextPage}
        onRetry={() => void flowQuery.refetch()}
      />
    </div>
  )
}
