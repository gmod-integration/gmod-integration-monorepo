import { For, Show } from 'solid-js'
import { useI18n } from '../../i18n.js'
import { CopyableValue } from './CopyableValue.js'
import { Icon } from './Icon.js'

export interface TemplateVariable {
  /** Complete literal syntax, including the braces required by this template. */
  token: string
  label: string
  format?: string
  example?: string
}

export interface TemplateVariablesProps {
  variables: readonly TemplateVariable[]
  title?: string
  description?: string
  syntax?: string
  example?: { template: string; result?: string }
  formatting?: readonly TemplateVariable[]
  open?: boolean
}

function VariableList(props: { variables: readonly TemplateVariable[] }) {
  const { t } = useI18n()
  return (
    <dl class="ui-template-variable-list">
      <For each={props.variables}>
        {(variable) => (
          <div class="ui-template-variable">
            <dt>
              <CopyableValue
                value={variable.token}
                label={t('ui.template_variables.copy', 'Copy {1}', variable.token)}
              />
            </dt>
            <dd>
              <span class="ui-template-variable-label">{variable.label}</span>
              <Show when={variable.format}>
                <span class="ui-template-variable-format">
                  {t('ui.template_variables.format', 'Format')}: {variable.format}
                </span>
              </Show>
              <Show when={variable.example !== undefined}>
                <span class="ui-template-variable-example">
                  {t('ui.template_variables.example', 'Example')}: <code>{variable.example}</code>
                </span>
              </Show>
            </dd>
          </div>
        )}
      </For>
    </dl>
  )
}

/** Read-only help: tokens are copied literally, never evaluated or inserted into a draft. */
export function TemplateVariables(props: TemplateVariablesProps) {
  const { t } = useI18n()
  return (
    <Show when={props.variables.length || props.formatting?.length}>
      <details class="ui-template-variables" open={props.open}>
        <summary>
          <Icon name="list" size={16} />
          <span>{props.title ?? t('ui.template_variables.title', 'Available variables')}</span>
          <Icon name="chevron-down" size={16} class="ui-template-variables-chevron" />
        </summary>
        <div class="ui-template-variables-content">
          <Show when={props.description}>
            <p class="ui-template-variables-description">{props.description}</p>
          </Show>
          <Show when={props.syntax}>
            {(syntax) => (
              <div class="ui-template-variables-syntax">
                <span>{t('ui.template_variables.syntax', 'Syntax')}</span>
                <CopyableValue value={syntax()} label={t('ui.template_variables.copy', 'Copy {1}', syntax())} />
              </div>
            )}
          </Show>
          <VariableList variables={props.variables} />
          <Show when={props.formatting?.length}>
            <div class="ui-template-formatting">
              <p class="ui-template-variables-subtitle">
                {t('ui.template_variables.formatting', 'Supported formatting')}
              </p>
              <VariableList variables={props.formatting ?? []} />
            </div>
          </Show>
          <Show when={props.example}>
            {(example) => (
              <div class="ui-template-example">
                <span class="ui-template-variables-subtitle">
                  {t('ui.template_variables.template_example', 'Template example')}
                </span>
                <CopyableValue
                  value={example().template}
                  label={t('ui.template_variables.copy', 'Copy {1}', example().template)}
                />
                <Show when={example().result !== undefined}>
                  <span class="ui-template-example-result">
                    <Icon name="arrow-right" size={15} />
                    <code>{example().result}</code>
                  </span>
                </Show>
              </div>
            )}
          </Show>
        </div>
      </details>
    </Show>
  )
}
