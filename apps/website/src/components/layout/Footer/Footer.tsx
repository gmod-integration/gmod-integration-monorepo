import type { Component } from 'solid-js'
import FirstFooter from './FirstFooter.js'
import SecondFooter from './SecondFooter.js'

export const Footer: Component = () => (
  <div class="flex shrink-0 flex-col">
    <hr class="border border-base-200" />
    <FirstFooter />
    <hr class="border border-base-200" />
    <SecondFooter />
  </div>
)
