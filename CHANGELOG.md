# Changelog

All notable changes to Grok Enhancer are documented here. This is the first published changelog entry — v1.0 itself was not previously documented.

## [2.4.0] — 2026-07-22

### Added
- **Theme Schedule**: new panel section that auto-switches Grok between Light and Dark on a daily clock (e.g. Light from 8AM and then Dark from 07:00PM), with overnight ranges supported. Applies via Grok's own Appearance buttons when available; otherwise falls back to a best-effort class/storage switch (Grok's theme persistence isn't public, so the fallback self-corrects on the next full page load if Grok ignores it).
- **Menu reorganization** - Reorganised the menu again into more sub-dropdowns to make finding things easier.
- **Mobile detection**: the script now detects coarse-pointer/touch devices once at boot for improved mobile support.
- **PIN protection for the remaining privacy controls**: when a PIN is set, turning off Auto-Lock on Idle, turning off Blur Chats, opening the Privacy Custom Words manager, and disabling any Privacy Category now require the PIN — same as disabling Privacy Mode or resetting the PIN already did.
- **First-time privacy notice**: the first time you set a PIN or enable Privacy Mode from the panel, a one-time dialog explains what the protections do (anti-snooping, not encryption) and how to recover from a forgotten PIN.
- **Panic hotkey auto-switch**: if Privacy Mode turns on while you're inside a chat that matches your privacy words/categories, you're now moved to a new chat instead of just having the entry hidden from the sidebar.
- **Hide Fast model**: "Fast" joins Heavy, Expert, and Auto in the Hide Models dropdown.
- **Identity masking in Grok's settings dialog**: Hide Username/Email/Avatar now also apply inside the settings "Account" panel — shown as a "Hidden by Privacy Mode" placeholder, plus two new options: **Hide X Username** (also strips the link so the handle can't leak via hover) and **Hide Birth Year**.
- **Hide Popups** now also hides the "How was your call?" voice-call rating popup.

### Fixed
- **Prompt Library insertion on desktop**
- **Hidden menu won't come back on mobile**: the triple-tap restore zone was hardcoded to 60px from the bottom-right corner, but on mobile the menu button sits ~80px higher (safe-area offset), so tapping "the same spot" never counted. Restore now tests against the button's actual last position, listens to `pointerup` in capture phase (rapid taps were being swallowed as double-tap-zoom), and allows a wider tap window on mobile.
- **Usage bar stuck orange / not loading on mobile**: the rate-limit badge's orange was the API-error fallback (`/rest/rate-limits` failing on mobile networks). The fallback is now neutral gray and retries automatically in the background; the weekly usage strip also retries a failed first load instead of waiting up to 5 minutes.
- **Auto-Lock on idle on mobile**: touch activity (`touchstart`/`touchmove`/`pointerdown`) now counts as activity, and returning to a backgrounded tab locks immediately if the idle threshold already elapsed — mobile browsers suspend timers in background tabs, which previously cancelled the lock entirely.
- **Privacy masking flash**: sensitive chat names and profile/settings identity could paint unmasked for ~250ms (long enough to be caught in a screen recording) because masking ran inside a throttled scan. Privacy marking now runs synchronously in the mutation observer — before the browser paints — and privacy CSS is injected at document-start instead of after `<body>` exists.
- **Tab title leak**: after triggering Privacy Mode / Panic Hotkey in a sensitive chat, it failed to do anything, now instead if the chat open matches that, it immediately switches to a new chat, so the result is the title of the chat in the browser tab is not longer there, and the current chat messages are not longer on screen, which is far better than before.
- **General bugs and issues fixed**

### Changed
- **Import/Export merged**: the two separate settings rows are now a single "Backup / Restore" row with Export and Import buttons side by side.
- **Panic hotkey skipped on mobile**: no physical keyboard, and the hotkey row was already hidden there.

## [2.2.0] — 2026-07-17

### Added
- **Prompt Library**
- **import/export settings** 
- **Weekly Usage Bar**
- **Hide Composer Suggestions/Autocomplete** 
- **Hide Private Chat Notice** 
- **Hide Automations** 

### Changed
- **Imagine Menu** options will only be enabled and active when the menu is visible by turning it on in the main menu settings
- Video-length inject tries additional payload paths before the forced fallback.

### Fixes & Performance
- **Menu disappearing on Desktop but especially mobile devices is now fixed**. A update on Grok's side caused the menu to constantly be overridden by the page code and then be hidden. More protections were added in an attempt to prevent this from happening again.
- **Master content observer** is throttled (trailing-edge, ~250ms) instead of running many document-wide scans per mutation batch; premium-dismiss and downloadable-media scans are skipped when a batch added no elements.
- **Logo replacement** no longer rescans every SVG on the page per mutation batch — it runs on URL change plus a few delayed retries.
- **Rate Limit badge**: composer/body mutation observers are debounced (~300ms), the 60s usage-cleanup interval only runs while the feature is enabled, and redundant `localStorage` writes are skipped when the saved state hasn't changed.
- **Disable Auto Scroll is fixed** as it no longer creates a fresh timeout per wheel event, and is only registered while Disable Auto Scroll is enabled.
- **"Upgrade to Heavy" button scan** now tags already-checked buttons and skips them, instead of regex-testing every button on the page per mutation batch.

### Removed
- **DeMod (Moderation Bypass)** removed entirely — it no longer works: Grok-side changes broke the response interception it relied on. This also removes the settings toggle, the panel status row, and the WebSocket/fetch response rewriting that existed only for it. The **Debug** toggle is kept (shared by other modules; its storage key is unchanged).

### Notes
- If you have anything to contribute feel free to open a pull request as well as if you find any bugs or want to request a new feature open an issue.

## [2.0] — 2026-07-02

### Added
- **Streamer Mode overhaul**: custom sensitive-word list editor (add/delete plain-text or regex, persisted), a configurable "Panic Hotkey" (default `Ctrl+Shift+H`) to instantly toggle Streamer Mode from anywhere, a live "(N hidden)" badge showing how many sidebar/menu items are currently masked, and active-chat title masking (tab title + on-page heading hidden while inside a sensitive chat). Added 4 new built-in sensitive-word categories. Sidebar re-scans on mutation are now scoped to newly-added nodes instead of the whole document.
- **Menu UI overhaul** - changed a lot of the menu to look nicer/more compact with many options under drop downs.
- **PIN Lock**: set a 4-digit PIN (stored as a SHA-256 hash, never in the clear) that's required to turn Privacy Mode off — whether via the panel checkbox or the Panic Hotkey — and to change or reset the PIN itself. The settings panel always opens freely; the PIN only gates disabling Privacy Mode. With no PIN set, nothing is gated. **NOTE: This can be entirely bypassed if the script is disabled from your userscript manager, it is not possible for this to be changed.**
- **Rate Limit Display "KHROTU" rework** (ported from Blankspeaker & CursedAtom): local usage-history tracking reconciled against Grok's own API-reported count, per-model request sniffing.
- New **"Hide Follow-up Prompts"** toggle. 
- Model-dropdown hiding extended from Heavy-only to individually toggleable **Heavy / Expert / Auto** via a new collapsible sub-panel. New CSS rule for the rotating-message SuperGrok sidebar-footer banner.
- New **sidebar nav hiding**: individually toggleable "Hide Build", "Hide Imagine", and "Hide Skills and Connectors" (UI Cleanup section) remove those entries from the sidebar menu. Matched by label text rather than link URL so they keep working if Grok changes the routes.
- New **Privacy identity toggles**: "Hide Username", "Hide Email", and "Hide Avatar" hide the sidebar footer's account name, email, and profile picture. All three default **on** and apply automatically whenever Privacy Mode is enabled, but can be switched off individually.
- Settings panel reorganized into collapsible sections: Core, UI Cleanup, Privacy & Streamer Mode, Chat Management, Advanced. New **"Hidden Menu Survives Refresh"** toggle. Mobile CSS repositioning so the FAB/panels no longer sit behind the composer.
- **"Hide Popups"** now also hides the "Grok Build" beta CLI install promo card (dismissible banner shown to SuperGrok/X Premium+ subscribers).

### Changed
- "Hide Premium Upsells" now defaults **ON** (was off).
- Menu button hide-on-refresh is now opt-in via "Hidden Menu Survives Refresh" instead of always persisting across page loads.
- Model-dropdown hide section reworked from a single "Hide Heavy Model" boolean into the 3-way Heavy/Expert/Auto dropdown; style element id changed from `ge-hide-heavy-css` to `ge-hide-models-css`.
- Smart Retry's leet-speak obfuscation dictionary trimmed down to mostly NSFW-adjacent terms
- Internal refactors

### Fixed
- Auto-Retry could get permanently stuck after hitting its max-retries cap even after moderation later cleared; it now resets after 5s with no moderation signal.
- Base64 `data:` image URLs produced bogus/garbled download filenames; now falls back to `grok_<timestamp>.<ext>`.
- Mobile rate-limit badge could overlap the composer's placeholder text on small screens.
- Privacy Mode and the Panic Hotkey silently did nothing when toggled on an already-loaded page (worked only right after a hard refresh): the scoped-scan helper backing the v2.0 rescan refactor rejected `document` as a scan root, so every full rescan (initial load, toggle-on, hotkey, word-list edits) found zero matches.
- PIN Lock gated the wrong action — it prompted for the PIN when opening the settings panel, while disabling Privacy Mode (via the checkbox or the Panic Hotkey) and the Set PIN/Reset buttons required no PIN at all. The panel now always opens freely; the PIN is required to turn Privacy Mode off and to change/reset the PIN.

### Removed
- The entire **Bulk Deleter** feature. This is no longer viable due to the server side system changes.
- Dead no-op `ge_injectCustomStyles` stub left over from a prior removal.
