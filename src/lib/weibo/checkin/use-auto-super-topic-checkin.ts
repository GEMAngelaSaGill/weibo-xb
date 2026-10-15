import { useEffect, useRef } from 'react'
import { toast } from 'sonner'

import { appendCheckinLog, type CheckinTrigger } from '@/lib/weibo/checkin/checkin-log'
import { runSuperTopicCheckin } from '@/lib/weibo/checkin/checkin-runner'

/** 保底唤醒时后台会用这个查询参数打开一个临时标签页，签完自己关掉。 */
const FALLBACK_TAB_PARAM = 'xb_checkin'

/** 一次都没跑过就发请求；跑的时候也不再重复触发。 */
let checkinInFlight = false

/** 自动签到的提示明确几秒后自己消失，不留下来等用户手动关。 */
const AUTO_TOAST_DURATION = 5000

async function executeCheckin(trigger: CheckinTrigger, closeTabWhenDone: boolean): Promise<void> {
  if (checkinInFlight) return
  checkinInFlight = true

  // 起止都提示，方便确认「到底触发没有、结果如何」；不带按钮，到点自己消失。
  const toastId = toast('开始自动签到超话…', { duration: AUTO_TOAST_DURATION })

  try {
    const summary = await runSuperTopicCheckin()
    await appendCheckinLog({ at: Date.now(), trigger, ...summary })

    const text = `自动签到完成：成功 ${summary.signed} 个，已签 ${summary.already} 个${
      summary.failed.length > 0 ? `，失败 ${summary.failed.length} 个` : ''
    }`

    if (summary.failed.length > 0) {
      toast.warning(`${text}｜${summary.failed.slice(0, 2).join('、')}`, {
        id: toastId,
        duration: AUTO_TOAST_DURATION,
      })
    } else {
      toast.success(text, { id: toastId, duration: AUTO_TOAST_DURATION })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '自动签到失败'
    await appendCheckinLog({
      at: Date.now(),
      trigger,
      total: 0,
      signed: 0,
      already: 0,
      failed: [],
      error: message,
    })
    toast.error(`自动签到失败：${message}`, { id: toastId, duration: AUTO_TOAST_DURATION })
  } finally {
    checkinInFlight = false
    if (closeTabWhenDone) window.close()
  }
}

/**
 * 拿不到后台许可时记一条日志。
 *
 * 这个调用以前是被 catch 静静吞掉的——结果某天自动签到没跑，日志里一片空白，
 * 只能翻存储文件才查出「请求根本没送到」。失败必须留痕。
 */
async function logClaimFailure(trigger: CheckinTrigger, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error)

  await appendCheckinLog({
    at: Date.now(),
    trigger,
    total: 0,
    signed: 0,
    already: 0,
    failed: [],
    error: `申请自动签到失败：${message}`,
  })
}

/**
 * 打开微博时尝试自动签到一次。
 *
 * 是否真的跑由后台决定（后台持有当天的日期标记和串行锁），这里只负责问一句、跑完上报。
 * 点击「一键签到」的手动路径不走这里，见 `useSuperTopicCheckin`。
 */
export function useAutoSuperTopicCheckin(): void {
  const startedRef = useRef(false)

  useEffect(() => {
    // 自动签只是锦上添花，拿不到扩展 API 时安静退出，别把页面渲染带崩。
    const runtime = browser?.runtime
    if (!runtime?.sendMessage || !runtime?.onMessage) return

    // 保底唤醒：后台开的临时标签页，签完要自己关掉。
    const isFallbackTab =
      new URLSearchParams(window.location.search).get(FALLBACK_TAB_PARAM) === 'auto'

    if (!startedRef.current) {
      startedRef.current = true

      void (async () => {
        const trigger: CheckinTrigger = isFallbackTab ? 'auto-fallback' : 'auto-open'

        let granted = false

        try {
          const claim = (await runtime.sendMessage({ type: 'checkin-claim', trigger })) as
            | { granted?: boolean }
            | undefined

          if (claim === undefined) {
            // 后台没回结果。以前这里是静默返回的，出了问题日志里什么都看不到。
            await logClaimFailure(trigger, new Error('后台没有返回结果'))
          } else {
            granted = claim.granted === true
          }
        } catch (error) {
          await logClaimFailure(trigger, error)
        }

        if (!granted) {
          // 要么今天已经跑过（正常），要么上面记了失败；保底标签页都没必要留着。
          if (isFallbackTab) window.close()
          return
        }

        await executeCheckin(trigger, isFallbackTab)
      })()
    }

    // 后台复用了已打开的标签页时会推这条消息过来；此时后台已经领过标记了，直接跑。
    const listener = (message: unknown) => {
      if ((message as { type?: string } | undefined)?.type !== 'checkin-run') return
      void executeCheckin('auto-fallback', false)
    }

    runtime.onMessage.addListener(listener)

    return () => {
      runtime.onMessage.removeListener(listener)
    }
  }, [])
}
