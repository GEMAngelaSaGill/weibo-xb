import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import { loadAllFollowedSuperTopics, signSuperTopic } from '@/lib/weibo/data/weibo-data'
import type { SuperTopicCheckinOutcome } from '@/lib/weibo/models/super-topic'

/** 逐个之间留点间隔，连打太快容易被风控。 */
const CHECKIN_INTERVAL_MS = 400

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface SuperTopicCheckinState {
  signing: boolean
  /** 一键签到所有关注的超话，逐个串行，提示语全程复用同一条 toast。 */
  signAll: () => Promise<void>
}

export function useSuperTopicCheckin(onFinished?: () => void): SuperTopicCheckinState {
  const [signing, setSigning] = useState(false)

  const signAll = useCallback(async () => {
    if (signing) return
    setSigning(true)

    const toastId = toast('正在读取超话列表…')

    try {
      const topics = await loadAllFollowedSuperTopics()

      if (topics.length === 0) {
        toast.warning('没有关注的超话', { id: toastId })
        return
      }

      let signed = 0
      let already = 0
      const failed: string[] = []

      for (const [index, topic] of topics.entries()) {
        toast(`正在签到（${index + 1}/${topics.length}）${topic.title}`, { id: toastId })

        try {
          const outcome: SuperTopicCheckinOutcome = await signSuperTopic(topic.chaohuaId)
          if (outcome.status === 'signed') signed++
          else if (outcome.status === 'already') already++
          else failed.push(`${topic.title}（${outcome.message}）`)
        } catch (error) {
          failed.push(`${topic.title}（${error instanceof Error ? error.message : '请求失败'}）`)
        }

        if (index < topics.length - 1) await sleep(CHECKIN_INTERVAL_MS)
      }

      const summary = `签到完成：成功 ${signed} 个，已签 ${already} 个${
        failed.length > 0 ? `，失败 ${failed.length} 个` : ''
      }`

      if (failed.length > 0) {
        toast.warning(
          `${summary}｜${failed.slice(0, 3).join('、')}${failed.length > 3 ? ' …' : ''}`,
          { id: toastId },
        )
      } else {
        toast.success(summary, { id: toastId })
      }

      onFinished?.()
    } catch (error) {
      toast.error(`签到失败：${error instanceof Error ? error.message : '未知原因'}`, {
        id: toastId,
      })
    } finally {
      setSigning(false)
    }
  }, [onFinished, signing])

  return { signing, signAll }
}
