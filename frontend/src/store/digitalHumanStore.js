import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

/**
 * 数字人状态机（全局，学生端所有页面共享）。
 *
 * caption   当前字幕（数字人正在"说"的内容）
 * speaking  是否在说话（驱动光形呼吸加速 / 唇形）
 * expression 神态：calm 平静 / alert 警示 / approve 赞许 / focus 专注
 * muted     是否静音（静音时只显示字幕不播语音）
 * liveConnected LiveTalking 实时画面是否已接入（未接入时显示光形占位）
 *
 * 各功能模块拿到结果后调用 speak()，让数字人"开口"，实现功能与数字人的联动。
 * muted 持久化到 localStorage，用户刷新后仍保持静音偏好。
 */
let clearTimer = null

export const useDigitalHumanStore = create(
  persist(
    (set, get) => ({
      caption: '',
      speaking: false,
      expression: 'calm',
      muted: false,
      liveConnected: false,

      /** 让数字人说一句话；ms 兜底自动收声（实际由前端 TTS onend 控制） */
      speak: (text, { expression = 'calm', ms = 5200 } = {}) => {
        if (!text) return
        if (clearTimer) clearTimeout(clearTimer)
        set({ caption: text, speaking: true, expression })
        // 兜底：万一 TTS 失败/浏览器没声，ms+3000 后强制收声
        clearTimer = setTimeout(() => set({ speaking: false, caption: '' }), ms + 3000)
      },

      /** 立即收声（切换模块时用） */
      hush: () => {
        if (clearTimer) clearTimeout(clearTimer)
        set({ caption: '', speaking: false })
      },

      /** 切换静音（返回切换后的状态） */
      toggleMuted: () => {
        const next = !get().muted
        set({ muted: next })
        // 切静音时立刻停掉当前播放
        if (next) {
          if (clearTimer) clearTimeout(clearTimer)
          if (typeof window !== 'undefined' && window.speechSynthesis) {
            try { window.speechSynthesis.cancel() } catch {}
          }
        }
        return next
      },

      setMuted: (muted) => set({ muted }),
      setExpression: (expression) => set({ expression }),
      setLiveConnected: (liveConnected) => set({ liveConnected }),
      setSpeaking: (speaking) => set({ speaking }),
    }),
    {
      name: 'dh-store',
      storage: createJSONStorage(() => localStorage),
      // 只持久化 muted，其他状态（caption/speaking/expression）刷新后不应残留
      partialize: (state) => ({ muted: state.muted }),
    }
  )
)

export default useDigitalHumanStore
