import { sentryVitePlugin } from '@sentry/vite-plugin'
import { defineConfig } from 'vite'
import solidPlugin from 'vite-plugin-solid'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { ConfigWebsite } from '@gmod/config/website.js'

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
      port: 3000,
      host: isDev ? true : false, // Allow all hosts in development
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
    },
    plugins: [
      solidPlugin({
        dev: isDev, // Enable SolidJS debug features in development
      }),
      sentryVitePlugin({
        org: 'gmod-integration',
        project: 'javascript-solid',
      }),
    ],
  }
})
