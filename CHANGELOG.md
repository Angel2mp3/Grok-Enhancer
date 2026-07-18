# Changelog

All notable changes to Grok Enhancer are documented here. This is the first published changelog entry — v1.0 itself was not previously documented.

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
