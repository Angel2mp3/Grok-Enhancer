# **<p align="center"> ★ Grok Enhancer ★ </p>**

**<p align="center"> The all-in-one Grok userscript that you could ever need! </p>**

<p align="center">
  <a href="https://github.com/Angel2mp3"><img src="https://img.shields.io/badge/Version-1.0-007EC6?style=for-the-badge&logo=github&logoColor=white" alt="Version"/></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-22863A?style=for-the-badge" alt="MIT License"/></a>
  <a href="https://ko-fi.com/angelsoftware"><img src="https://img.shields.io/badge/Support_on-Ko--fi-FF5E5B?style=for-the-badge&logo=ko-fi&logoColor=white" alt="Support on Ko-fi"/></a>
</p>

---

### ⬇️ One-Click Install

> Requires a userscript manager like [Violentmonkey](https://violentmonkey.github.io/get-it/) or [Tampermonkey](https://www.tampermonkey.net/) (Chrome / Edge / Firefox / Safari)

<p align="center">
  <a href="https://github.com/Angel2mp3/Grok-Enhancer/raw/main/Grok-Enhancer.user.js">
    <img src="https://img.shields.io/badge/⬇️_Install_Grok_Enhancer-Click_Here-4CAF50?style=for-the-badge" alt="Install Grok Enhancer"/>
  </a>
</p>

**Click the button above → your userscript manager will open and ask you to confirm the install.**

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

### 🗑️ Bulk Deleter

Adds **Delete All** buttons to multiple Grok pages for quick bulk cleanup:

| Page                     | What it deletes                               |
| ------------------------ | --------------------------------------------- |
| `/files`                 | All uploaded files and assets                 |
| `/share-links`           | All shared conversation links                 |
| `/deleted-conversations` | Permanently deletes all trashed conversations |

Each button matches Grok's native styling and shows a confirmation dialog before proceeding. Also adds a **Restore All** button on the deleted-conversations page.

---

### 🚫 Hide Popups

Automatically dismisses Grok's satisfaction survey popups, "Think Harder/Quick Response", suggestion popups, and more so they don't interrupt your workflow.

---

### 💎 Hide Premium Upsells

Hides all SuperGrok upgrade prompts and upsell banners across the entire interface — including the sidebar badge, header upgrade button, model menu upsells, "Upgrade plan" menu items, inline banners, and any upgrade dialogs/overlays.

---

### 🏋️ Hide Heavy Model

Hides the "Heavy" model option from the model selector dropdown. CSS-only, zero overhead — only activates when a model menu is open.

---

### 🔒 Auto Private Chat

In enabled, automatically enables private chat mode when you open Grok.

---

### ↕️ Disable Auto Scroll

Stops Grok from automatically scrolling to the bottom as responses stream in, letting you read at your own pace without losing your position.

---

### 🔞 Streamer Mode

Automatically hides conversations with sensitive names from both the sidebar and the "See all" menu as well. Matching chats are completely hidden (not blurred) — they are **not deleted**, just visually removed while Streamer Mode is enabled. Turning it off restores them instantly.

**Categories detected:**

- **NSFW / Sexual** — explicit terms, porn site names, kink/fetish terms, etc.
- **Personal / Medical** — STDs, pregnancy, addiction, mental health, suicide, self-harm
- **Abuse / Assault** — domestic abuse, sexual assault, harassment, stalking, etc.
- **Drugs** — recreational drugs, vaping, smoking
- **Legal** — lawsuits, attorneys, court, felonies, arrest, legality
- **Guns / Ammo / Self-Defense** — firearms, calibers, ammo types, concealed/open carry, specific brands
- **Bladed & Melee Weapons** — knives, swords, machetes, switchblades, daggers, bayonets, nunchucks, and similar
- **Archery & Projectiles** — bows, crossbows, slingshots, blowguns
- **Less-Lethal Tools** — tasers, stun guns, pepper spray, batons, kubotans


Uses a single pre-compiled regex for performance — no lag even with hundreds of sidebar items.

---

### 💡 Imagine Menu

A dedicated floating panel for Grok's `/imagine` video and image generation — activated by the **💡 button** that appears near the main settings FAB.

| Option                       | Description                                                                                                                                                           |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Enabled / Disabled**       | Master toggle for all Imagine Menu interception                                                                                                                       |
| **Extend Video Length Bypass**      | Bypass the extend-video-length limit (1–30 seconds) — injected into each chat POST request before it's sent                                                           |
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

Click the **✦ button** in the bottom-right of any Grok page to open the settings panel. Every feature can be toggled individually and is saved automatically.

**Default state of each toggle**

| Toggle                | Default | Description                                      |
| --------------------- | ------- | ------------------------------------------------ |
| SuperGrok Logo        | ✅ On    | Replace greeting logo                            |
| Clickable Links       | ✅ On    | Linkify URLs and @mentions                       |
| DeMod                 | ✅ On    | Strip moderation flags                           |
| Rate Limit            | ✅ On    | Show query counter in input bar                  |
| Deleter               | ✅ On    | Inject Delete All buttons on bulk pages          |
| Hide Share Button     | ❌ Off   | Hide the Share button on conversations           |
| Hide Popups           | ❌ Off   | Auto-dismiss satisfaction & Think Harder popups  |
| Hide Premium Upsells  | ❌ Off   | Hide all SuperGrok upgrade prompts               |
| Hide Heavy Model      | ❌ Off   | Hide the Heavy model option from the selector    |
| Auto Private Chat     | ❌ Off   | Auto-enable private mode on load                 |
| Disable Auto Scroll   | ❌ Off   | Stop Grok from auto-scrolling during responses   |
| Streamer Mode         | ❌ Off   | Hide sensitive chat names from sidebar & dialogs |
| Imagine Menu          | ❌ Off   | Enable the Imagine Menu floating panel           |
| Debug                 | ❌ Off   | Log DeMod / custom style activity to console     |
| Custom Styles         | —       | Manage button opens style editor dialog          |

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

This script builds upon and was inspired by the work of these excellent scripts:

| Script                  | Author                 | Link                                   |
| ----------------------- | ---------------------- | -------------------------------------- |
| Grok DeMod              | **UniverseDev**        | [Greasy Fork](https://greasyfork.org/) |
| Grok Rate Limit Display | **Blankspeaker**       | [Greasy Fork](https://greasyfork.org/) |
| Grok Ultimate Manager   | **Aggressive_Tip4777** | [Greasy Fork](https://greasyfork.org/) |

---

<p align="center"> Made with ❤️ by Angel · MIT License </p>
