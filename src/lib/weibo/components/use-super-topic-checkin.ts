import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import {
  appendCheckinLog,
  localDateString,
  saveAutoCheckinState,
} from '@/lib/weibo/checkin/checkin-log'
import { runSuperTopicCheckin } from '@/lib/weibo/checkin/checkin-runner'

export interface SuperTopicCheckinState {
  signing: boolean
  /** 一键签到所有关注的超话，提示语全程复用同一条 toast。 */
  signAll: () => Promise<void>
}

export function useSuperTopicCheckin(onFinished?: () => void): SuperTopicCheckinState {
  const [signing, setSigning] = useState(false)

  const signAll = useCallback(async () => {
    if (signing) return
    setSigning(true)

    const toastId = toast('正在读取超话列表…')

    try {
      const summary = await runSuperTopicCheckin((progress) => {
        toast(`正在签到（${progress.done + 1}/${progress.total}）${progress.title}`, {
          id: toastId,
        })
      })

      await appendCheckinLog({ at: Date.now(), trigger: 'manual', ...summary })

      // 手动签完也要写「今天已签」的标记，否则下次打开微博还会自动再跑一轮
      // （10-15 那天就是手动签完之后 16:58 又跑了一次，白费一轮请求）。
      if (summary.total > 0) {
        await saveAutoCheckinState({
          date: localDateString(),
          startedAt: Date.now(),
          trigger: 'manual',
          status: 'done',
        })
      }

      if (summary.total === 0) {
        toast.warning('没有关注的超话', { id: toastId })
        return
      }

      const text = `签到完成：成功 ${summary.signed} 个，已签 ${summary.already} 个${
        summary.failed.length > 0 ? `，失败 ${summary.failed.length} 个` : ''
      }`

      if (summary.failed.length > 0) {
        toast.warning(
          `${text}｜${summary.failed.slice(0, 3).join('、')}${summary.failed.length > 3 ? ' …' : ''}`,
          { id: toastId },
        )
      } else {
        toast.success(text, { id: toastId })
      }

      onFinished?.()
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知原因'
      await appendCheckinLog({
        at: Date.now(),
        trigger: 'manual',
        total: 0,
        signed: 0,
        already: 0,
        failed: [],
        error: message,
      })
      toast.error(`签到失败：${message}`, { id: toastId })
    } finally {
      setSigning(false)
    }
  }, [onFinished, signing])

  return { signing, signAll }
}
