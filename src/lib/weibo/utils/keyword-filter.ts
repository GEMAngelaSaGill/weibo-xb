import type { FeedItem } from '@/lib/weibo/models/feed'

/**
 * 收集一条微博里参与关键词匹配的文本。
 *
 * 只取正文：转发微博连带原微博正文一起算（原微博才是被转的内容），
 * 但不匹配作者名——「屏蔽关键词」顾名思义是筛内容，把作者名也搭进去容易误伤。
 */
function blockedKeywordHaystack(item: FeedItem): string {
  const parts = [item.text]

  if (item.retweetedStatus?.text) {
    parts.push(item.retweetedStatus.text)
  }

  return parts.join('\n').toLowerCase()
}

/** 帖子正文里出现任一关键词就算命中；大小写不敏感，按子串匹配。 */
export function matchesBlockedKeywords(item: FeedItem, keywords: readonly string[]): boolean {
  if (keywords.length === 0) return false

  const haystack = blockedKeywordHaystack(item)

  return keywords.some((keyword) => {
    const needle = keyword.trim().toLowerCase()
    return needle !== '' && haystack.includes(needle)
  })
}

/** 过滤掉命中屏蔽关键词的帖子；没有配置关键词时原样返回。 */
export function filterBlockedStatuses(
  items: readonly FeedItem[],
  keywords: readonly string[],
): FeedItem[] {
  if (keywords.length === 0) return [...items]

  return items.filter((item) => !matchesBlockedKeywords(item, keywords))
}
