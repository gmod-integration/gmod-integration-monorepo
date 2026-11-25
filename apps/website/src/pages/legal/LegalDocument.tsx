import { For, Show, type Component } from 'solid-js'
import { Icon } from '../../components/ui/index.js'
import { useI18n } from '../../i18n.js'

export type LegalDocumentContent = {
  title: string
  updatedLabel: string
  updatedDate: string
  updatedISO?: string
  sections: {
    title: string
    paragraphs: string[]
    links?: { label: string; href: string }[]
    table?: { caption: string; headers: string[]; rows: string[][] }
  }[]
}

const LegalDocument: Component<{ document: LegalDocumentContent; language: 'en' | 'fr' }> = (props) => {
  const { t, locale } = useI18n()
  return (
    <article lang={props.language} class="public-page legal-document">
      <header class="public-page-heading legal-heading">
        <span class="public-eyebrow" lang={locale()}>
          <Icon name="file-text" size={16} />
          {t('ui.legal', 'Legal')}
        </span>
        <h1>{props.document.title}</h1>
        <p class="legal-updated">
          {props.document.updatedLabel}:{' '}
          <time dateTime={props.document.updatedISO ?? '2026-11-20'}>{props.document.updatedDate}</time>
        </p>
      </header>
      <div class="legal-layout">
        <details class="legal-toc" open lang={locale()}>
          <summary>{t('ui.contents', 'Contents')}</summary>
          <nav aria-label={t('ui.contents', 'Contents')}>
            <For each={props.document.sections}>
              {(section, index) => (
                <a lang={props.language} href={`#legal-section-${index()}`}>
                  <span>{String(index() + 1).padStart(2, '0')}</span>
                  {section.title}
                </a>
              )}
            </For>
          </nav>
        </details>
        <div class="legal-body">
          <For each={props.document.sections}>
            {(section, index) => (
              <section aria-labelledby={`legal-section-${index()}`} class="legal-section">
                <h2 id={`legal-section-${index()}`}>
                  {index() + 1}. {section.title}
                </h2>
                <For each={section.paragraphs}>{(paragraph) => <p>{paragraph}</p>}</For>
                <Show when={section.table}>
                  {(table) => (
                    <div class="legal-table-wrapper">
                      <table class="table w-full">
                        <caption>{table().caption}</caption>
                        <thead>
                          <tr>
                            <For each={table().headers}>{(heading) => <th scope="col">{heading}</th>}</For>
                          </tr>
                        </thead>
                        <tbody>
                          <For each={table().rows}>
                            {(row) => (
                              <tr>
                                <For each={row}>{(cell) => <td>{cell}</td>}</For>
                              </tr>
                            )}
                          </For>
                        </tbody>
                      </table>
                    </div>
                  )}
                </Show>
                <Show when={section.links?.length}>
                  <ul class="legal-links">
                    <For each={section.links}>
                      {(link) => (
                        <li>
                          <a href={link.href}>{link.label}</a>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </section>
            )}
          </For>
        </div>
      </div>
    </article>
  )
}

export default LegalDocument
