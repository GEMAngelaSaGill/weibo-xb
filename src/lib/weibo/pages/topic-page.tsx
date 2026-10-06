import { useInfiniteQuery } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'

import { useAppSettings } from '@/lib/app-settings-store'
import { useImmersiveHeaderClassName } from '@/lib/weibo/app/immersive-header'
import { ChannelBar } from '@/lib/weibo/components/channel-bar'
import { InfiniteFeedList } from '@/lib/weibo/components/infinite-feed-list'
import { MweiboTopicRecoveryPrompt } from '@/lib/weibo/components/mweibo-topic-recovery-prompt'
import {
  extractTopicChannels,
  extractTopicHeadData,
  getMweiboTopicRecoveryState,
  topicSearchInfiniteOptions,
} from '@/lib/weibo/data/weibo-data'
import type { TimelinePage } from '@/lib/weibo/models/feed'
import { useWeiboPage } from '@/lib/weibo/route/use-weibo-page'

export function TopicPage() {
  const page = useWeiboPage()
  const rewriteEnabled = useAppSettings((s) => s.rewriteEnabled)
  const headerClassName = useImmersiveHeaderClassName('bg-muted/80 sticky top-0 z-10 backdrop-blur')

  const topic = page.kind === 'topic' ? page.topic : ''
  const isEnabled = rewriteEnabled && page.kind === 'topic' && topic !== ''

  const [selectedChannelId, setSelectedChannelId] = useState<string>('1')

  const topicQuery = useInfiniteQuery({
    ...topicSearchInfiniteOptions(topic, selectedChannelId),
    enabled: isEnabled,
  })

  const channels = useMemo(
    () => extractTopicChannels(topicQuery.data?.pages as TimelinePage[] | undefined),
    [topicQuery.data?.pages],
  )

  const headData = useMemo(
    () => extractTopicHeadData(topicQuery.data?.pages as TimelinePage[] | undefined),
    [topicQuery.data?.pages],
  )

  const handleChannelSelect = useCallback((id: string) => {
    setSelectedChannelId(id)
  }, [])

  const isInitialError = topicQuery.error instanceof Error && !topicQuery.isFetchNextPageError
  const isLoadMoreError = topicQuery.error instanceof Error && topicQuery.isFetchNextPageError
  const errorMessage = isInitialError ? '话题内容加载失败，请稍后重试。' : null
  const loadMoreErrorMessage = isLoadMoreError ? '微博暂时无法加载更多话题内容。' : null
  const hasNextPage = Boolean(topicQuery.hasNextPage)
  const isFetchingNextPage = topicQuery.isFetchingNextPage
  const isLoading = topicQuery.isLoading

  const recovery = isInitialError ? getMweiboTopicRecoveryState(topicQuery.error) : null

  if (recovery) {
    return (
      <div className="flex flex-col gap-3">
        <MweiboTopicRecoveryPrompt recovery={recovery} onRetry={() => void topicQuery.refetch()} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className={headerClassName}>
        <div className="gap-0.5 px-4 py-3">
          <h2 className="text-lg font-semibold">#{topic}#</h2>
          {headData ? (
            <div className="text-muted-foreground flex gap-2 text-xs">
              {headData.midtext ? (
                <span>{headData.midtext.replace(/\s+详情\s*>/g, '')}</span>
              ) : null}
              {headData.downtext ? <span>{headData.downtext}</span> : null}
            </div>
          ) : null}
        </div>
        {channels.length > 0 ? (
          <ChannelBar
            items={channels.map((ch) => ({ id: ch.id, label: ch.name }))}
            selectedId={selectedChannelId}
            onSelect={handleChannelSelect}
          />
        ) : null}
      </div>

      <InfiniteFeedList
        pages={topicQuery.data?.pages as TimelinePage[] | undefined}
        emptyLabel="暂无话题内容"
        loadingLabel="正在加载话题内容…"
        errorMessage={errorMessage}
        loadMoreErrorMessage={loadMoreErrorMessage}
        isLoading={isLoading}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        fetchNextPage={topicQuery.fetchNextPage}
        onRetry={() => void topicQuery.refetch()}
      />
    </div>
  )
}
