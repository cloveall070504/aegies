import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': {
        // 默认指向本地后端（显式 IPv4，避免 localhost 解析到 IPv6 导致代理 500）。
        // 仍可用环境变量 VITE_API_TARGET 覆盖（如后端不在 8001）。
        target: process.env.VITE_API_TARGET || 'http://127.0.0.1:8001',
        changeOrigin: true,
      },
    },
  },
})
