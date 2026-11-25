import type { Component } from 'solid-js'
import FirstFooter from './FirstFooter.js'
import SecondFooter from './SecondFooter.js'

export const Footer: Component = () => (
  <footer class="site-footer">
    <div class="site-footer-inner">
      <FirstFooter />
      <SecondFooter />
    </div>
  </footer>
)
