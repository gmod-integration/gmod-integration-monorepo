# Website UI component catalogue

This is the shared UI reference for `apps/website`. Keep it aligned with the code when component APIs
change. Check this catalogue before introducing another website control. SolidJS, Tailwind and DaisyUI
remain the visual foundation.

## Generic components

Import from `apps/website/src/components/ui/index.ts`.

Icon navigation and downloads use `IconButtonLink`, with the same required `label`, optional `icon`
and sizes as `IconButton`, plus native link attributes. Preserve `href`, `download`, `target` and `rel`
instead of replacing link behavior with a click handler. Standard controls are 38 px high; small
buttons and fields are 32 px high. Use `size="sm"` and `select-sm`/`input-sm` together in compact groups.

Boolean settings use native checkbox inputs with the shared `toggle toggle-sm` switch presentation.
Pair them with the existing `FormField` or `SettingRow` label and preserve their descriptions,
keyboard interaction and disabled states. Existing settings save automatically after a valid change.

Group related settings in `AdminPanel` cards, using `SettingGroup` and `SettingRow` inside the card
when they share a purpose. Use `.settings-card-grid` for at most two columns; cards stretch to the same
height within each row and collapse to one column on smaller screens. Keep help notices inset from
headers and tables, including in panels with `type="none"`.

Existing settings save automatically after a valid change. Show compact `AutosaveFeedback` beside
the setting or inside its card instead of repeated Save/Cancel footers. Related values still share a
saved snapshot and an atomic request; preserve edits when filtering or hiding a group.

`AdminPanel` is a section named by its heading and accepts an optional `id` for stable anchors.
`SettingGroup` remains a subsection inside a card, with optional `actions` beside its heading.
Status content and link buttons share one server revision and serialize automatic writes. Each request
merges its changed group with the sibling's saved values, preserving pending edits in the sibling.
Confirming a button modal schedules its automatic save; deletion and publication remain explicit
commands. Adopt canonical button IDs from the response and retain synchronization-pending feedback.

Read-only states share `StatusBadge`: a visible label, an optional decorative icon, and a semantic
`tone` (`success`, `neutral`, `warning`, `danger`, `info`). Use the default 24 px size in tables/cards
and `size="sm"` (20 px) for navigation markers and counts. Long labels wrap, and each tone has shared
light/dark colors. Static badges do not announce themselves as live status regions.

`BooleanStatus` formats a boolean as translated Enabled/Disabled with a check/cross and keeps these
short labels on one line. Disabled is
neutral; missing values show Unknown. Optional `trueLabel`, `falseLabel` and `unknownLabel` preserve
domain wording, such as Yes/No for maintenance access. Connection state, severity and membership
retain their specific labels through `StatusBadge`. Keep incomplete or unknown data distinct from an
actual negative state. Quota explanations, field validation and interactive switches retain their
own contracts.

| Component         | Purpose                                 | Contract                                                                                                                                                                                                                           |
| ----------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`          | Text actions                            | Native attributes; `variant`: `primary`, `secondary`, `ghost`, `danger`, `warning`; `size`: `sm`, `md`; `loading` blocks clicks and retains the label. Default `type="button"`.                                                    |
| `ButtonLink`      | Navigation styled as a button           | Native anchor attributes and the same `variant`/`size` options as `Button`. Use an `href` for navigation; pending actions belong in `Button`.                                                                                      |
| `IconButton`      | Compact row actions                     | `Button` props plus required translated `label` and `icon` or children. Includes accessible name and tooltip.                                                                                                                      |
| `CopyableValue`   | Bordered value or console command       | `value` is the clipboard payload; optional `display` masks it or preserves a link. `label` names the copy action, `multiline` wraps commands, `disabled` prevents copying. Copy icon becomes a check only after clipboard success. |
| `CopyButton`      | Standalone clipboard action             | `value`, optional `label`, `disabled` and `class`. Shares pending, copied and retryable error feedback with `CopyableValue`.                                                                                                       |
| `LanguageFlag`    | Language selector artwork               | Typed `locale`, decorative SVG from local assets, fixed 24×16 dimensions. English uses the British flag. Pair with the visible native language name.                                                                               |
| `FormField`       | Labelled input, select or textarea      | `id`, `label`, optional `description`, `error`, `required`. The child control uses the same `id`.                                                                                                                                  |
| `FormActions`     | Modal save/cancel and feedback          | `onSave`, optional `onCancel`, `pending`, `disabled`, `dirty`, `error`, `success`, `message`, custom labels. Cancel precedes primary Save. Pending blocks both; validation disables only Save.                                     |
| `AsyncState`      | Loading, error, empty and ready content | `loading`, `error`, `empty`, optional labels and `onRetry`; content in children. Handles states in that order. Errors use safe translated copy.                                                                                    |
| `TableState`      | These states inside a table             | `AsyncState` props plus `colSpan`. Renders valid `tr`/`td` state content. Place inside `tbody`.                                                                                                                                    |
| `PageState`       | Full-page authentication and status     | `icon`, `title`, optional `description`, `status` and action children. Provides a labelled section and one page heading; `status` announces redirect progress.                                                                     |
| `SettingGroup`    | Related settings                        | `title`, optional `id`, `description` and `icon`. Use within an existing panel to group controls by user goal.                                                                                                                     |
| `SettingRow`      | Setting, explanation and control        | `title`, optional `controlId`, `description`, `feedback`, `stacked`. Set the control's `id` to `controlId` and associate the description with `${controlId}-description`.                                                          |
| `SettingFeedback` | Action feedback                         | `pending`, `error`, `success`; announces the active state without duplicating page-specific markup.                                                                                                                                |

Copy controls retain the displayed value beside a keyboard-accessible action. They wait for the
clipboard promise before showing an animated check, reset confirmation after two seconds or a value
change, and allow retry after failure. Link displays retain their normal navigation. For credentials,
pass a masked `display` and a translated action `label`; never include the secret in accessible names
or tooltips. Copying still uses the current complete `value`.

## Existing components to reuse

All UI icons use `Icon` from the same barrel, with a typed `IconName` (`pencil`, `trash-2`, `server`,
`shield-check`, etc.). The registry in `components/ui/Icon.tsx` imports named SVG components from
[`lucide-solid`](https://lucide.dev/guide/packages/lucide-solid), compatible with the website's Solid 1.
Icons are decorative by default; put accessible names on their button or link. `IconButton` accepts the
same typed names. User-supplied emoji and Discord message content retain their original appearance.
User identity images use `DiscordAvatar` with the current authenticated Discord profile. Prefer its
resolved avatar URL, including the application's avatar proxy. Accounts without a custom image use
Discord's default avatar; failed custom images fall back once before using a generic icon. Keep the
profile reactive so session refreshes update both the header and account card. Bot previews use the
bot's Discord avatar, while game and Steam identities retain their own images.
The former icon-font stylesheets and proprietary font assets are removed.
Language flags use the local `LanguageFlag` assets rather than Lucide or emoji fonts; these are language
selector artwork, while action icons remain in the Lucide registry.

```tsx
<Icon name="server" size={18} />
<IconButton icon="pencil" label={t('dashboard.server.status.edit')} onClick={edit} />
```

Paths below are relative to `apps/website/src`.

`DiscordUser` in `components/discord/DiscordUser.tsx` renders a read-only `@name` mention from
`user: { id: string; name?: string | null }`, without fetching a profile. Missing or blank names fall
back to `@ID`; keep Discord IDs as strings. Mentions wrap long names and use the shared light/dark
accent tokens. The community overview uses these mentions for administrators and `CopyableValue`
for its Discord server ID.

| Component                                         | Source                                            | Purpose                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AdminPanel`                                      | `components/AdminPanel.tsx`                       | Section heading, description, premium/badge/info, optional header `actions` and `footer`. `type="none"` leaves the body unpadded for tables.                                                                                                                                                    |
| `AdminModal`                                      | `components/AdminModal.tsx`                       | Named dialog: `id`, `title`, optional `description`, `busy`, `onClose`, `onCancel`, `size="wide"`, `footer`. Busy blocks user dismissal.                                                                                                                                                        |
| `ConfirmActionDialog`                             | `components/ConfirmActionDialog.tsx`              | Confirm a named target and consequence before an async command. `id`, `title`, optional `description`, `confirmLabel`, `variant`, `onSuccess`; `onConfirm` rejects on failure. Blocks duplicate requests, dismissal and navigation while pending.                                               |
| `AdminChannelSelector`                            | `components/AdminChannelSelector.tsx`             | Channel dialog with local choice and explicit Save/Cancel. Callback returns its request promise and rejects on failure. `idSelect` seeds the current choice.                                                                                                                                    |
| `ChannelSelector`                                 | `components/AdminChannelSelector.tsx`             | Local channel choice inside a larger form; does not save or close the dialog.                                                                                                                                                                                                                   |
| `AdminRoleSelector`                               | `components/AdminRoleSelector.tsx`                | Role choice and explicit confirmation: `id`, `title`, filtered `roles`, optional `loading`/`error`, async `onConfirm`. `confirmDisabled` blocks submission while preserving selection; `children` composes contextual feedback. Shares pending/error/cancel behavior with the channel selector. |
| `Pagination`                                      | `components/Pagination.tsx`                       | Existing query, total and page-size controls. Keep its query contract.                                                                                                                                                                                                                          |
| `DiscordStatusPreview`                            | `components/discord/DiscordStatusPreview.tsx`     | Shared status rendering for the page and its editors.                                                                                                                                                                                                                                           |
| `DiscordChannel`, `DiscordRole`, `DiscordMessage` | `components/discord/`                             | Discord entity display and message links.                                                                                                                                                                                                                                                       |
| `TextValue`, `LinkValue`, `SteamID64`             | `components/popup/`, `components/SteamID64.tsx`   | Bordered copyable values, links and player identifiers. Links preserve their navigation with a separate copy action.                                                                                                                                                                            |
| `PremiumBadge`, `BuyPremiumBtn`, `PremiumOnly`    | `utils/premium.tsx`, `components/PremiumOnly.tsx` | Shared premium access presentation.                                                                                                                                                                                                                                                             |
| `ServerActivityChart`, `AdminChart`, `JsonViewer` | `components/`                                     | Charts and structured data display.                                                                                                                                                                                                                                                             |

`ConfirmActionDialog.disabled` gates confirmation. Its optional `children` can be a render callback
receiving the pending accessor, so contextual fields such as a required reason can be disabled while
the command runs.

## Authentication and session recovery

The [internal admin dashboard](./admin-dashboard.md) applies these controls to six protected pages.
Its server-verified guard for the operator's own developer session mounts content after confirmation;
delegated sessions retain the return path. Shared admin list helpers preserve server pagination and
filters, and mutation handlers validate acknowledgements before closing drafts or confirmations.

`AuthProvider` in `components/AuthProvider.tsx` owns the shared session lifecycle. Read `authSession()`
and `authStatus()` from `utils/authClient.ts`; `checking`, `signed_out`, `temporarily_unavailable` and
`reauth_required` are distinct states. Protected routes wait for the first check. Keep existing editors
mounted through temporary failures, and redirect to login only after a definitive signed-out result.
`Header` displays the shared state without validating credentials independently.

Use `fetchAPI` for the existing v3 route helpers and `/v6/` paths, or `authenticatedFetch` for full URLs.
Both use `credentials: 'include'`; mutations receive `X-CSRF-Token` from the session snapshot. Do not
read a localStorage access token, build an Authorization header or add credentials to links/WebSocket
URLs. The separate erasure-receipt status reader owns its recovery Bearer header.

Session validation is coordinated across callers. A 401 checks the application session before clearing
identity. An expired delegation can recover the operator through the session endpoint's
`actor_session_available` CSRF challenge and a direct return request; a temporary failure preserves the
editor. A GET may retry once after recovery. Never replay a mutation automatically. A permission
403 leaves the session intact; `discord_reauth_required` displays the shared reconnect action. OAuth
opens in a new tab to preserve the active editor. Network/503 failures retain drafts and show retry
feedback instead of a forced logout or upgrade prompt.

`authCommand` handles session-changing commands and validates their acknowledgement before adopting
the new server identity. Session IDs and the server's `actorDiscordID` marker drive session management
and delegation; target DTOs and browser storage never contain another account's credential. Login,
logout, delegation and account cleanup publish only a nonce/time storage notification. Recipients
reread the cookie, abort superseded requests and ignore stale responses. Keep this notification after
private-data cleanup so another tab can notice revocation without a WebSocket.

## Capability and quota controls

Business access comes from the authenticated v6 access snapshot, with policy metadata from
`@gmod/schema/server/AccessPolicySchema.js`. `localStorage.isPremium` is a display cache from community
selection and grants no capability. Keep actor permissions, commercial access, load failures and
configuration availability distinct.

| Component/hook     | Source                          | Contract                                                                                                                                                                                                                                                                                                                      |
| ------------------ | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AccessProvider`   | `components/AccessProvider.tsx` | Loads the current community/server access endpoint; refreshes on writes, denied requests, focus, visibility, storage and WebSocket reconnect, as well as periodically. Verifies scope and expiry. An optional controlled snapshot is for explicit embedding/testing; the production app never seeds rights from localStorage. |
| `useFeatureAccess` | `components/AccessProvider.tsx` | Named `CapabilityKey`; `allowed()`, `limit()`, `canCreate(used)`, snapshot/loading/error and refresh. `null` limit means no commercial count limit. A fresh `unknown` entitlement still permits free capabilities within their free quota.                                                                                    |
| `FeatureGate`      | `components/FeatureGate.tsx`    | Keeps children mounted and visible. Shows shared quota, reason and contextual upgrade link. Pass the list's `loading` and `error`; failed/unknown data never becomes an upgrade demand. Disable the action using the matching hook.                                                                                           |
| `SuspendedFeature` | `components/FeatureGate.tsx`    | Explains that a stored paid configuration is suspended after verified loss of access. It does not discard or persist data.                                                                                                                                                                                                    |

```tsx
const access = useFeatureAccess('sync.roles.rules')
<FeatureGate capability="sync.roles.rules" used={rows().length} loading={rows.loading} error={rows.error}>
  <Button disabled={rows.loading || !!rows.error || !access.canCreate(rows().length)} onClick={add}>
    {t('ui.create')}
  </Button>
</FeatureGate>
```

The API enforces every capability and quota independently of the UI. A feature gate is not an
authorization boundary. Keep names/limits out of page-local conditionals. The public plan comparison
uses the same typed policy, including four free role mappings and three custom status buttons.
History windows come from the API response; never truncate rows or rewrite pagination to implement
commercial access in the browser.

After expiry, retain saved data and drafts. Keep configuration readable and permit authorized cleanup:
disabling a paid option, restoring its free default, or deleting a rule. Prevent new paid activations;
make suspended stored values clear. A provider outage is distinct from a verified free plan and must
not generate an upsell. Preserve the existing draft, validation and navigation contracts during access
refreshes. Custom bot eligibility is a separate GmodStore capability, not general Premium.

Creation and editing dialogs recheck the same capability and quota when applying the draft. Keep the
matching `FeatureGate` inside the dialog so a loss of access has a visible explanation. A refresh,
expiry or verification failure disables the affected confirmation without closing the dialog or
clearing its values; restored access allows the same draft to continue. An unavailable access snapshot
uses the verification message rather than a Premium or quota claim. Cleanup remains available.

`PremiumBadge`, `PremiumOnly` and `AdminPanel.premium` remain presentation adapters.
`BuyPremiumBtn` is deprecated: it keeps content visible beside a link, but new code uses `FeatureGate`
with a named capability. The icon-only badge has an accessible link name.

## Addon setup in server information

The server information page includes copyable commands using the selected server's ID and current
token, with the token masked until explicitly revealed. A successful token reset updates the copied
command and hides the token again. Setup is separate from the editable server-information draft.

Commands come from the addon's [Lua console handler](../../submodules/gmod-integration/lua/gmod_integration/core/config/sv_con.lua):

```text
gmod-integration config set id "SERVER_ID"
gmod-integration config set token "SERVER_TOKEN"
gmod-integration config try
```

Run them one at a time in the Garry's Mod server console. The addon persists each setting immediately
and automatically tests the connection once both credentials are configured. The diagnostics
disclosure provides `gmod-integration help` and `gmod-integration version`.

## Interaction contracts

Choose the editing surface by purpose:

| Purpose                                                            | Surface                                | Persistence                                                              |
| ------------------------------------------------------------------ | -------------------------------------- | ------------------------------------------------------------------------ |
| Existing settings, including switches and destinations             | Inline `SettingGroup` and `SettingRow` | Save valid changes automatically with compact feedback.                  |
| Independent entity creation/editing or a secret                    | Complete `AdminModal` form             | Add opens an empty local draft; Create/Save submits the complete object. |
| Publication/removal, deletion, token reset or a bulk command       | `ConfirmActionDialog`                  | Name the target and consequence; execute only after confirmation.        |
| Interface preferences such as theme, language, sorting and filters | Immediate control                      | Update immediately.                                                      |

Use `createDraftForm` with `allowPendingEdits: true` and `createAutosave` for existing settings.
Typing is debounced for 400 ms; only dirty, valid, available values are submitted. Writes are serialized
and edits made during a request are preserved for the next save. A failed request keeps the draft and
shows Retry instead of retrying indefinitely. No request is made for initial hydration or invalid input.

```tsx
const form = createDraftForm({
  initial: savedValues,
  allowPendingEdits: true,
  validate: validateValues,
  errorMessage: () => t('ui.save_error'),
})
const autosave = createAutosave({
  form,
  save: () => form.save((snapshot) => persistSettings(snapshot)),
  enabled: () => !settings.loading && !settings.error,
})

<AutosaveFeedback state={autosave} />
```

`AutosaveFeedback` accepts optional `message` content for saved-but-pending synchronization. It shows
saving, saved and failure feedback, remaining hidden before any activity rather than repeating an
automatic-save notice. Inputs can remain editable
while a setting saves; commands that remove/reset the same entity wait until its queued writes finish.

Entity and secret modals retain explicit Create/Save/Cancel. Confirm only a complete validated object;
do not POST a placeholder when Add is clicked. Cancel, Escape and close discard the modal draft.
Pending requests block duplicate submissions and dismissal. Success updates saved data and closes
the dialog; failure retains values and offers another attempt. Use `FormActions` for these editors.

`createDraftForm` in `src/hooks/createDraftForm.ts` provides the shared lifecycle and registers
navigation protection automatically. Filtering, searching and collapsing sections preserve values;
keep the form owner mounted outside conditional field rendering.

It exposes `draft()`, `saved()`, `dirty()`, `errors()`, `valid()`, `pending()`, `error()`, `success()`,
`setDraft(valueOrUpdater)`, `patch(partial)`, `reset(values)`, `discard()` and `save(persist)`.
`save` passes a cloned snapshot to persistence and returns a success boolean. Persistence can return
the accepted snapshot; returning `void` accepts the submitted snapshot. `reset` establishes a new saved
baseline; do not call it in response to ordinary draft edits.

For commands or manual editors, `createAsyncAction` in `src/hooks/createAsyncAction.ts` provides
`pending()`, `error()`, `success()`, `run(operation)` and `reset()`. Reset before a new operation.
`run` returns a success boolean. Requests must throw on unsuccessful HTTP responses; resolving after
a failed response would report false success. Pages own requests, validation and saved-data mutations.

Manual editors register `useDraftGuard({ dirty, pending, discard })` from `src/hooks/draftRegistry.ts`.
`DraftEditingProvider` protects route changes and browser unloads; pending operations cannot be
discarded through the route dialog. Shared selectors and confirmation dialogs also register their state.

Inline selectors for existing settings save automatically. Dedicated channel-selection dialogs and
entity editors retain explicit confirmation and receive the current choice when available.

Use primary for Save/Send, secondary for Cancel, ghost for compact editing and danger for removal.
Publication/removal remain separate, explicitly labelled actions. Explain why Save is unavailable when
it depends on validation, permissions or a current preview.

### Persistence scopes

`utils/dashboardSettings.ts` sends changed keys together through `saveDashboardSettings('server' | 'guild', settings)`:

- `PUT /v6/guilds/:guildID/servers/:serverID/settings`
- `PUT /v6/guilds/:guildID/settings`

Each accepts `{ settings: { ...changedValues } }`, validates every supplied key before writing, and
returns the accepted settings with `sync: 'applied' | 'pending'`. An accepted configuration and an
externally confirmed update are different states: pending synchronization must remain visible without
pretending the save failed or requiring the user to resubmit the same changes. Do not emulate atomic
saves with unrelated per-key requests and then report the whole group as saved.

Status settings and buttons share `StatusConfigurationProvider` and
`GET/PUT /v6/guilds/:guildID/servers/:serverID/status/configuration`. The PUT includes the configuration
and saved revision; conflicts preserve both card drafts and offer explicitly reloading the accepted
values. A button modal applies changes to the buttons card's draft. Each group automatically saves its changes alongside the sibling's saved values, sharing a revision
and a single write in flight. The preview combines both drafts; publication waits for pending changes
to finish saving.

Autoroles have no separate activation flag: every stored autorole is active. Adding selects and
confirms a role; deleting removes future automatic assignment without stripping existing members.

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
still allow returning to a previous page or changing the page size. Put `<Pagination standalone />`
in `AdminPanel.footer`, outside the table and its horizontal scrolling body, so the controls stay
visible on narrow screens. The default table-row output and `colSpan` remain available for older
layouts. Public lists use the same `PaginationControls` presentation while retaining their own query
shape and page-size limits. Both exports live in `components/Pagination.tsx`.

Lists whose API returns a complete snapshot use `createListPagination` from
`hooks/createListPagination.ts`. It slices the displayed rows with the shared 25/50/250/500 page sizes,
returns `query`, `total`, `onChange` and `visible` for the existing `Pagination`, and clamps the page
after deletion or filtering. Pass a search accessor as `resetKey` to return to the first page when the
search changes. Controls stay hidden when the complete list fits within 25 rows. Each list owns its
pager, including GMod and Discord bans and the account's sessions and exports.

Keep full snapshots for quotas, permission checks, selectors, cross-platform ban indicators and bulk
actions. Paginate only the rendered collection, so changing pages never changes an editor's draft or
the scope of an action such as marking all notifications as read. New entries navigate to their page.
This hook changes presentation; existing API limits and server pagination contracts still apply.
Use wrapping action groups and horizontal overflow for wide data; do not make the whole dashboard
scroll horizontally.

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
- Test autosave batching, validation, in-flight edits, failed save/retry, modal cancellation, accessible actions and table states.

Dashboard ESLint rules reject copied native `btn` controls and clickable `<i>` actions. Use `Button`
and `IconButton`; the screenshot lightbox is the explicit specialized exception.

## Administration analytics and read-only previews

`AdminRegistrationsChart` renders 7/30/90 consecutive UTC daily buckets with color and line patterns,
an empty state and an expandable exact-value table. `AdminDistributionChart` compares counts on a
shared scale without assuming exclusive categories. Their feature page owns API requests and validation.
`DiscordStatusPreview.caption` can describe a read-only inspection instead of the settings editor.
`DiscordMessagePreview` reuses the safe `DiscordText` formatting subset for local examples; it never
interprets HTML or sends messages. Keep examples and effective saved configuration visibly distinct.
