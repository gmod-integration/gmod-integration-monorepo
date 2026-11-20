import { For, Show, type Component } from 'solid-js'

export type LegalDocumentContent = {
  title: string
  updatedLabel: string
  updatedDate: string
  sections: {
    title: string
    paragraphs: string[]
    links?: { label: string; href: string }[]
    table?: { caption: string; headers: string[]; rows: string[][] }
  }[]
}

const LegalDocument: Component<{ document: LegalDocumentContent; language: 'en' | 'fr' }> = (props) => (
  <article lang={props.language} class="flex flex-col p-8 max-w-300 mx-auto gap-12">
    <header class="text-center">
      <h1 class="text-4xl font-bold mt-14 mb-4">{props.document.title}</h1>
      <p>
        {props.document.updatedLabel}: <time dateTime="2026-11-20">{props.document.updatedDate}</time>
      </p>
    </header>
    <For each={props.document.sections}>
      {(section, index) => (
        <section aria-labelledby={`legal-section-${index()}`} class="flex flex-col gap-4">
          <h2 id={`legal-section-${index()}`} class="text-xl font-bold text-secondary">
            {index() + 1}. {section.title}
          </h2>
          <For each={section.paragraphs}>{(paragraph) => <p class="text-base text-base-content">{paragraph}</p>}</For>
          <Show when={section.table}>
            {(table) => (
              <div class="overflow-x-auto">
                <table class="table w-full border border-base-200 rounded-lg border-separate">
                  <caption class="text-left mb-4">{table().caption}</caption>
                  <thead>
                    <tr>
                      <For each={table().headers}>{(heading) => <th scope="col">{heading}</th>}</For>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={table().rows}>
                      {(row) => (
                        <tr>
                          <For each={row}>{(cell) => <td class="text-base-content">{cell}</td>}</For>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            )}
          </Show>
          <Show when={section.links?.length}>
            <ul class="list-disc pl-6">
              <For each={section.links}>
                {(link) => (
                  <li>
                    <a class="link link-secondary" href={link.href}>
                      {link.label}
                    </a>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </section>
      )}
    </For>
  </article>
)

export default LegalDocument
