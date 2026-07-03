# **<p align="center"> ★ Grok Enhancer ★ </p>**

**<p align="center"> The all-in-one Grok userscript that you could ever need! </p>**

<p align="center">
  <a href="https://github.com/Angel2mp3"><img src="https://img.shields.io/badge/Version-2.0-0D47A1?style=for-the-badge&logo=github&logoColor=white" alt="Version"/></a>
  <img src="https://img.shields.io/endpoint?url=https%3A%2F%2Fuserscript-install-tracker.vercel.app%2Fapi%2Fbadge%3Frepo%3DGrokEnhancer&style=for-the-badge&color=4A148C" alt="Installs"/>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-424242?style=for-the-badge" alt="MIT License"/></a>
</p>

---

### ⬇️ One-Click Install

> Requires a userscript manager like [Violentmonkey](https://violentmonkey.github.io/get-it/) or [Tampermonkey](https://www.tampermonkey.net/) (Chrome / Edge / Firefox / Safari)

<p align="center">
  <a href="https://github.com/Angel2mp3/Grok-Enhancer/actions">
  </a>
  <a href="https://userscript-install-tracker.vercel.app/install/GrokEnhancer.user.js">
    <img src="https://img.shields.io/badge/⬇️_Install_Grok_Enhancer-Click_Here-B71C1C?style=for-the-badge" alt="Install Grok Enhancer"/>
  </a>
</p>

**Click the button above → your userscript manager will open and ask you to confirm the install.**

---

## 📑 Contents

- [Features](#-features)
- [Settings](#️-settings)
- [Technical Details](#-technical-details)
- [Privacy](#-privacy)
- [Credits](#-credits)

---

## ✨ Features

### ★ SuperGrok Logo

Replaces the default Grok greeting logo with the SuperGrok logo.

### 🛠️ DeMod (Moderation Bypass)

Intercepts Grok's fetch and WebSocket responses and strips moderation flags before they reach the UI. Includes content recovery for hard-blocked responses.

**Status indicators shown in the settings panel:**

| Status        | Meaning                                                                 |
| ------------- | ----------------------------------------------------------------------- |
| 🟢 Safe       | Response passed through clean — no flags detected                       |
| 🟠 Flagged    | Response had soft flags (e.g. `isFlagged: true`) — DeMod stripped them  |
| 🔴 Blocked    | Response was hard-blocked — DeMod attempted to recover the real content |
| 🟡 Recovering | Currently re-fetching blocked content                                   |

---

### 🕑 Rate Limit Display

Injects a live counter into the Grok query bar showing your remaining queries and reset time for the current model. Updates automatically and includes a countdown timer when you're rate limited.

---

### 🚫 Hide Popups

Automatically dismisses Grok's satisfaction survey popups, "Think Harder/Quick Response", suggestion popups, and more so they don't interrupt your workflow.

---

### 💬 Hide Follow-up Prompts

Hides Grok's suggested follow-up prompt chips so they don't clutter the end of a response.

---

### 💎 Hide Premium Upsells

Hides all SuperGrok upgrade prompts and upsell banners across the entire interface — including the sidebar badge, header upgrade button, model menu upsells, "Upgrade plan" menu items, inline banners, and any upgrade dialogs/overlays.

---

### 🏋️ Hide Models (Heavy / Expert / Auto)

Hides specific model options from the model selector dropdown. Individually toggle **Heavy**, **Expert**, and **Auto** from a collapsible sub-panel (its trigger shows a live summary, e.g. `Heavy, Auto`, or `None`). CSS-only, zero overhead — only activates when a model menu is open. Hiding Heavy also hides any "Upgrade to Heavy" buttons.

---

### 🧭 Hide Sidebar Nav Items

Individually hide the **Build**, **Imagine**, and **Skills and Connectors** entries from the main sidebar menu. Matched by label text rather than link URL, so they keep working even if Grok changes the underlying routes.

---

### 🔒 Auto Private Chat

In enabled, automatically enables private chat mode when you open Grok.

---

### ↕️ Disable Auto Scroll

Stops Grok from automatically scrolling to the bottom as responses stream in, letting you read at your own pace without losing your position.

---

### 🔞 Privacy Mode

Automatically hides or blurs conversations with sensitive names from both the sidebar and the "See all" menu. Matching chats are **not deleted** — they are either hidden or blurred while Privacy Mode is enabled. Turning it off restores them instantly.

**Categories detected:**

- **NSFW / Sexual** — explicit terms, porn site names, kink/fetish terms, etc.
- **Personal / Medical** — STDs, pregnancy, addiction, mental health, suicide, self-harm
- **Abuse / Assault** — domestic abuse, SA, harassment, stalking, etc.
- **Drugs** — recreational drugs, vaping, smoking
- **Legal** — lawsuits, attorneys, court, felonies, arrest, legality
- **Guns / Ammo / Self-Defense** — firearms, calibers, ammo types, concealed/open carry, specific brands
- **Bladed & Melee Weapons** — knives, swords, machetes, switchblades, daggers, bayonets, nunchucks, and similar
- **Archery & Projectiles** — bows, crossbows, slingshots, blowguns
- **Less-Lethal Tools** — tasers, stun guns, pepper spray, batons, kubotans


Uses a single pre-compiled regex for performance — no lag even with hundreds of sidebar items.

**Blur Chats (instead of hide)** — optionally blur sensitive chats instead of hiding them. Default is hide.

**Privacy Custom Words** — add your own words/phrases in the settings panel to hide/blur chats matching terms not already covered by the built-in categories.

**Panic Hotkey** — set a keyboard shortcut (default `Ctrl+Shift+H`) that instantly toggles Privacy Mode on or off from anywhere, including while typing in the chat composer. Hidden automatically on mobile, since there's no keyboard to trigger it.

**PIN Lock** — set a 4-digit PIN (in the settings panel) to require it before Privacy Mode can be turned **off**, whether that's via the panel checkbox or the Panic Hotkey. The settings panel itself always opens freely — the PIN only stops someone else from switching Privacy Mode off once it's on. Changing or resetting an existing PIN also requires entering it first. With no PIN set, everything behaves as if PIN Lock didn't exist.

**Hide Username / Hide Email / Hide Avatar** — hide your account name, email, and/or profile picture in the sidebar footer. All three default **off** and apply automatically whenever Privacy Mode is enabled, but each can be switched on individually if you want that piece of your identity hidden while Privacy Mode is on.

---

### 💡 Imagine Menu

A dedicated floating panel for Grok's `/imagine` video and image generation — activated by the **💡 button** that appears near the main settings FAB.

| Option                       | Description                                                                                                                                                           |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Enabled / Disabled**       | Master toggle for all Imagine Menu interception                                                                                                                       |
| **Extend Video Length Bypass (PATCHED)**      | Bypass the extend-video-length limit (1–30 seconds) — injected into each chat POST request before it's sent                                                           |
| **Auto-Retry on Moderation** | Automatically re-submits the prompt when Grok flags or blocks a generation                                                                                            |
| **Smart Retry**              | On each retry, rewrites the prompt using a different obfuscation strategy (leet speak, zero-width character insertion, synonym swaps) to slip past moderation filters |
| **Persistent Prompt**        | Saves your last prompt before every retry — if Grok clears the input box after a block, the prompt is automatically restored                                          |
| **Max Retries**              | How many times Auto-Retry will attempt before giving up (1–20)                                                                                                        |
| **Disable Video Loop**       | Stops generated videos from auto-looping when playback finishes                                                                                                       |
| **Hide Overlay Controls**    | Hides the control overlay that appears over generated videos                                                                                                          |
| **Prompts → Manage**         | Opens the Prompt Manager dialog to save, activate, and inject stored prompts into every generation request                                                            |

A live **status line** inside the panel shows interception count, retry progress, and the currently active saved prompt.

---

### 🎨 Custom Response Styles

Create and manage custom response style instructions that get prepended to your messages. When a style is active, its instructions are injected into every chat POST request, telling Grok how to respond.

- **Manage** button in the settings panel opens a dialog to add, edit, delete, and activate/deactivate styles
- Styles are stored in `localStorage` and persist across sessions
- Active style instructions are prepended to the user message field via fetch interception

---

### 📥 Media Downloader

Intercepts Grok's image and video API responses in the background and builds an in-memory lookup table of media URLs, filenames, prompts, and timestamps. Injects download buttons directly onto generated images and videos, and adds a **Mass Download** button on the `/imagine` favorites page.

- Downloads use the original HD URL where available
- Filenames include timestamp, model name, and prompt for easy organization
- Media database is automatically trimmed after 2,000 entries to prevent memory growth in long sessions

---

### 🔗 Clickable Links

Automatically converts URLs, domain names (including subdomains like `clips.twitch.tv` or `sub.site.com`), and `@mentions` in Grok responses into clickable links.

- Links appear **blue** by default and turn **purple** after you've visited them — just like a search engine
- Full subdomain support — the entire `subdomain.domain.tld` is captured, not just the root

**Smart @mention routing** — detects the nearest platform keyword (within ~150 characters of the `@mention`) and routes to the correct profile URL. Multiple platforms in the same message don't interfere with each other.

**Supported platforms**

| Detected keyword      | Links to                     |
| --------------------- | ---------------------------- |
| instagram / insta     | `instagram.com/user`         |
| tiktok / tik tok / TT | `tiktok.com/@user`           |
| snapchat / snap       | `snapchat.com/add/user`      |
| bluesky / bsky.app    | `bsky.app/profile/user`      |
| threads               | `threads.net/@user`          |
| twitch                | `twitch.tv/user`             |
| kick                  | `kick.com/user`              |
| youtube               | `youtube.com/@user`          |
| facebook / fb.com     | `facebook.com/user`          |
| linkedin              | `linkedin.com/in/user`       |
| github / gh           | `github.com/user`            |
| telegram / t.me       | `t.me/user`                  |
| soundcloud            | `soundcloud.com/user`        |
| spotify               | `open.spotify.com/user/user` |
| medium                | `medium.com/@user`           |
| substack              | `user.substack.com`          |
| patreon               | `patreon.com/user`           |
| ko-fi / kofi          | `ko-fi.com/user`             |
| vsco                  | `vsco.co/user`               |
| pinterest             | `pinterest.com/user`         |
| tumblr                | `tumblr.com/user`            |
| reddit                | `reddit.com/user/user`       |
| mastodon              | `mastodon.social/@user`      |
| discord               | `discord.com/users/user`     |
| twitter / x / tweet   | `x.com/user`                 |
| *(no context)*        | `x.com/user` (default)       |

---

## ⚙️ Settings

Click the **✦ button** in the bottom-right of any Grok page to open the settings panel. Every feature can be toggled individually and is saved automatically. The most-used toggles sit at the top; the rest are grouped into collapsible sections (click a section name to expand it) to keep the panel from getting unwieldy.

**Default state of each toggle**

| Section                | Toggle                        | Default | Description                                        |
| ----------------------- | ----------------------------- | ------- | --------------------------------------------------- |
| *(top-level)*            | SuperGrok Logo                | ✅ On    | Replace greeting logo                                |
| *(top-level)*            | DeMod                         | ✅ On    | Strip moderation flags                               |
| *(top-level)*            | Rate Limit                    | ✅ On    | Show query counter in input bar                      |
| UI Cleanup               | Hide Share Button             | ❌ Off   | Hide the Share button on conversations               |
| UI Cleanup               | Hide Popups                   | ❌ Off   | Auto-dismiss satisfaction & Think Harder popups      |
| UI Cleanup               | Hide Premium Upsells          | ❌ Off   | Hide all SuperGrok upgrade prompts                   |
| UI Cleanup               | Hide Follow-up Prompts        | ❌ Off   | Hide Grok's suggested follow-up prompt chips         |
| UI Cleanup               | Hide Models (Heavy/Expert/Auto) | ❌ Off | Sub-panel — individually hide models from the selector |
| UI Cleanup               | Hide Build                    | ❌ Off   | Hide the Build entry from the sidebar                |
| UI Cleanup               | Hide Imagine                  | ❌ Off   | Hide the Imagine entry from the sidebar              |
| UI Cleanup               | Hide Skills and Connectors    | ❌ Off   | Hide the Skills and Connectors entry from the sidebar |
| Privacy                  | Auto Private Chat             | ❌ Off   | Auto-enable private mode on load                     |
| Privacy                  | Privacy Mode                  | ❌ Off   | Hide/blur sensitive chat names from sidebar & dialogs |
| Privacy                  | Blur Chats (instead of hide)  | ❌ Off   | Blur sensitive chats instead of hiding them          |
| Privacy                  | Hide Username                 | ❌ Off   | Hide sidebar footer name while Privacy Mode is on    |
| Privacy                  | Hide Email                    | ❌ Off   | Hide sidebar footer email while Privacy Mode is on   |
| Privacy                  | Hide Avatar                   | ❌ Off   | Hide sidebar footer profile picture while Privacy Mode is on |
| Privacy                  | Privacy Custom Words          | —       | Manage button opens custom word list editor          |
| Privacy                  | Panic Hotkey                  | —       | Set the key combo that instantly toggles Privacy Mode (hidden on mobile) |
| Privacy                  | PIN Lock                      | ❌ Off   | Set PIN / Reset buttons — requires the PIN to turn Privacy Mode off or to change/reset it |
| Other                 | Clickable Links               | ✅ On    | Linkify URLs and @mentions                           |
| Other                 | Hidden Menu Survives Refresh  | ❌ Off   | Keep the settings FAB hidden across page reloads     |
| Other                 | Disable Auto Scroll           | ❌ Off   | Stop Grok from auto-scrolling during responses       |
| Other                 | Imagine Menu                  | ❌ Off   | Enable the Imagine Menu floating panel               |
| Other                 | Debug                         | ❌ Off   | Log DeMod / custom style activity to console         |
| Other                 | Custom Styles                 | —       | Manage button opens style editor dialog              |

---

## 🔧 Technical Details

- **Run-at:** `document-start` — starts intercepting before any content loads
- **No external dependencies** — pure vanilla JS, no jQuery or library downloads
- **GM APIs used:** `GM_xmlhttpRequest` (binary downloads), `unsafeWindow` (fetch/WebSocket interception)
- **SPA-aware:** Monitors URL changes to re-apply features across Grok's single-page navigation
- **Settings** are stored in `localStorage` under `GrokEnhancer_*` keys — local only, never synced
- **In-memory caches** (e.g. media database) are session-only and cleared on page refresh

---

## 🔏 Privacy

This script runs entirely in your browser — no data is sent anywhere by the script itself.

- **No analytics or telemetry** of any kind
- **No external requests** — all network calls go to grok.com's own API (same as normal usage)
- **DeMod** reads Grok's API responses in-memory to strip moderation flags; response content is never logged or transmitted
- **Custom Styles** only modifies outgoing request bodies locally — no external server involved
- The `@grant unsafeWindow` permission is required solely to intercept fetch/WebSocket for DeMod, Custom Styles, and the Media Downloader

---

## 🙏 Credits

This project incorporates elements from these fantastic scripts:

| Script                  | Author                 | Link                                   |
| ----------------------- | ---------------------- | -------------------------------------- |
| Grok DeMod | **UniverseDev** | [Greasy Fork](https://greasyfork.org/en/scripts/531147-grok-demod) |
| Grok Rate Limit Display | **KHROTU, Blankspeaker, CursedAtom** | [Greasy Fork](https://greasyfork.org/en/scripts/558017-grok-rate-limit-display) |


---

<p align="center"> Made with ❤️ by Angel · MIT License </p>
