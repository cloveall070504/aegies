import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { playSpeech, stopSpeech } from '../utils/speechController'

/**
 * 数字人状态机（全局，学生端所有页面共享）。
 *
 * caption     当前字幕（数字人正在"说"的内容）
 * speaking    是否在说话（驱动光形呼吸加速 / 唇形）
 * expression  神态：calm 平静 / alert 警示 / approve 赞许 / focus 专注 ...
 * muted       是否静音（静音时只显示字幕不播语音）
 * liveConnected 预留：LiveTalking 实时画面（当前未接入，数字人以 SVG 光形 + TTS 呈现）
 *
 * 语音统一由 speechController 单路播放（store 只负责状态与字幕），
 * 避免多组件各自订阅 caption 造成"唱双簧"重复朗读。
 */
export const useDigitalHumanStore = create(
  persist(
    (set, get) => ({
      caption: '',
      speaking: false,
      expression: 'calm',
      muted: false,
      liveConnected: false,

      /** 让数字人说一句话：设置字幕/神态并触发单路 TTS 播放 */
      speak: (text, { expression = 'calm' } = {}) => {
        if (!text) return
        set({ caption: text, speaking: true, expression })
        playSpeech(text, expression)
      },

      /** 立即收声（切换模块 / 用户打断时用） */
      hush: () => {
        stopSpeech()
        set({ caption: '', speaking: false })
      },

      /** 切换静音（返回切换后的状态） */
      toggleMuted: () => {
        const next = !get().muted
        set({ muted: next })
        // 切到静音时立刻停掉当前播放
        if (next) {
          stopSpeech()
          if (typeof window !== 'undefined' && window.speechSynthesis) {
            try { window.speechSynthesis.cancel() } catch (_) {}
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
