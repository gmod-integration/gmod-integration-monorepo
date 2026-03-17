type WebsiteRuntimeConfig = {
  dev: boolean
  devShowMissingTranslations: boolean
  apiUrl: string
  wsUrl: string
  discordClientId: string
  websiteUrl: string
}

export const WEBSITE_CONFIG = __GMI_WEBSITE_CONFIG__ as WebsiteRuntimeConfig
