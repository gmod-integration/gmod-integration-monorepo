# Website UI conventions

Read [the component catalogue](../../docs/apps/website-ui.md) before changing website UI.
Generic shared exports live in `src/components/ui/index.ts`; extend them when a pattern is missing.

- Reuse `Button`, `ButtonLink`, `IconButton`, `FormField`, `FormActions`, `AsyncState` and `TableState`.
- Group related settings with `SettingGroup` and `SettingRow`; keep one Save/Cancel scope per group.
  Keep global behavior separate from rule lists, actions beside their values and dependencies explicit.
- Use `ButtonLink` for navigation and `PageState` for full-page authentication, redirects and empty states.
- Reuse `AdminPanel`, `AdminModal`, the channel/role selectors and `Pagination`; avoid competing wrappers.
- Use `IconButton` for icon actions. A clickable `<i>` or `<span>` is not a button.
- All UI icons use the shared `Icon` and typed `IconName` registry backed by `lucide-solid`.
  Add named Lucide imports there; do not reintroduce icon fonts, proprietary packs or external icon CSS.
- Keep API requests in the page or feature hook. Shared controls do not know endpoints.
- Business settings use explicit local drafts, including switches, lists and single-setting controls.
  Keep simple settings inline. Use `createDraftForm` for saved snapshots, dirty/valid state and Save/Cancel.
  Save is enabled only when dirty and valid; failure preserves the draft. Search and filtering preserve drafts.
- Use complete modals for independent entity creation/editing and secrets. Add opens an empty draft;
  never POST a placeholder before Create. Cancel, Escape and close discard it. Save closes after success.
- Use `createAsyncAction` for pending/error/success and duplicate-request prevention. Throw on failed HTTP
  responses so the action cannot report a false success.
- Selectors update a local choice. Persist on explicit confirmation. Only interface preferences such
  as language, theme, sorting and filters may change immediately; business settings do not autosave.
- Use `ConfirmActionDialog` for destructive actions, publication/removal, token reset and bulk commands.
  Name the target and consequence. Pending blocks duplicate requests and dismissal; failure permits retry.
- `createDraftForm` registers navigation protection automatically. Manual editors use `useDraftGuard`;
  include pending operations, and unregister on unmount. Do not bypass `DraftEditingProvider`.
- Save related settings atomically through the v6 APIs and `saveDashboardSettings`; send changed keys
  together. Status message and button edits share one configuration draft and revision. An accepted save
  with `sync: 'pending'` means synchronization is awaiting confirmation; retain that feedback separately.
- Use `showDialog` / `closeDialog` from `utils/dialog.ts`, never implicit element-id globals.
- All UI text comes from `useI18n`; format dates and numbers with the selected locale.
- Reuse the light/dark tokens and shared controls in `src/styles/dashboard.css` under `.site-shell`.
  Public page layouts live in `src/styles/site.css`; keep navigation responsive and avoid page-wide overflow.
- Test changed interactions: cancel, failed request, retry and pending state.

- Use `AccessProvider` and `useFeatureAccess` with a named capability for business access. The server
  snapshot and shared AccessPolicy catalogue determine rights/quotas; localStorage flags do not.
- Keep actions visible with `FeatureGate`, an explicit reason and shared quota count. Loading/fetch
  errors and uncertain provider rights are not upgrade prompts. Existing cleanup remains accessible.
- Preserve drafts when access refreshes or expires. Explain suspended saved values and let authorized
  users disable/remove them. Custom bots require their distinct historical GmodStore capability.
