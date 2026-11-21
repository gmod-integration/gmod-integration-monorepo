# Website UI conventions

Read [the component catalogue](../../docs/apps/website-ui.md) before changing website UI.
Generic shared exports live in `src/components/ui/index.ts`; extend them when a pattern is missing.

- Reuse `Button`, `ButtonLink`, `IconButton`, `FormField`, `FormActions`, `AsyncState` and `TableState`.
- Group related settings with `SettingGroup` and `SettingRow`; use `SettingFeedback` for immediate saves.
  Keep global behavior separate from rule lists, actions beside their values and dependencies explicit.
- Use `ButtonLink` for navigation and `PageState` for full-page authentication, redirects and empty states.
- Reuse `AdminPanel`, `AdminModal`, the channel/role selectors and `Pagination`; avoid competing wrappers.
- Use `IconButton` for icon actions. A clickable `<i>` or `<span>` is not a button.
- All UI icons use the shared `Icon` and typed `IconName` registry backed by `lucide-solid`.
  Add named Lucide imports there; do not reintroduce icon fonts, proprietary packs or external icon CSS.
- Keep API requests in the page or feature hook. Shared controls do not know endpoints.
- Edit a local copy. Cancel, Escape and the close button discard it. Save closes only after success.
- Use `createAsyncAction` for pending/error/success and duplicate-request prevention. Throw on failed HTTP
  responses so the action cannot report a false success.
- Selectors update a local choice. Persist on explicit confirmation. Single-setting controls may save
  immediately, with pending/error feedback and restoration of the saved value on failure.
- Use `showDialog` / `closeDialog` from `utils/dialog.ts`, never implicit element-id globals.
- All UI text comes from `useI18n`; format dates and numbers with the selected locale.
- Reuse the light/dark tokens and shared controls in `src/styles/dashboard.css` under `.site-shell`.
  Public page layouts live in `src/styles/site.css`; keep navigation responsive and avoid page-wide overflow.
- Test changed interactions: cancel, failed request, retry and pending state.
