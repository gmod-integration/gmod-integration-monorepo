import { sentryVitePlugin } from "@sentry/vite-plugin";
import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig(({ mode }) => {
  const isDev = mode === "development" || process.env.VITE_DEV === "true";

  return {
    define: {
      __BUILD_DATE__: JSON.stringify(new Date().toLocaleString()),
    },
    server: {
      port: 3000,
      host: isDev ? true : false, // Allow all hosts in development
      allowedHosts: isDev ? true : ["gmod-integration.com", "dev.gmod-integration.com"],
      watch: {
        usePolling: true,
        useFsEvents: false,
        interval: 100,
      },
    },
    build: {
      target: "esnext",
      sourcemap: true,
    },
    plugins: [
      solidPlugin({
        dev: isDev, // Enable SolidJS debug features in development
      }),
      sentryVitePlugin({
        org: "gmod-integration",
        project: "javascript-solid",
      }),
    ],
  };
});
