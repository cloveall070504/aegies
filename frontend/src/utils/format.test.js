import { describe, it, expect } from 'vitest'
import { clampScore, formatTime } from '../utils/format'

describe('clampScore', () => {
  it('将分数限制在 [0,100]', () => {
    expect(clampScore(120)).toBe(100)
    expect(clampScore(-5)).toBe(0)
    expect(clampScore(73.4)).toBe(73.4)
  })
  it('非法输入按 0 处理', () => {
    expect(clampScore('abc')).toBe(0)
    expect(clampScore(undefined)).toBe(0)
    expect(clampScore(null)).toBe(0)
  })
})

describe('formatTime', () => {
  it('空值返回 -', () => {
    expect(formatTime('')).toBe('-')
    expect(formatTime(null)).toBe('-')
  })
  it('能格式化 ISO 时间且非占位符', () => {
    const out = formatTime('2026-01-01T08:00:00Z')
    expect(typeof out).toBe('string')
    expect(out).not.toBe('-')
  })
})
