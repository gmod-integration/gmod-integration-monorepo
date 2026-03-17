import type { Component } from 'solid-js'
import { useI18n } from '../i18n'

const ToDo: Component = () => {
  const { t } = useI18n()

  return (
    <div class="flex flex-col items-center justify-center my-auto w-full">
      <h1 class="text-6xl font-bold">{t('todo.title', 'To-Do')}</h1>
      <p class="text-xl my-6">{t('todo.description', 'The page you are looking for does not exist yet.')}</p>
    </div>
  )
}

export default ToDo
