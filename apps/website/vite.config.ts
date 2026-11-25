import { defineConfig, type UserConfig } from 'vite'
import solidPlugin from 'vite-plugin-solid'
import { ConfigWebsite } from '@gmod/config/website-runtime.js'

export default defineConfig(() => {
  const websiteConfig = {
    dev: ConfigWebsite.dev,
    devShowMissingTranslations: ConfigWebsite.devShowMissingTranslations,
    apiUrl: ConfigWebsite.apiUrl,
    wsUrl: ConfigWebsite.wsUrl,
    discordClientId: ConfigWebsite.discordClientId,
    websiteUrl: ConfigWebsite.websiteUrl,
  }
  const isDev = websiteConfig.dev

  return {
    define: {
      __BUILD_DATE__: JSON.stringify(new Date().toLocaleString()),
      __GMI_WEBSITE_CONFIG__: JSON.stringify(websiteConfig),
    },
    server: {
      port: Number(new URL(websiteConfig.websiteUrl).port) || 3000,
      strictPort: true,
      host: isDev ? '0.0.0.0' : '127.0.0.1',
      allowedHosts: isDev ? true : ['gmod-integration.com', 'dev.gmod-integration.com'],
      watch: {
        usePolling: true,
        useFsEvents: false,
        interval: 100,
      },
    },
    build: {
      target: 'esnext',
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            if (id.includes('/src/locales/') && id.endsWith('.json')) return 'locales'
            if (id.includes('/node_modules/lucide-solid/')) return 'lucide-icons'
            if (id.includes('/node_modules/zod/')) return 'validation'
            if (id.includes('/node_modules/solid-js/') || id.includes('/node_modules/@solidjs/router/'))
              return 'solid-runtime'
          },
        },
      },
    },
    plugins: [
      solidPlugin({
        dev: isDev, // Enable SolidJS debug features in development
      }),
    ],
  } satisfies UserConfig
})
