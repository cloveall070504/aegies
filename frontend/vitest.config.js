import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// 前端测试配置：默认 node 环境（DOM-free 单元测试），如需组件测试改 jsdom。
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    // 关闭结果缓存，避免在某些 Windows 环境下向 node_modules/.vite 写 results.json 被权限拦截（EPERM）。
    cache: false,
    setupFiles: ['./vitest.setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{js,jsx}'],
    },
  },
})
