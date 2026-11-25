import { Show, type JSX } from 'solid-js'

export interface FormFieldProps {
  id: string
  label: string
  description?: string
  error?: string
  required?: boolean
  children: JSX.Element
}

/**
 * Give the native control this id. Associate hints with aria-describedby using
 * `${id}-description` and `${id}-error`, and set aria-invalid when an error exists.
 */
export function FormField(props: FormFieldProps) {
  return (
    <div class="ui-form-field flex flex-col gap-2 min-w-0">
      <label class="ui-field-label font-medium" for={props.id}>
        {props.label}
        <Show when={props.required}>
          <span class="text-error ml-1" aria-hidden="true">
            *
          </span>
        </Show>
      </label>
      {props.children}
      <Show when={props.description}>
        <p id={`${props.id}-description`} class="text-sm text-base-content/65">
          {props.description}
        </p>
      </Show>
      <Show when={props.error}>
        <p id={`${props.id}-error`} role="alert" class="text-sm text-error">
          {props.error}
        </p>
      </Show>
    </div>
  )
}
