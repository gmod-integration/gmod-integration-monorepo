import type { Component } from 'solid-js'
import { useI18n } from '../../i18n.js'
import LegalDocument from './LegalDocument.js'
import { privacyContent } from './privacyContent.js'

const Privacy: Component = () => {
  const { locale } = useI18n()
  const language = () => (locale() === 'fr' ? 'fr' : 'en')

  return <LegalDocument document={privacyContent[language()]} language={language()} />
}

export default Privacy
