import type { Component } from 'solid-js'
import { useI18n } from '../../i18n.js'
import LegalDocument from './LegalDocument.js'
import { termsContent } from './termsContent.js'

const Terms: Component = () => {
  const { locale } = useI18n()
  const language = () => (locale() === 'fr' ? 'fr' : 'en')

  return <LegalDocument document={termsContent[language()]} language={language()} />
}

export default Terms
