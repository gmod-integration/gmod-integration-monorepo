# Website UI component catalogue

This is the shared UI reference for `apps/website`. Keep it aligned with the code when component APIs
change. Check this catalogue before introducing another website control. SolidJS, Tailwind and DaisyUI
remain the visual foundation.

## Generic components

Import from `apps/website/src/components/ui/index.ts`.

| Component         | Purpose                                 | Contract                                                                                                                                                                                       |
| ----------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`          | Text actions                            | Native attributes; `variant`: `primary`, `secondary`, `ghost`, `danger`, `warning`; `size`: `sm`, `md`; `loading` blocks clicks and retains the label. Default `type="button"`.                |
| `ButtonLink`      | Navigation styled as a button           | Native anchor attributes and the same `variant`/`size` options as `Button`. Use an `href` for navigation; pending actions belong in `Button`.                                                  |
| `IconButton`      | Compact row actions                     | `Button` props plus required translated `label` and `icon` or children. Includes accessible name and tooltip.                                                                                  |
| `FormField`       | Labelled input, select or textarea      | `id`, `label`, optional `description`, `error`, `required`. The child control uses the same `id`.                                                                                              |
| `FormActions`     | Save/cancel and feedback                | `onSave`, optional `onCancel`, `pending`, `disabled`, `dirty`, `error`, `success`, `message`, custom labels. Cancel precedes primary Save. Pending blocks both; validation disables only Save. |
| `AsyncState`      | Loading, error, empty and ready content | `loading`, `error`, `empty`, optional labels and `onRetry`; content in children. Handles states in that order. Errors use safe translated copy.                                                |
| `TableState`      | These states inside a table             | `AsyncState` props plus `colSpan`. Renders valid `tr`/`td` state content. Place inside `tbody`.                                                                                                |
| `PageState`       | Full-page authentication and status     | `icon`, `title`, optional `description`, `status` and action children. Provides a labelled section and one page heading; `status` announces redirect progress.                                 |
| `SettingGroup`    | Related settings                        | `title`, optional `id`, `description` and `icon`. Use within an existing panel to group controls by user goal.                                                                                 |
| `SettingRow`      | Setting, explanation and control        | `title`, optional `controlId`, `description`, `feedback`, `stacked`. Set the control's `id` to `controlId` and associate the description with `${controlId}-description`.                      |
| `SettingFeedback` | Immediate-save feedback                 | `pending`, `error`, `success`; announces the active state without duplicating page-specific markup.                                                                                            |

## Existing components to reuse

All UI icons use `Icon` from the same barrel, with a typed `IconName` (`pencil`, `trash-2`, `server`,
`shield-check`, etc.). The registry in `components/ui/Icon.tsx` imports named SVG components from
[`lucide-solid`](https://lucide.dev/guide/packages/lucide-solid), compatible with the website's Solid 1.
Icons are decorative by default; put accessible names on their button or link. `IconButton` accepts the
same typed names. User-supplied emoji and Discord message content retain their original appearance.
The former icon-font stylesheets and proprietary font assets are removed.

```tsx
<Icon name="server" size={18} />
<IconButton icon="pencil" label={t('dashboard.server.status.edit')} onClick={edit} />
```

Paths below are relative to `apps/website/src`.

| Component                                         | Source                                            | Purpose                                                                                                                                                                                |
| ------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AdminPanel`                                      | `components/AdminPanel.tsx`                       | Section heading, description, premium/badge/info, optional header `actions` and `footer`. `type="none"` leaves the body unpadded for tables.                                           |
| `AdminModal`                                      | `components/AdminModal.tsx`                       | Named dialog: `id`, `title`, optional `description`, `busy`, `onClose`, `onCancel`, `size="wide"`, `footer`. Busy blocks user dismissal.                                               |
| `AdminChannelSelector`                            | `components/AdminChannelSelector.tsx`             | Channel dialog with local choice and explicit Save/Cancel. Callback returns its request promise and rejects on failure. `idSelect` seeds the current choice.                           |
| `ChannelSelector`                                 | `components/AdminChannelSelector.tsx`             | Local channel choice inside a larger form; does not save or close the dialog.                                                                                                          |
| `AdminRoleSelector`                               | `components/AdminRoleSelector.tsx`                | Role choice and explicit confirmation: `id`, `title`, filtered `roles`, optional `loading`/`error`, async `onConfirm`. Shares pending/error/cancel behavior with the channel selector. |
| `Pagination`                                      | `components/Pagination.tsx`                       | Existing query, total and page-size controls. Keep its query contract.                                                                                                                 |
| `DiscordStatusPreview`                            | `components/discord/DiscordStatusPreview.tsx`     | Shared status rendering for the page and its editors.                                                                                                                                  |
| `DiscordChannel`, `DiscordRole`, `DiscordMessage` | `components/discord/`                             | Discord entity display and message links.                                                                                                                                              |
| `TextValue`, `LinkValue`, `SteamID64`             | `components/popup/`, `components/SteamID64.tsx`   | Long-value, link and player identifier display.                                                                                                                                        |
| `PremiumBadge`, `BuyPremiumBtn`, `PremiumOnly`    | `utils/premium.tsx`, `components/PremiumOnly.tsx` | Shared premium access presentation.                                                                                                                                                    |
| `ServerActivityChart`, `AdminChart`, `JsonViewer` | `components/`                                     | Charts and structured data display.                                                                                                                                                    |

## Interaction contracts

An editor owns a local draft copied from saved data when opened. Typing and selecting do not update the
saved row. Cancel, Escape and the close button discard the draft. Opening again uses the saved value.

Save starts one request, disables relevant controls and blocks dismissal while pending. Success updates
saved data and closes the dialog. Failure leaves the draft open with an inline error and permits retry.
`createAsyncAction` in `src/hooks/createAsyncAction.ts` shares this lifecycle:

```tsx
const save = createAsyncAction({ errorMessage: () => t('ui.save_error') })
const submit = async () => {
  if (await save.run(() => persistDraft(draft()))) closeDialog('edit-item')
}
```

It provides `pending()`, `error()`, `success()`, `run(operation)` and `reset()`. Reset before a new edit.
`run` returns a success boolean. The operation must throw on an unsuccessful HTTP response; resolving
`undefined` after a failed response would incorrectly count as success. The page owns API requests,
validation and saved-data mutations.

Selectors follow the same explicit confirmation rule. Choosing an option alone does not publish or
change the configured destination. Pass the current choice when available.

Existing single-setting controls can save immediately when their purpose is clear. They disable while
saving, show success/error feedback and restore the saved value on failure. Do not mix immediate
persistence and a multi-field draft within one editor.

Use primary for Save/Send, secondary for Cancel, ghost for compact editing and danger for removal.
Publication/removal remain separate, explicitly labelled actions. Explain why Save is unavailable when
it depends on validation, permissions or a current preview.

## Standard form

```tsx
<AdminModal id="edit-item" title={title()} busy={save.pending()} onClose={discardDraft}>
  <FormField id="item-name" label={nameLabel()} description={nameHint()}>
    <input
      id="item-name"
      class="input w-full"
      aria-describedby="item-name-description"
      value={draft().name}
      disabled={save.pending()}
      onInput={(event) => updateDraft({ name: event.currentTarget.value })}
    />
  </FormField>
  <FormActions
    pending={save.pending()}
    error={save.error()}
    onSave={submit}
    onCancel={() => closeDialog('edit-item')}
  />
</AdminModal>
```

Associate hints using `${id}-description` and validation messages using `${id}-error` through the
control's `aria-describedby`; set `aria-invalid` when showing a validation error. Native inputs remain
inside `FormField`; feature-specific controls such as emoji pickers keep their own rendering.

## Lists and layout

Settings are grouped by purpose rather than storage order. Keep a destination beside its change/remove
actions, and separate global synchronization behavior from the rule list it controls. Keep saved rules
when a feature is disabled. Explain verified dependencies and place dependent controls under their
parent option; do not infer a dependency from a setting name alone. Keep sensitive actions apart from
routine editing. Shared setting layouts live in `src/styles/settings.css`.

Server configuration supports local search in translated labels/descriptions and category filters.
Advanced compatibility and troubleshooting controls are collapsed initially and open automatically
when selected or matched by search. Defaults remain available in each setting's disclosure. Filtering
does not cancel a pending save or reset draft values.

```tsx
<div class="min-w-0 w-full overflow-x-auto">
  <table class="table">
    <thead>{/* feature column headings */}</thead>
    <tbody>
      <TableState
        colSpan={4}
        loading={rows.loading}
        error={rows.error}
        empty={!rows.loading && !rows.error && rows().length === 0}
        onRetry={() => refetch()}
      >
        {/* feature tr rows */}
      </TableState>
    </tbody>
  </table>
</div>
```

Check loading/error before reading a Solid resource. Failure must not masquerade as an empty list.
Keep `Pagination` outside `TableState`, under a successful `!loading && !error` guard, so empty pages
still allow returning to a previous page or changing the page size. Keep pagination inside valid table
rows. Use wrapping action groups and horizontal overflow for wide
data; do not make the whole dashboard scroll horizontally.

## Visual and maintenance rules

- Theme tokens from `src/index.css` supply colors: `base-*`, `primary`, `error`, `success`.
  Shared light/dark surfaces, typography, forms, buttons, dialogs and tables live in
  `src/styles/dashboard.css`, scoped to `.site-shell`. Dashboard navigation stays scoped to
  `.dashboard-shell`; public layouts live in `src/styles/site.css`.
- `App.tsx` owns the site shell. Use `public-page`, `public-page-heading`, `public-eyebrow`,
  `public-card` and `public-toolbar` for public page layouts. Feature-specific content stays in its page.
- The public header shares the website controls and closes competing menus. Below the desktop
  breakpoint, navigation opens with an explicitly labelled button and closes on Escape, outside click
  or link selection. The footer has one landmark and grouped navigation.
- Legal documents share `pages/legal/LegalDocument.tsx`: a responsive table of contents and scrollable
  tables. Preserve the document content, links and explicit revision date when changing presentation.
- Common spacing: `gap-2` for controls, `gap-4`/`p-4` for sections, `gap-6` between major areas.
- Keep button sizes in `Button` and dialog layouts in `AdminModal`; avoid copying their class strings.
- Visible text, errors and accessible labels use `useI18n`. Generic strings live under `ui`.
  Format dates and numbers with `locale()` so their presentation follows the selected website language.
- The screenshot lightbox may retain its specialized layout and native dialog submit controls.
- Extend the common component when another feature needs the same behavior. Keep domain-specific
  rendering in its feature; avoid adding competing modal, pagination or generic button wrappers.
- Test cancellation, failed save/retry, duplicate pending clicks, accessible actions and table states.

Dashboard ESLint rules reject copied native `btn` controls and clickable `<i>` actions. Use `Button`
and `IconButton`; the screenshot lightbox is the explicit specialized exception.
