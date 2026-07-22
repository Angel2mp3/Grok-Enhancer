# **<p align="center"> ★ Grok Enhancer ★ </p>**

**<p align="center"> The all-in-one Grok userscript that you could ever need! </p>**

<p align="center">
  <a href="https://github.com/Angel2mp3"><img src="https://img.shields.io/badge/Version-2.2.0-0D47A1?style=for-the-badge&logo=github&logoColor=white" alt="Version"/></a>
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

## ✨ Features

### ★ SuperGrok Logo

Replaces the default Grok greeting logo with the SuperGrok logo.

---

### 💎 Hide Premium Upsells

Hides all SuperGrok upgrade prompts and upsell banners across the entire interface — including the sidebar badge, header upgrade button, model menu upsells, "Upgrade plan" menu items, inline banners, and any upgrade dialogs/overlays.

---

### 🕑 Rate Limit Display

Injects a live counter into the Grok query bar showing your remaining queries and reset time for the current model. Updates automatically and includes a countdown timer when you're rate limited.

---

### 📊 Weekly Usage Bar

Injects a small usage bar very similar to the one in settings/usage under the composer, it **shows your weekly usage divided by what its being used by, such as chat / imagine / grok build / api, ect.**

---

### 🌗 Day/Night Theme Switcher

Allows you to set the times you want day/night mode to enable, as Grok doesnt have this for some reason.

---

### 🚫 Hide Popups

Automatically dismisses Grok's satisfaction survey popups, "Think Harder/Quick Response", suggestion popups, the "How was your call?" voice-call rating popup, and more.

---

### 💬 Hide Follow-up Prompts

Hides Grok's suggested follow-up prompt chips so they don't clutter the end of a response.

---

### 🏋️ Hide Models (Heavy / Expert / Auto / Fast)

Hides specific model options from the model selector dropdown. Individually toggle **Heavy**, **Expert**, **Auto**, and **Fast** from a collapsible sub-panel (its trigger shows a live summary, e.g. `Heavy, Auto`, or `None`). CSS-only, zero overhead — only activates when a model menu is open. Hiding Heavy also hides any "Upgrade to Heavy" buttons.

---

### 🧭 Hide Sidebar Nav Items

Individually hide the **Build**, **Imagine**, **Skills and Connectors**, and **Automations** entries from the main sidebar menu. Matched by label text rather than link URL, so they keep working even if Grok changes the underlying routes.

---

### 🔒 Auto Private Chat

If enabled, automatically enables private chat mode when you open Grok.

---

### 🕶️ Hide Private Chat Notice

Hides the "This chat won't appear in your history and will not be used to train models." banner shown above private/temporary chats. CSS-only, zero overhead.

---

### ↕️ Disable Auto Scroll

Stops Grok from automatically scrolling to the bottom as responses stream in, letting you read at your own pace without losing your position.

---

### 🔞 Privacy Mode

Automatically hides or blurs conversations with sensitive names from both the sidebar and the "See all" menu. Matching chats are **not deleted** — they are either hidden or blurred while Privacy Mode is enabled. Turning it off restores them instantly.

**Categories detected:**

- **NSFW / Sexual** — explicit terms, porn site names, kink/fetish terms, etc.
- **Personal / Medical** — STDs, pregnancy, addiction, mental health, self harm, etc.
- **Abuse / Assault** — domestic abuse, SA, harassment, stalking, etc.
- **Drugs** — names of drugs, vaping, smoking, etc.
- **Legal** — lawsuits, attorneys, court, felonies, arrest, legality
- **Guns / Self-Defense** — firearms, calibers, ammo types, specific brands
- **And more!**


Uses a single pre-compiled regex for performance — no lag even with hundreds of sidebar items.

**Blur Chats (instead of hide)** — optionally blur sensitive chats instead of hiding them. Default is hide.

**Privacy Custom Words** — add your own words/phrases in the settings panel to hide/blur chats matching terms not already covered by the built-in categories.

**Panic Hotkey** — set a keyboard shortcut (default `Ctrl+Shift+H`) that instantly toggles Privacy Mode on or off from anywhere, including while typing in the chat composer. Hidden automatically on mobile, since there's no keyboard to trigger it. If you're inside a chat that matches your privacy settings when it turns on, you're automatically moved to a new chat and the tab title is masked.

**Auto-Lock on Idle** — optionally turns Privacy Mode **on** automatically after a period of no mouse, keyboard, scroll, or tab activity (default 5 minutes, configurable). Useful if you step away from an unlocked machine.

**PIN Lock** — set a 4-digit PIN (in the settings panel) to require it before Privacy Mode can be turned **off**, whether that's via the panel checkbox or the Panic Hotkey. Once a PIN is set it also protects turning off Auto-Lock on Idle, turning off Blur Chats, opening the Privacy Custom Words manager, and disabling any privacy category. The settings panel itself always opens freely — the PIN only stops someone else from weakening your protections. Changing or resetting an existing PIN also requires entering it first. **This is not foolproof: it's a deterrent against casual snooping, not real encryption, and uninstalling the script from the userscript manager bypasses it entirely.**

**Forgot your PIN?** Clearing site data for grok.com (or deleting the script's `GrokEnhancer_…` localStorage keys in your browser's dev tools) wipes all of the script's settings, including the PIN. If you want to keep your other settings, export them first via **Other → Export Settings** at the bottom of the menu, then re-import after the reset.

**Hide Username / Hide Email / Hide Avatar / Hide X Username / Hide Birth Year** — hide your account name, email, profile picture, linked X handle, and/or birth year. These cover the sidebar footer *and* Grok's settings "Account" panel — in settings they show a "Hidden by Privacy Mode" placeholder instead of going blank, so it's clear why they're missing (hiding the X username also removes its link, so the handle can't leak via hover). All five default **off** and apply automatically whenever Privacy Mode is enabled, but each can be switched on individually.

---

### 💡 Imagine Menu

A dedicated floating panel for Grok's `/imagine` video and image generation — activated by the **💡 button** that appears near the main settings menu.

| Option                       | Description                                                                                                                                                           |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Enabled / Disabled**       | Master toggle for all Imagine Menu interception                                                                                                                       |
| **Extend Video Length Bypass (PATCHED)** | Bypass the extend-video-length limit (1–30 seconds) — injected into each chat POST request before it's sent                                                           |
| **Auto-Retry on Moderation** | Automatically re-submits the prompt when Grok flags or blocks a generation                                                                                            |
| **Smart Retry**              | On each retry, rewrites the prompt using a different obfuscation strategy (leet speak, zero-width character insertion, synonym swaps) to slip past moderation filters |
| **Persistent Prompt**        | Saves your last prompt before every retry — if Grok clears the input box after a block, the prompt is automatically restored                                          |
| **Max Retries**              | How many times Auto-Retry will attempt before giving up                                                                                                       |
| **Disable Video Loop**       | Stops generated videos from auto-looping when playback finishes                                                                                                       |
| **Hide Overlay Controls**    | Hides the control overlay that appears over generated videos                                                                                                          |
| **Prompt Library → Open**    | Folders, tags, search, insert into composer, Imagine “Use” inject, and versioned import/export JSON                                                                   |

A live **status line** inside the panel shows intercept on/off, last video-length path (or “maybe ignored”), retry progress, and moderation reason when detected.

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
- Filename **templates** (`{date}`, `{id}`, `{type}`, `{prompt}`) with progress UI for multi-file queues
- Media database is automatically trimmed after 2,000 entries to prevent memory growth in long sessions

---

### 🔗 Clickable Links
**NOTE: (mostly not needed anymore since Grok finally semi-fixed this but helpful for ones that arent clickable)**

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

## 🔧 Technical Details

- **Run-at:** `document-start` — starts intercepting before any content loads
- **No external dependencies** — pure vanilla JS, no jQuery or library downloads
- **GM APIs used:** `GM_xmlhttpRequest` (binary downloads), `unsafeWindow` (fetch interception)
- **SPA-aware:** Monitors URL changes to re-apply features across Grok's single-page navigation
- **Settings** are stored in `localStorage` under `GrokEnhancer_*` keys — local only, never synced
- **In-memory caches** (e.g. media database) are session-only and cleared on page refresh

---

## 🔏 Privacy

This script runs entirely in your browser — no data is sent anywhere by the script itself.

- **No analytics or telemetry** of any kind
- **No external requests** — all network calls go to grok.com's own API (same as normal usage)
- **Custom Styles** only modifies outgoing request bodies locally — no external server involved
- The `@grant unsafeWindow` permission is required solely to intercept fetch for Custom Styles, the Media Downloader, and the Weekly Usage Bar

---

## 🙏 Credits

This project incorporates elements from these fantastic scripts:

| Script                  | Author                 | Link                                   |
| ----------------------- | ---------------------- | -------------------------------------- |
| Grok Rate Limit Display | **KHROTU, Blankspeaker, CursedAtom** | [Greasy Fork](https://greasyfork.org/en/scripts/558017-grok-rate-limit-display) |


---

<p align="center"> Made with ❤️ by Angel · MIT License </p>
