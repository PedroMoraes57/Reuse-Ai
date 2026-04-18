import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendUrl = env.VITE_BACKEND_URL || 'http://127.0.0.1:8001'
  const tunnelUrl = (env.VITE_TUNNEL_URL || '').replace(/\/$/, '')
  const tunnelHost = tunnelUrl ? new URL(tunnelUrl).host : ''

  const proxyHeaders: Record<string, string> = tunnelHost
    ? {
        'X-Forwarded-Host': tunnelHost,
        'X-Forwarded-Proto': new URL(tunnelUrl).protocol.replace(':', ''),
      }
    : {}

  return {
    plugins: [react()],
    server: {
      allowedHosts: tunnelHost ? [tunnelHost] : [],
      proxy: {
        '/api': {
          target: backendUrl,
          changeOrigin: true,
          headers: proxyHeaders,
        },
        '/media': {
          target: backendUrl,
          changeOrigin: true,
          headers: proxyHeaders,
        },
      },
    },
  }
})