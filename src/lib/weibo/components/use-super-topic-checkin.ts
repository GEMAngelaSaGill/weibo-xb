import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import { appendCheckinLog } from '@/lib/weibo/checkin/checkin-log'
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
