// ==UserScript==
// @name         Grok Enhancer
// @namespace    https://grok.com/
// @version      2.0
// @description  All-in-one Grok enhancement
// @author       Angel
// @homepageURL  https://angelmakes.software/
// @source       https://github.com/Angel2mp3
// @license      MIT
// @match        https://grok.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=grok.com
// @updateURL    https://github.com/Angel2mp3/Grok-Enhancer/raw/main/Grok-Enhancer.user.js
// @downloadURL  https://github.com/Angel2mp3/Grok-Enhancer/raw/main/Grok-Enhancer.user.js
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @connect      assets.grok.com
// @connect      imagine-public.x.ai
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    if (window.location.hostname !== 'grok.com') return;

    // ══════════════════════════════════════════════════════════════
    //  Shared Utilities & Globals
    // ══════════════════════════════════════════════════════════════
    const _win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    const _originalFetch = _win.fetch.bind(_win);
    const _OriginalWebSocket = _win.WebSocket;
    const _encoder = new TextEncoder();
    const _decoder = new TextDecoder();

    // ── Media Database (populated from API interception for downloader) ──
    const _ge_mediaDatabase = new Map();

    function ge_extractPostId(url) {
        if (!url) return null;
        const matches = [...url.matchAll(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g)];
        return matches.length > 0 ? matches[matches.length - 1][0] : null;
    }

    function ge_sanitizeFilename(str) {
        return (str || '').replace(/[/\\?%*:|"<>]/g, '_').replace(/\s+/g, '_');
    }

    function ge_processApiMedia(apiData) {
        if (!apiData?.posts) return;
        for (const post of apiData.posts) {
            if (!post.id) continue;
            let entry = _ge_mediaDatabase.get(post.id);
            if (!entry) entry = { id: post.id, items: [] };

            function makeItem(src, fallback) {
                const isVideo = src.mediaType === 'MEDIA_POST_TYPE_VIDEO';
                const url = isVideo && src.hdMediaUrl ? src.hdMediaUrl : src.mediaUrl;
                if (!url) return null;
                const time = (src.createTime || fallback?.createTime || '').slice(0, 19).replace(/:/g, '-');
                const model = src.modelName || fallback?.modelName || '';
                const prompt = (src.originalPrompt || src.prompt || fallback?.originalPrompt || fallback?.prompt || '').trim();
                let ext = isVideo ? 'mp4' : 'jpg';
                if (src.mimeType === 'video/mp4') ext = 'mp4';
                else if (src.mimeType === 'image/png') ext = 'png';
                else if (src.mimeType === 'image/jpeg') ext = 'jpg';
                let slug = ge_sanitizeFilename(prompt);
                if (slug.length > 120) slug = slug.slice(0, 117) + '...';
                return {
                    id: src.id, url, type: isVideo ? 'video' : 'image', ext,
                    name: `${time || 'unknown'}_${src.id}${model ? '_' + ge_sanitizeFilename(model) : ''}${slug ? '_' + slug : ''}.${ext}`,
                    thumb: src.mediaUrl || '', createTime: src.createTime || fallback?.createTime || '', prompt
                };
            }

            if (post.mediaUrl) {
                const item = makeItem(post, null);
                if (item) entry.items.push(item);
            }
            if (post.childPosts?.length) {
                for (const child of post.childPosts) {
                    const item = makeItem(child, post);
                    if (item) entry.items.push(item);
                }
            }
            // Deduplicate by ID
            const seen = new Set();
            entry.items = entry.items.filter(i => { if (seen.has(i.id)) return false; seen.add(i.id); return true; });
            if (entry.items.length > 0) {
                _ge_mediaDatabase.set(post.id, entry);
                for (const item of entry.items) {
                    if (item.id !== post.id) _ge_mediaDatabase.set(item.id, entry);
                }
            }
        }
        // Cap the in-memory media database to prevent unbounded growth in long sessions
        if (_ge_mediaDatabase.size > 2000) {
            const trimTo = 1000;
            const keys = [..._ge_mediaDatabase.keys()];
            for (let i = 0; i < keys.length - trimTo; i++) _ge_mediaDatabase.delete(keys[i]);
            logDebug('[Downloader] Media database trimmed to', _ge_mediaDatabase.size, 'entries');
        } else {
            logDebug('[Downloader] Media database now has', _ge_mediaDatabase.size, 'entries');
        }
    }

    function getState(key, def) {
        try {
            const v = localStorage.getItem(key);
            if (v === null) return def;
            if (v === 'true') return true;
            if (v === 'false') return false;
            return JSON.parse(v);
        } catch (_) { return def; }
    }

    function setState(key, val) {
        try { localStorage.setItem(key, typeof val === 'boolean' ? String(val) : JSON.stringify(val)); }
        catch (_) { /* ignore */ }
    }

    // ── Feature toggles ──────────────────────────────────────────
    let featureLogo        = getState('GrokEnhancer_Logo', true);
    let featureLinks       = getState('GrokEnhancer_Links', false);
    let featureDeMod       = getState('GrokDeModEnabled', true);
    let featureRateLimit   = getState('GrokEnhancer_RateLimit', true);
    let featureDebug       = getState('GrokDeModDebug', false);
    let featureHideShare   = getState('GrokEnhancer_HideShare', false);
    let featureHidePopups  = getState('GrokEnhancer_HidePopups', false);
    let featureHidePremium = getState('GrokEnhancer_HidePremium', true);
    let featureHideHeavy   = getState('GrokEnhancer_HideHeavy', false);
    let featureHideExpert  = getState('GrokEnhancer_HideExpert', false);
    let featureHideAuto    = getState('GrokEnhancer_HideAuto', false);
    let featureHideFollowups = getState('GrokEnhancer_HideFollowups', false);
    let featureHideBuildNav  = getState('GrokEnhancer_HideBuildNav', false);
    let featureHideImagineNav = getState('GrokEnhancer_HideImagineNav', false);
    let featureHideSkillsNav = getState('GrokEnhancer_HideSkillsNav', false);
    let featureAutoPrivate = getState('GrokEnhancer_AutoPrivate', false);
    let featurePrivacyMode    = getState('GrokEnhancer_Streamer', false);
    let featurePrivacyBlur    = getState('GrokEnhancer_PrivacyBlur', false);
    let featureHideUsername   = getState('GrokEnhancer_HideUsername', false);
    let featureHideEmail      = getState('GrokEnhancer_HideEmail', false);
    let featureHideAvatar     = getState('GrokEnhancer_HideAvatar', false);
    let featureAutoLock       = getState('GrokEnhancer_AutoLock', false);
    let ge_autoLockMinutes    = getState('GrokEnhancer_AutoLockMinutes', 5);
    let featurePinLock        = getState('GrokEnhancer_PinLock', false);
    let ge_activeStyleId   = getState('GrokEnhancer_ActiveStyleId', null);

    // ── Imagine Menu state ──
    let featureImagineMenu  = getState('GrokEnhancer_ImagineMenu', false);
    let ge_imInterceptOn    = getState('GrokEnhancer_IM_Intercept', true);
    let ge_imVideoLength    = parseInt(getState('GrokEnhancer_IM_VideoLength', '30')) || 30;
    let ge_imAutoRetry      = getState('GrokEnhancer_IM_AutoRetry', false);
    let ge_imMaxRetries     = parseInt(getState('GrokEnhancer_IM_MaxRetries', '3')) || 3;
    let ge_imDisableLoop    = getState('GrokEnhancer_IM_DisableLoop', false);
    let ge_imHideOverlay    = getState('GrokEnhancer_IM_HideOverlay', false);
    let ge_imSmartRetry     = getState('GrokEnhancer_IM_SmartRetry', false);
    let ge_imPersistentPrompt = getState('GrokEnhancer_IM_PersistentPrompt', false);
    let featureDisableAutoScroll = getState('GrokEnhancer_DisableAutoScroll', false);
    let ge_imInterceptCount = 0;
    let ge_imRetryCount     = 0;
    let ge_imLastRetryTime  = 0;
    let ge_imActivePromptId = getState('GrokEnhancer_ActivePromptId', null);

    // ── Prompt Manager helpers ──
    function ge_getPrompts() {
        try { return JSON.parse(localStorage.getItem('GrokEnhancer_Prompts') || '[]'); }
        catch (_) { return []; }
    }
    function ge_savePrompts(p) { localStorage.setItem('GrokEnhancer_Prompts', JSON.stringify(p)); }

    function logDebug(...a) { if (featureDebug) console.log('[GrokEnhancer]', ...a); }
    function logError(...a) { console.error('[GrokEnhancer]', ...a); }

    // ── FAB triple-click hide/show ──────────────────────────────
    // Hidden state only survives a refresh when featureFabStayHidden is on; otherwise
    // the FAB always starts visible, even if it was hidden last session.
    let featureFabStayHidden = getState('GrokEnhancer_FabStayHidden', false);
    let _ge_fabHidden = featureFabStayHidden && getState('GrokEnhancer_FabHidden', false);
    let _ge_fabClicks = [];
    const GE_TRIPLE_CLICK_MS = 500; // max time window for 3 clicks

    // ══════════════════════════════════════════════════════════════
    //  1. SuperGrok Logo Replacement
    // ══════════════════════════════════════════════════════════════
    const SUPERGROK_VIEWBOX = '0 0 149 33';
    const SUPERGROK_INNER_HTML = `<path id="mark" d="M24.3187 12.8506L13.2371 21.0407L29.1114 5.07631V5.09055L33.6964 0.5C33.6139 0.616757 33.5315 0.730667 33.449 0.844576C29.9647 5.64871 28.2637 7.99809 29.629 13.8758L29.6205 13.8673C30.562 17.8683 29.5551 22.3051 26.304 25.5601C22.2053 29.6665 15.6463 30.5806 10.2449 26.8843L14.0108 25.1386C17.4581 26.4941 21.2297 25.899 23.9404 23.1851C26.651 20.4712 27.2597 16.5185 25.8973 13.2294C25.6384 12.6057 24.8619 12.4491 24.3187 12.8506Z" fill="currentColor"/>
  <path id="mark" d="M11.0498 10.2763C7.74186 13.5853 7.07344 19.3235 10.9503 23.0313L10.9474 23.0341L0.363647 32.5C1.02597 31.5868 1.84612 30.7235 2.66565 29.8609L2.66566 29.8609L2.69885 29.826L2.70569 29.8188C5.04711 27.3551 7.36787 24.9131 5.94992 21.4622C4.04991 16.8403 5.15635 11.4239 8.6748 7.90126C12.3326 4.24192 17.7198 3.31926 22.2195 5.17313C23.215 5.54334 24.0826 6.07017 24.7595 6.55998L21.0022 8.2971C17.5036 6.82767 13.4959 7.82722 11.0498 10.2763Z" fill="currentColor"/>
  <path d="M37.8333 19.3306C38.0527 22.2268 40.2688 24.5525 44.5254 24.5525C48.2114 24.5525 50.8663 22.7753 50.8663 19.8352C50.8663 17.2462 49.111 16.0394 46.0612 15.3592L43.6477 14.7888C41.8705 14.3938 40.9051 13.7575 40.9051 12.6166C40.9051 11.2124 42.2435 10.3128 44.1962 10.3128C46.0832 10.3128 47.4655 11.1466 47.6849 13.2748H50.3836C50.2081 10.1373 47.7726 8.09674 44.1962 8.09674C40.6637 8.09674 38.2502 10.0056 38.2502 12.7921C38.2502 15.7761 40.7954 16.6976 43.0772 17.2242L45.4688 17.7508C47.3777 18.1896 48.1456 18.9795 48.1456 20.0107C48.1456 21.6124 46.5439 22.3146 44.5254 22.3146C42.3971 22.3146 40.9051 21.5027 40.576 19.3306H37.8333Z" fill="currentColor"/>
  <path d="M56.9253 24.399C54.0071 24.399 53.0198 22.6876 53.0198 20.274V12.7921H55.4991V20.1424C55.4991 21.4369 56.2451 22.2926 57.5616 22.2926C59.5582 22.2926 60.5456 20.8006 60.5456 18.8917V12.7921H63.0249V24.1357H60.6553V22.2048H60.6114C59.8215 23.7188 58.5709 24.399 56.9253 24.399Z" fill="currentColor"/>
  <path d="M65.3942 12.7921V28.48H67.8736V22.5998H67.9394C68.7293 23.9163 70.2651 24.399 71.428 24.399C74.7631 24.399 76.5403 21.6783 76.5403 18.4529C76.5403 15.2276 74.7631 12.5069 71.428 12.5069C70.2651 12.5069 68.7293 12.9896 67.9394 14.3061H67.8736V12.7921H65.3942ZM70.8795 22.3365C68.7073 22.3365 67.8077 20.4057 67.8077 18.4529C67.8077 16.4343 68.7073 14.5474 70.8795 14.5474C73.0955 14.5474 73.9512 16.4343 73.9512 18.4529C73.9512 20.4057 73.0955 22.3365 70.8795 22.3365Z" fill="currentColor"/>
  <path d="M83.4145 24.399C79.8601 24.399 77.8415 21.8977 77.8415 18.4529C77.8415 14.9204 79.8601 12.5069 83.217 12.5069C86.4863 12.5069 88.4829 14.7229 88.5926 18.1458L87.5175 19.155H80.3647C80.5622 21.1736 81.6373 22.3804 83.4145 22.3804C84.709 22.3804 85.6306 21.7002 86.0913 20.4496H88.5487C87.9782 23.0605 86.0474 24.399 83.4145 24.399ZM80.4305 17.3778H86.1352C85.8719 15.447 84.7529 14.4597 83.217 14.4597C81.8128 14.4597 80.7377 15.5348 80.4305 17.3778Z" fill="currentColor"/>
  <path d="M90.4185 14.5913V24.1357H92.8979V14.8985H96.935V12.7921H92.5029L90.4185 14.5913Z" fill="currentColor"/>
  <path d="M106.565 24.4252C101.684 24.4252 98.7743 20.9105 98.7743 16.1179C98.7743 11.2801 101.788 7.67999 106.66 7.67999C110.468 7.67999 113.255 9.61507 113.912 13.2152H110.989C110.558 11.1677 108.836 10.0201 106.66 10.0201C103.148 10.0201 101.607 13.0352 101.607 16.1179C101.607 19.2005 103.148 22.193 106.66 22.193C110.014 22.193 111.487 19.7854 111.601 17.7829H106.547V15.453H114.184L114.172 16.6712C114.172 21.1975 112.311 24.4252 106.565 24.4252Z" fill="currentColor"/>
  <path d="M116.359 14.34V24.1279H118.919V14.6551H123.089V12.495H118.511L116.359 14.34ZM129.354 24.3976C125.547 24.3976 123.485 21.72 123.485 18.2999C123.485 14.8572 125.547 12.2021 129.354 12.2021C133.184 12.2021 135.223 14.8572 135.223 18.2999C135.223 21.72 133.184 24.3976 129.354 24.3976ZM126.159 18.2999C126.159 20.955 127.609 22.2826 129.354 22.2826C131.122 22.2826 132.549 20.955 132.549 18.2999C132.549 15.6449 131.122 14.2948 129.354 14.2948C127.609 14.2948 126.159 15.6449 126.159 18.2999Z" fill="currentColor"/>
  <path d="M137.117 24.1287V8.06312H139.678V18.6658V24.1287H137.117ZM139.678 18.6658L145.094 12.4958H148.199L143.326 17.7836L148.244 24.1287H145.185L141.202 18.6766L139.678 18.6658Z" fill="currentColor"/>
  <defs>
    <filter id="filter0_i_140_136" x="0.363647" y="0.5" width="147.88" height="32" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feFlood flood-opacity="0" result="BackgroundImageFix"/>
      <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
      <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
      <feOffset dy="0.409854"/>
      <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
      <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.2 0"/>
      <feBlend mode="normal" in2="shape" result="effect1_innerShadow_140_136"/>
    </filter>
  </defs>`;

    let logoReplaced = false;
    let _logoSvgObserver = null;

    let lastUrl = location.href;
    const _ge_urlChangeObserver = new MutationObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            logoReplaced = false;
            if (featurePrivacyMode) {
                ge_maskPrivacyTitle();
                // New route may have rendered fresh sidebar/command-menu items.
                ge_rescanPrivacyFull();
            }
        }
    });
    _ge_urlChangeObserver.observe(document, { subtree: true, childList: true });

    function isGreetingLogo(svg) {
        let el = svg.parentElement;
        while (el && el !== document.body) {
            if (el.classList && el.classList.contains('max-w-breakout')) return true;
            el = el.parentElement;
        }
        return false;
    }

    function tryReplaceLogo() {
        if (!featureLogo || logoReplaced) return;
        const svgs = document.querySelectorAll('svg');
        for (const svg of svgs) {
            const markPaths = svg.querySelectorAll('path[id="mark"]');
            if (markPaths.length < 2) continue;
            if (!isGreetingLogo(svg)) continue;
            if (svg.getAttribute('viewBox') === SUPERGROK_VIEWBOX) { logoReplaced = true; return; }
            svg.setAttribute('viewBox', SUPERGROK_VIEWBOX);
            svg.setAttribute('fill-rule', 'evenodd');
            svg.setAttribute('clip-rule', 'evenodd');
            svg.innerHTML = SUPERGROK_INNER_HTML;
            logoReplaced = true;
            // Watch this SVG: if React re-renders and resets it, re-allow replacement
            if (_logoSvgObserver) _logoSvgObserver.disconnect();
            _logoSvgObserver = new MutationObserver(() => {
                if (svg.getAttribute('viewBox') !== SUPERGROK_VIEWBOX) {
                    logoReplaced = false;
                }
            });
            _logoSvgObserver.observe(svg, { attributes: true, attributeFilter: ['viewBox'], childList: true });
            break;
        }
    }

    // ══════════════════════════════════════════════════════════════
    //  2. Clickable Links
    // ══════════════════════════════════════════════════════════════
    const SCAN_RE = /(?<![a-zA-Z0-9.@])@([A-Za-z0-9_]{1,15})\b|https?:\/\/[^\s<>"'`\])\}]+|\bwww\.[a-zA-Z0-9\-]+\.[^\s<>"'`\])\}]+|\b(?:[a-zA-Z0-9\-]+\.)+(?:com|org|net|io|dev|app|co|ai|gov|edu|me|info|xyz|biz|name|mobi|pro|tel|jobs|museum|coop|aero|int|travel|post|tech|software|online|site|website|store|shop|blog|cloud|digital|media|network|solutions|services|company|agency|studio|design|systems|consulting|management|marketing|finance|health|care|technology|tools|space|zone|world|life|live|social|community|group|team|global|business|professional|expert|plus|city|land|today|news|press|review|guide|support|help|training|education|academy|institute|center|foundation|ventures|capital|partners|holdings|works|build|engineering|energy|eco|farm|food|restaurant|bar|hotel|tours|rentals|properties|estate|homes|auto|cars|sports|fitness|art|gallery|photography|video|music|show|film|events|party|fun|games|game|play|dating|love|wedding|family|kids|pet|clinic|dental|doctor|pharmacy|insurance|loans|credit|bank|money|pay|law|attorney|legal|security|repair|cleaning|run|link|click|host|page|web|email|uk|ca|au|de|fr|jp|ru|br|in|it|es|nl|se|no|fi|dk|pl|pt|be|ch|at|nz|mx|ar|sg|hk|tw|kr|za|ie|cz|hu|ro|gr|th|vn|ph|id|my|ng|ke|gg|re|tv|cc|so|is|ee|lv|lt|sk|si|hr|rs|bg|mk|al|ba|md|ge|am|az|by|kz|ua|uz|mn|af|pk|bd|lk|np|mm|kh|la|bn|pg|fj|ws|to|vu|ki|fm|pw|mh|nr|sb|eu|us|gb|il|tr|sa|ae|eg|ma|li|lu|mo|mt|cy|gh|tz|sn|cm|ao|zw|mu|bw|na|ls|sz|rw|sd|ly|dz|cd|ga|gq|cv|sl|lr|gn|bf|ml|gm|mz|sc|sh|je|im|gi|gt|bz|sv|hn|ni|cr|pa|pe|cl|bo|uy|py|ec|tt|jm|cu|do|ht|dm|bb|lc|vc|gd|ag|kn|pr|vi|ky|bm|aw|gp|mq|nc|pf|as|gu|ck|nu|tk|nf|cx|sj|gl|pm|yt|ax|fo)(?:\/[^\s<>"'`\])\}]*)?\b/gi;

    // Platform context detection for @mention link routing
    const PLATFORM_PATTERNS = [
        { re: /\b(instagram|insta)\b/i,                          url: u => `https://instagram.com/${u}` },
        { re: /\b(tiktok|tik\s*tok|\bTT\b)\b/i,               url: u => `https://tiktok.com/@${u}` },
        { re: /\b(snapchat|snap)\b/i,                            url: u => `https://snapchat.com/add/${u}` },
        { re: /\b(bluesky|bsky\.app)\b/i,                       url: u => `https://bsky.app/profile/${u}` },
        { re: /\b(threads\.net|threads)\b/i,                    url: u => `https://threads.net/@${u}` },
        { re: /\btwitch\b/i,                                     url: u => `https://twitch.tv/${u}` },
        { re: /\bkick\.com|\bkick\b/i,                          url: u => `https://kick.com/${u}` },
        { re: /\byoutube\b/i,                                    url: u => `https://youtube.com/@${u}` },
        { re: /\b(facebook|fb\.com)\b/i,                         url: u => `https://facebook.com/${u}` },
        { re: /\blinkedin\b/i,                                   url: u => `https://linkedin.com/in/${u}` },
        { re: /\b(github|gh\b)\b/i,                             url: u => `https://github.com/${u}` },
        { re: /\b(telegram|t\.me)\b/i,                          url: u => `https://t.me/${u}` },
        { re: /\bsoundcloud\b/i,                                 url: u => `https://soundcloud.com/${u}` },
        { re: /\bspotify\b/i,                                    url: u => `https://open.spotify.com/user/${u}` },
        { re: /\bmedium\b/i,                                     url: u => `https://medium.com/@${u}` },
        { re: /\bsubstack\b/i,                                   url: u => `https://${u}.substack.com` },
        { re: /\bpatreon\b/i,                                    url: u => `https://patreon.com/${u}` },
        { re: /\bko-?fi\b/i,                                     url: u => `https://ko-fi.com/${u}` },
        { re: /\bvsco\b/i,                                       url: u => `https://vsco.co/${u}` },
        { re: /\bpinterest\b/i,                                  url: u => `https://pinterest.com/${u}` },
        { re: /\btumblr\b/i,                                     url: u => `https://tumblr.com/${u}` },
        { re: /\breddit\b/i,                                     url: u => `https://reddit.com/user/${u}` },
        { re: /\bmastodon\b/i,                                   url: u => `https://mastodon.social/@${u}` },
        { re: /\bdiscord\b/i,                                    url: u => `https://discord.com/users/${u}` },
        { re: /\b(x\.com|twitter|tweet|retweet|x account|on x)\b/i, url: u => `https://x.com/${u}` },
    ];

    function getMentionHref(user, text, start, textNode) {
        const WIN = 150;
        const mentionStr = '@' + user;

        // Use the full block element text so that context in sibling nodes is included
        const ctxEl = textNode?.parentElement?.closest('p,li,div,article,section,blockquote,td') || textNode?.parentElement;
        const fullText = (ctxEl && ctxEl.textContent.length > text.length) ? ctxEl.textContent : text;

        // Find where this text node sits inside the block text, then add the local match offset
        let baseOffset = 0;
        if (fullText !== text) {
            const idx = fullText.indexOf(text);
            if (idx !== -1) baseOffset = idx;
        }
        const mentionIdx = baseOffset + start;

        const winStart   = Math.max(0, mentionIdx - WIN);
        const winEnd     = Math.min(fullText.length, mentionIdx + mentionStr.length + WIN);
        const win        = fullText.slice(winStart, winEnd);
        const mentionPos = mentionIdx - winStart;
        const atEnd      = mentionPos + mentionStr.length;

        let bestPlatform = null;
        let bestDist     = Infinity;

        for (const p of PLATFORM_PATTERNS) {
            const re = new RegExp(p.re.source, 'gi');
            let m;
            while ((m = re.exec(win)) !== null) {
                const kwEnd = m.index + m[0].length;
                const dist = kwEnd <= mentionPos ? mentionPos - kwEnd
                           : m.index >= atEnd    ? m.index - atEnd
                           : 0;
                if (dist < bestDist) { bestDist = dist; bestPlatform = p; }
            }
        }

        return bestPlatform ? bestPlatform.url(user) : 'https://x.com/' + user;
    }

    const SKIP_TAGS = new Set([
        'A', 'SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA', 'INPUT', 'SELECT',
        'BUTTON', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'SVG',
    ]);
    const PROCESSED_ATTR = 'data-linkified';

    function linkifyNode(root) {
        if (!featureLinks) return;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                let el = node.parentElement;
                while (el) {
                    if (SKIP_TAGS.has(el.tagName)) return NodeFilter.FILTER_REJECT;
                    if (el.hasAttribute(PROCESSED_ATTR)) return NodeFilter.FILTER_REJECT;
                    el = el.parentElement;
                }
                if (!node.nodeValue || node.nodeValue.trim().length < 4) return NodeFilter.FILTER_SKIP;
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        const textNodes = [];
        let n;
        while ((n = walker.nextNode())) textNodes.push(n);

        for (const textNode of textNodes) {
            const text = textNode.nodeValue;
            SCAN_RE.lastIndex = 0;
            if (!SCAN_RE.test(text)) continue;
            SCAN_RE.lastIndex = 0;
            const frag = document.createDocumentFragment();
            let lastIndex = 0, match;
            while ((match = SCAN_RE.exec(text)) !== null) {
                const full = match[0], mentionUser = match[1], start = match.index;
                if (start > lastIndex) frag.appendChild(document.createTextNode(text.slice(lastIndex, start)));
                const a = document.createElement('a');
                if (mentionUser) {
                    a.href = getMentionHref(mentionUser, text, start, textNode);
                } else {
                    a.href = /^https?:\/\//i.test(full) ? full : 'https://' + full;
                }
                a.textContent = full;
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                a.className = 'ge-link';
                a.style.cssText = 'text-decoration:underline;cursor:pointer;';
                frag.appendChild(a);
                lastIndex = start + full.length;
            }
            if (lastIndex < text.length) frag.appendChild(document.createTextNode(text.slice(lastIndex)));
            const parent = textNode.parentElement;
            if (parent) parent.setAttribute(PROCESSED_ATTR, '1');
            textNode.parentNode.replaceChild(frag, textNode);
        }
    }

    // ══════════════════════════════════════════════════════════════
    //  3. DeMod — Moderation Bypass
    // ══════════════════════════════════════════════════════════════
    const DEMOD_CONFIG = {
        defaultFlags: ['isFlagged', 'isBlocked', 'moderationApplied', 'restricted'],
        messageKeys: ['message', 'content', 'text', 'error'],
        moderationMessagePatterns: [
            /this content has been moderated/i,
            /sorry, i cannot assist/i,
            /policy violation/i,
            /blocked/i,
            /moderated/i,
            /restricted/i,
            /content restricted/i,
            /unable to process/i,
            /cannot help/i,
            /(sorry|apologies).*?(cannot|unable|help|assist)/i,
        ],
        clearedMessageText: '[Content cleared by Grok DeMod]',
        recoveryTimeoutMs: 5000,
        statusColors: {
            safe: '#66ff66',
            flagged: '#ffa500',
            blocked: '#ff6666',
            recovering: '#ffcc00',
        },
    };

    let moderationFlags = getState('GrokDeModFlags', DEMOD_CONFIG.defaultFlags);
    let demodInitCache = null;
    let currentConversationId = null;

    const ModerationResult = Object.freeze({ SAFE: 0, FLAGGED: 1, BLOCKED: 2 });

    function timeoutPromise(ms, promise, desc = 'Promise') {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`Timeout (${desc})`)), ms);
            promise.then(v => { clearTimeout(timer); resolve(v); }, e => { clearTimeout(timer); reject(e); });
        });
    }

    function getModerationResult(obj, path = '') {
        if (typeof obj !== 'object' || obj === null) return ModerationResult.SAFE;
        let result = ModerationResult.SAFE;
        for (const key in obj) {
            if (!obj.hasOwnProperty(key)) continue;
            const cp = path ? `${path}.${key}` : key;
            const value = obj[key];
            if (key === 'isBlocked' && value === true) { logDebug(`Blocked: '${cp}'`); return ModerationResult.BLOCKED; }
            if (moderationFlags.includes(key) && value === true) { logDebug(`Flagged: '${cp}'`); result = Math.max(result, ModerationResult.FLAGGED); }
            if (DEMOD_CONFIG.messageKeys.includes(key) && typeof value === 'string') {
                const c = value.toLowerCase();
                for (const p of DEMOD_CONFIG.moderationMessagePatterns) {
                    if (p.test(c)) {
                        if (/blocked|moderated|restricted/i.test(p.source)) return ModerationResult.BLOCKED;
                        result = Math.max(result, ModerationResult.FLAGGED);
                        break;
                    }
                }
                if (result === ModerationResult.SAFE && c.length < 70 && /(sorry|apologies|unable|cannot)/i.test(c))
                    result = Math.max(result, ModerationResult.FLAGGED);
            }
            if (typeof value === 'object') {
                const cr = getModerationResult(value, cp);
                if (cr === ModerationResult.BLOCKED) return ModerationResult.BLOCKED;
                result = Math.max(result, cr);
            }
        }
        return result;
    }

    function clearFlagging(obj) {
        if (typeof obj !== 'object' || obj === null) return obj;
        if (Array.isArray(obj)) return obj.map(clearFlagging);
        const out = {};
        for (const key in obj) {
            if (!obj.hasOwnProperty(key)) continue;
            const v = obj[key];
            if (moderationFlags.includes(key) && v === true) { out[key] = false; }
            else if (DEMOD_CONFIG.messageKeys.includes(key) && typeof v === 'string') {
                let replaced = false;
                for (const p of DEMOD_CONFIG.moderationMessagePatterns) {
                    if (p.test(v)) { out[key] = DEMOD_CONFIG.clearedMessageText; replaced = true; break; }
                }
                if (!replaced && v.length < 70 && /(sorry|apologies|unable|cannot)/i.test(v.toLowerCase())) {
                    if (getModerationResult({ [key]: v }) === ModerationResult.FLAGGED) { out[key] = DEMOD_CONFIG.clearedMessageText; replaced = true; }
                }
                if (!replaced) out[key] = v;
            }
            else if (typeof v === 'object') out[key] = clearFlagging(v);
            else out[key] = v;
        }
        return out;
    }

    function extractConversationIdFromUrl(url) {
        const m = url.match(/\/conversation\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
        return m ? m[1] : null;
    }

    async function redownloadLatestMessage() {
        if (!currentConversationId) { panelAddLog('Recovery failed: No conversation ID.'); return null; }
        if (!demodInitCache || !demodInitCache.headers) {
            try {
                const r = await _originalFetch(`/rest/app-chat/conversation/${currentConversationId}`, { method: 'GET', headers: { 'Accept': 'application/json' } });
                if (r.ok) demodInitCache = { headers: new Headers({ 'Accept': 'application/json' }), credentials: 'include' };
                else { panelAddLog('Recovery failed: Cannot get request data.'); return null; }
            } catch (_) { panelAddLog('Recovery failed: Error getting request data.'); return null; }
        }
        panelAddLog('Attempting content recovery...');
        const headers = new Headers(demodInitCache.headers);
        if (!headers.has('Accept')) headers.set('Accept', 'application/json, text/plain, */*');
        try {
            const resp = await timeoutPromise(DEMOD_CONFIG.recoveryTimeoutMs,
                _originalFetch(`/rest/app-chat/conversation/${currentConversationId}`, { method: 'GET', headers, credentials: demodInitCache.credentials || 'include' }),
                'Recovery Fetch');
            if (!resp.ok) { panelAddLog(`Recovery failed: HTTP ${resp.status}`); return null; }
            const data = await resp.json();
            const msgs = data?.messages;
            if (!Array.isArray(msgs) || msgs.length === 0) { panelAddLog('Recovery failed: No messages found.'); return null; }
            msgs.sort((a, b) => (b.timestamp ? new Date(b.timestamp).getTime() : 0) - (a.timestamp ? new Date(a.timestamp).getTime() : 0));
            const latest = msgs[0];
            if (!latest || typeof latest.content !== 'string' || !latest.content.trim()) { panelAddLog('Recovery failed: Invalid latest message.'); return null; }
            panelAddLog('Recovery seems successful.');
            return { content: latest.content };
        } catch (e) { panelAddLog(`Recovery error: ${e.message}`); return null; }
    }

    async function processPotentialModeration(json, source) {
        const mr = getModerationResult(json);
        let out = json;
        if (mr !== ModerationResult.SAFE) {
            if (mr === ModerationResult.BLOCKED) {
                panelAddLog(`Blocked content from ${source}.`);
                panelUpdateStatus(mr, true);
                const recovered = await redownloadLatestMessage();
                if (recovered && recovered.content) {
                    panelAddLog(`Recovery successful (${source}).`);
                    let replaced = false;
                    for (const k of [...DEMOD_CONFIG.messageKeys, 'text', 'message']) {
                        if (typeof out[k] === 'string') { out[k] = recovered.content; replaced = true; break; }
                    }
                    if (!replaced) out.recovered_content = recovered.content;
                    out = clearFlagging(out);
                    panelUpdateStatus(mr, false);
                } else {
                    panelAddLog(`Recovery failed (${source}).`);
                    out = clearFlagging(json);
                    panelUpdateStatus(mr, false);
                }
            } else {
                panelAddLog(`Flagged content cleared (${source}).`);
                out = clearFlagging(json);
                panelUpdateStatus(mr);
            }
        } else {
            if (panelStatusEl && !panelStatusEl.textContent.includes('Blocked') && !panelStatusEl.textContent.includes('Flagged') && !panelStatusEl.textContent.includes('Recovering'))
                panelUpdateStatus(mr);
            else if (panelStatusEl && panelStatusEl.textContent.includes('Recovering'))
                panelUpdateStatus(ModerationResult.SAFE);
        }
        return out;
    }

    // Tracks the active conversation ID from either the initial GET request
    // or the first response that reveals it, and caches the auth headers
    // needed later for the DeMod recovery re-fetch.
    function ge_trackConversationId(url, requestArgs) {
        const convGetMatch = url.match(/\/rest\/app-chat\/conversation\/([a-f0-9-]+)$/i);
        if (convGetMatch && requestArgs?.method === 'GET') {
            demodInitCache = { headers: new Headers(requestArgs.headers), credentials: requestArgs.credentials || 'include' };
            if (!currentConversationId) currentConversationId = convGetMatch[1];
        }
        if (!currentConversationId) { const id = extractConversationIdFromUrl(url); if (id) currentConversationId = id; }
    }

    function ge_handleSSEResponse(response) {
        const reader = response.body.getReader();
        const stream = new ReadableStream({
            async start(controller) {
                let buffer = '';
                let currentEvent = { data: '', type: 'message', id: null };
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) {
                            if (buffer.trim() && (buffer.startsWith('{') || buffer.startsWith('['))) {
                                try { let j = JSON.parse(buffer); j = await processPotentialModeration(j, 'SSE-Final'); controller.enqueue(_encoder.encode(`data: ${JSON.stringify(j)}\n\n`)); }
                                catch (_) { controller.enqueue(_encoder.encode(`data: ${buffer}\n\n`)); }
                            } else if (buffer.trim()) {
                                controller.enqueue(_encoder.encode(`data: ${buffer}\n\n`));
                            } else if (currentEvent.data) {
                                try { let j = JSON.parse(currentEvent.data); j = await processPotentialModeration(j, 'SSE-Event'); controller.enqueue(_encoder.encode(`data: ${JSON.stringify(j)}\n\n`)); }
                                catch (_) { controller.enqueue(_encoder.encode(`data: ${currentEvent.data}\n\n`)); }
                            }
                            controller.close(); break;
                        }
                        buffer += _decoder.decode(value, { stream: true });
                        let lines = buffer.split('\n');
                        buffer = lines.pop() || '';
                        for (const line of lines) {
                            if (line.trim() === '') {
                                if (currentEvent.data) {
                                    if (currentEvent.data.startsWith('{') || currentEvent.data.startsWith('[')) {
                                        try {
                                            let j = JSON.parse(currentEvent.data);
                                            if (j.conversation_id && !currentConversationId) currentConversationId = j.conversation_id;
                                            j = await processPotentialModeration(j, 'SSE');
                                            controller.enqueue(_encoder.encode(`data: ${JSON.stringify(j)}\n\n`));
                                        } catch (_) { controller.enqueue(_encoder.encode(`data: ${currentEvent.data}\n\n`)); }
                                    } else {
                                        controller.enqueue(_encoder.encode(`data: ${currentEvent.data}\n\n`));
                                    }
                                }
                                currentEvent = { data: '', type: 'message', id: null };
                            } else if (line.startsWith('data:')) {
                                currentEvent.data += (currentEvent.data ? '\n' : '') + line.substring(5).trim();
                            } else if (line.startsWith('event:')) {
                                currentEvent.type = line.substring(6).trim();
                            } else if (line.startsWith('id:')) {
                                currentEvent.id = line.substring(3).trim();
                            }
                        }
                    }
                } catch (e) { controller.error(e); } finally { reader.releaseLock(); }
            }
        });
        return new Response(stream, { status: response.status, statusText: response.statusText, headers: new Headers(response.headers) });
    }

    async function ge_handleJSONResponse(response, original_response) {
        try {
            const text = await response.text();
            let json = JSON.parse(text);
            if (json.conversation_id && !currentConversationId) currentConversationId = json.conversation_id;
            json = await processPotentialModeration(json, 'Fetch');
            const body = JSON.stringify(json);
            const nh = new Headers(response.headers);
            if (nh.has('content-length')) nh.set('content-length', _encoder.encode(body).byteLength.toString());
            return new Response(body, { status: response.status, statusText: response.statusText, headers: nh });
        } catch (_) { return original_response; }
    }

    async function handleFetchResponse(original_response, url, requestArgs) {
        const response = original_response.clone();
        if (!response.ok) return original_response;
        const ct = response.headers.get('Content-Type')?.toLowerCase() || '';

        ge_trackConversationId(url, requestArgs);

        if (ct.includes('text/event-stream')) return ge_handleSSEResponse(response);
        if (ct.includes('application/json')) return ge_handleJSONResponse(response, original_response);
        return original_response;
    }

    // ── Install fetch interceptor ────────────────────────────────
    _win.fetch = async function (input, init) {
        let url;
        let requestArgs = init || {};
        const isReqObj = (input instanceof Request);
        try { url = isReqObj ? input.url : String(input); }
        catch (_) { return _originalFetch.apply(this, arguments); }

        // Resolve method: init overrides Request properties
        const method = requestArgs.method || (isReqObj ? input.method : undefined);

        // ── Custom Response Style: prepend instructions to the user message ──
        const isChatPost = method === 'POST' && url.includes('/rest/app-chat/conversation');

        // ── Rate Limit: detect model from outgoing chat request for local usage tracking ──
        const isRateLimitTrackable = method === 'POST' &&
            (url.includes('/rest/app-chat/conversations/new') || (url.includes('/responses') && url.includes('/rest/app-chat/conversations/')));
        let rl_pendingModel = null;
        if (featureRateLimit && isRateLimitTrackable) {
            try {
                let rlBodyText = null;
                if (typeof requestArgs.body === 'string') rlBodyText = requestArgs.body;
                else if (isReqObj) { const rlClone = input.clone(); rlBodyText = await rlClone.text(); }
                if (rlBodyText) rl_pendingModel = rl_getModelFromBody(JSON.parse(rlBodyText));
            } catch (_) {}
        }
        if (ge_activeStyleId && isChatPost) {
            try {
                const styles = ge_getCustomStyles();
                const activeStyle = styles.find(s => s.id === ge_activeStyleId);
                if (activeStyle) {
                    let bodyText = null;
                    if (typeof requestArgs.body === 'string') {
                        bodyText = requestArgs.body;
                    } else if (isReqObj) {
                        const cloned = input.clone();
                        bodyText = await cloned.text();
                    }
                    if (bodyText) {
                        const json = JSON.parse(bodyText);
                        // Find the user message field and prepend style instructions
                        const msgKey = ['message', 'content', 'text', 'prompt'].find(k => typeof json[k] === 'string');
                        if (msgKey) {
                            json[msgKey] = '[Follow these response-style instructions for this and all subsequent replies in this conversation: ' + activeStyle.instructions + ']\n\n' + json[msgKey];
                        }
                        const newBody = JSON.stringify(json);
                        if (isReqObj) {
                            input = new Request(input, { body: newBody });
                            requestArgs = init || {};
                        } else {
                            requestArgs = { ...requestArgs, body: newBody };
                        }
                        logDebug('[CustomStyle] Injected "' + activeStyle.name + '" into ' + url);
                    }
                }
            } catch (err) {
                console.warn('[GrokEnhancer] CustomStyle inject error:', err);
            }
        }

        // ── Imagine Menu: Video length override ──
        if (featureImagineMenu && ge_imInterceptOn && isChatPost) {
            try {
                let bodyText2 = null;
                if (typeof requestArgs.body === 'string') {
                    bodyText2 = requestArgs.body;
                } else if (isReqObj) {
                    const cloned2 = input.clone();
                    bodyText2 = await cloned2.text();
                }
                if (bodyText2) {
                    const json2 = JSON.parse(bodyText2);
                    const hasVideoGen = json2.toolOverrides?.videoGen !== undefined;
                    const hasVideoConfig = json2.responseMetadata?.modelConfigOverride?.modelMap?.videoGenModelConfig;
                    if (hasVideoGen || hasVideoConfig) {
                        if (!json2.responseMetadata) json2.responseMetadata = {};
                        if (!json2.responseMetadata.modelConfigOverride) json2.responseMetadata.modelConfigOverride = {};
                        if (!json2.responseMetadata.modelConfigOverride.modelMap) json2.responseMetadata.modelConfigOverride.modelMap = {};
                        if (!json2.responseMetadata.modelConfigOverride.modelMap.videoGenModelConfig)
                            json2.responseMetadata.modelConfigOverride.modelMap.videoGenModelConfig = {};
                        const cfg = json2.responseMetadata.modelConfigOverride.modelMap.videoGenModelConfig;
                        const oldLen = cfg.videoLength;
                        cfg.videoLength = ge_imVideoLength;
                        ge_imInterceptCount++;
                        logDebug(`[ImagineMenu] Video length ${oldLen || 'default'} → ${ge_imVideoLength} (#${ge_imInterceptCount})`);
                        const newBody2 = JSON.stringify(json2);
                        if (isReqObj) { input = new Request(input, { body: newBody2 }); requestArgs = init || {}; }
                        else { requestArgs = { ...requestArgs, body: newBody2 }; }
                        ge_updateImStatus();
                    }
                    // ── Imagine Menu: Prompt injection ──
                    if (ge_imActivePromptId) {
                        const prompts = ge_getPrompts();
                        const ap = prompts.find(p => p.id === ge_imActivePromptId);
                        if (ap && ap.text) {
                            const msgK = ['message', 'content', 'text', 'prompt'].find(k => typeof json2[k] === 'string');
                            if (msgK && !json2[msgK].includes(ap.text)) {
                                json2[msgK] = ap.text + '\n\n' + json2[msgK];
                                logDebug('[ImagineMenu] Injected prompt:', ap.name);
                            }
                            // Clear active prompt if not auto-retry
                            if (!ge_imAutoRetry) {
                                ge_imActivePromptId = null;
                                setState('GrokEnhancer_ActivePromptId', null);
                                ge_updateImActiveLabel();
                            }
                            const nb = JSON.stringify(json2);
                            if (isReqObj) { input = new Request(input, { body: nb }); requestArgs = init || {}; }
                            else { requestArgs = { ...requestArgs, body: nb }; }
                        }
                    }
                }
            } catch (err2) {
                console.warn('[GrokEnhancer] ImagineMenu intercept error:', err2);
            }
        }

        // ── Media API intercept for downloader database ──
        if (url.includes('/rest/media/post/list')) {
            const resp = await _originalFetch.call(this, input, requestArgs);
            try {
                const clone = resp.clone();
                const data = await clone.json();
                ge_processApiMedia(data);
            } catch (e) { logError('[Downloader] API intercept error:', e); }
            return resp;
        }

        if (!featureDeMod) {
            const p0 = _originalFetch.call(this, input, requestArgs);
            if (rl_pendingModel) rl_trackUsageAndLimit(rl_pendingModel, p0);
            return p0;
        }
        if (!url.includes('/rest/app-chat/')) return _originalFetch.call(this, input, requestArgs);

        if (method === 'POST') {
            const id = extractConversationIdFromUrl(url);
            if (id) {
                if (!currentConversationId) currentConversationId = id;
                const hdrs = requestArgs.headers || (isReqObj ? input.headers : null);
                if (!demodInitCache && hdrs) demodInitCache = { headers: new Headers(hdrs), credentials: requestArgs.credentials || (isReqObj ? input.credentials : 'include') };
            }
            const p1 = _originalFetch.call(this, input, requestArgs);
            if (rl_pendingModel) rl_trackUsageAndLimit(rl_pendingModel, p1);
            return p1;
        }
        try {
            const resp = await _originalFetch.call(this, input, requestArgs);
            return await handleFetchResponse(resp, url, requestArgs);
        } catch (e) { throw e; }
    };

    // ── Install WebSocket interceptor ────────────────────────────
    _win.WebSocket = new Proxy(_OriginalWebSocket, {
        construct(target, args) {
            const ws = new target(...args);
            let originalOnMessageHandler = null;
            Object.defineProperty(ws, 'onmessage', {
                configurable: true, enumerable: true,
                get() { return originalOnMessageHandler; },
                async set(handler) {
                    originalOnMessageHandler = handler;
                    ws.onmessageinternal = async function (event) {
                        if (!featureDeMod || typeof event.data !== 'string' || !event.data.startsWith('{')) {
                            if (originalOnMessageHandler) try { originalOnMessageHandler.call(ws, event); } catch (_) { }
                            return;
                        }
                        try {
                            let json = JSON.parse(event.data);
                            if (json.conversation_id && json.conversation_id !== currentConversationId) currentConversationId = json.conversation_id;
                            const processed = await processPotentialModeration(json, 'WebSocket');
                            const ne = new MessageEvent('message', { data: JSON.stringify(processed), origin: event.origin, lastEventId: event.lastEventId, source: event.source, ports: event.ports });
                            if (originalOnMessageHandler) try { originalOnMessageHandler.call(ws, ne); } catch (_) { }
                        } catch (_) {
                            if (originalOnMessageHandler) try { originalOnMessageHandler.call(ws, event); } catch (_2) { }
                        }
                    };
                    ws.addEventListener('message', ws.onmessageinternal);
                }
            });
            const wrapHandler = (eventName) => {
                let oh = null;
                Object.defineProperty(ws, `on${eventName}`, {
                    configurable: true, enumerable: true,
                    get() { return oh; },
                    set(handler) {
                        oh = handler;
                        ws.addEventListener(eventName, (e) => {
                            if (eventName === 'message') return;
                            if (oh) try { oh.call(ws, e); } catch (_) { }
                        });
                    }
                });
            };
            wrapHandler('close');
            wrapHandler('error');
            return ws;
        }
    });

    // Shared "get-or-create a <style> element, set/clear its CSS" toggle used by every
    // CSS-only hide feature below (popups, premium upsells, model dropdown, privacy).
    function ge_applyToggleStyle(styleId, on, css) {
        let style = document.getElementById(styleId);
        if (on) {
            if (!style) {
                style = document.createElement('style');
                style.id = styleId;
                document.head.appendChild(style);
            }
            style.textContent = css;
        } else if (style) {
            style.remove();
        }
    }

    // ══════════════════════════════════════════════════════════════
    //  3c. Hide Satisfaction / Feedback Popups
    // ══════════════════════════════════════════════════════════════
    const POPUP_STYLE_ID = 'ge-hide-popups-css';

    function ge_applyPopupHideCSS(on) {
        // Target the satisfaction popup, Think Harder suggestion, Connect X banner, notification toast, and Grok Build promo
        ge_applyToggleStyle(POPUP_STYLE_ID, on, `
                /* "Grok Build" beta CLI install promo card (dismissible) */
                div[class*="promo-card"]:has(button[aria-label="Dismiss"]) {
                    display: none !important;
                }
                /* Satisfaction / feedback popup */
                div.rounded-3xl.backdrop-blur-lg.border.bg-input {
                    display: none !important;
                }
                /* Think Harder suggestion */
                div.relative.pt-2:has(> button.pe-7) {
                    display: none !important;
                }
                /* Connect X account banner */
                div.group:has(> div > .text-2xl):has(button[aria-label="Close"]) {
                    display: none !important;
                }
                div.rounded-2xl.border.bg-surface-base.shadow-sm:has(> div > div > .text-2xl) {
                    display: none !important;
                }
                /* "Add X account" / "Connect your X account" modal overlay */
                div.fixed.inset-0:has([role="dialog"]):has(img[src*="x.com"]),
                div.fixed.inset-0:has([role="dialog"]):has(svg[viewBox="0 0 24 24"]):has(button) {
                    display: none !important;
                }
                /* "Get notified when Grok finishes" notification toast */
                li[data-sonner-toast].toast.bg-popover:has(svg.lucide-bell-ring) {
                    display: none !important;
                }
                ol[data-sonner-toaster]:has(li[data-sonner-toast] svg.lucide-bell-ring) {
                    display: none !important;
                }
                /* Quick Answer suggestion button */
                div.relative.pt-2:has(> button.pe-7:has(svg path[d*="4 14.5L14.2857 2"])) {
                    display: none !important;
                }
                button.pe-7:has(svg path[d*="4 14.5L14.2857 2"]) {
                    display: none !important;
                }
                /* Imagine button with sparkle decoration — hide entire container */
                span:has([data-sparkle-wrapper]) {
                    display: none !important;
                }
            `);
    }

    // ══════════════════════════════════════════════════════════════
    //  3c2. Hide Premium Stuff (SuperGrok upsell banners, sidebar, header, model menu)
    // ══════════════════════════════════════════════════════════════
    const PREMIUM_STYLE_ID = 'ge-hide-premium-css';

    function ge_applyPremiumHideCSS(on) {
        ge_applyToggleStyle(PREMIUM_STYLE_ID, on, `
                /* SuperGrok upsell — small fixed bottom-right banner */
                div.upsell-small {
                    display: none !important;
                }
                /* SuperGrok upsell — inline wider banner with gradient */
                div[role="button"].rounded-3xl.bg-black.text-white.dark:has(button:is([aria-label="Hide upsell banner"], :has(> span > svg))) {
                    display: none !important;
                }
                /* SuperGrok upsell — sidebar-footer banner (rotates message: "Fewer rate
                   limits, more capabilities" / "Customize your team of agents" / etc.) */
                div.shrink-0.border-t.border-border:has(> div[role="button"].bg-black.text-white.dark > button) {
                    display: none !important;
                }
                /* SuperGrok / Get SuperGrok sidebar row — matched by logo SVG + Upgrade button */
                div.flex.items-center.justify-between:has(svg[viewBox="0 0 149 33"]):has(button[aria-label="Upgrade"]),
                div.flex.items-center.justify-between:has(svg[viewBox="0 0 149 33"]):has(a[href*="premium"]) {
                    display: none !important;
                }
                /* "Try Free" / Upgrade header button — use attribute selector (avoids sm:block escaping) */
                div[class~="hidden"][class~="sm:block"]:has(> button:has(svg[viewBox="0 0 35 33"])),
                div.hidden.sm\\:block:has(> button:has(svg[viewBox="0 0 35 33"])) {
                    display: none !important;
                }
                /* SuperGrok upsell in model mode dropdown */
                [role="menuitem"][class*="model-mode-select-upsell"],
                [role="menuitem"][class*="upsell"] {
                    display: none !important;
                }
                /* SuperGrok upsell menuitem with SuperGrok SVG logo */
                [role="menuitem"].rounded-2xl.border-2:has(svg[viewBox="0 0 248 65"]) {
                    display: none !important;
                }
                [role="menuitem"].rounded-2xl.border-2:has(svg[viewBox="0 0 92 18"]) {
                    display: none !important;
                }
                /* "Upgrade plan" menuitem in context/hamburger menus */
                [role="menuitem"]:has(svg[viewBox="0 0 35 33"]) {
                    display: none !important;
                }
            `);
    }

    function ge_dismissPremium() {
        if (!featureHidePremium) return;
        // SuperGrok upsell banners — hide inline (never remove React-managed nodes)
        document.querySelectorAll('div.upsell-small, div[role="button"].rounded-3xl.bg-black.text-white').forEach(el => {
            if (/supergrok|unlock|try free|fewer rate limits/i.test(el.textContent)) {
                el.style.setProperty('display', 'none', 'important');
                logDebug('[HidePremium] Hidden SuperGrok upsell');
            }
        });
        // SuperGrok upsell — sidebar-footer banner, matched structurally (svg logo + trailing
        // CTA button) since the message rotates and isn't a reliable match target
        document.querySelectorAll('div.shrink-0.border-t.border-border').forEach(el => {
            const inner = el.querySelector(':scope > div[role="button"].bg-black.text-white.dark');
            if (inner && inner.querySelector('svg') && inner.querySelector('button')) {
                el.style.setProperty('display', 'none', 'important');
                logDebug('[HidePremium] Hidden sidebar-footer upsell');
            }
        });
        // SuperGrok upsell in model menu — hide inline so Radix/React can still reconcile
        document.querySelectorAll('[role="menuitem"]').forEach(el => {
            if ((el.className.includes('model-mode-select-upsell') || /upsell/i.test(el.className)) ||
                (el.querySelector('svg[viewBox="0 0 248 65"]') || el.querySelector('svg[viewBox="0 0 92 18"]')) ||
                (el.querySelector('svg[viewBox="0 0 35 33"]') && /upgrade plan/i.test(el.textContent))) {
                el.style.setProperty('display', 'none', 'important');
                logDebug('[HidePremium] Hidden model menu upsell');
            }
        });
        // Upgrade button in header (div.hidden.sm:block with button containing 35x33 svg)
        document.querySelectorAll('div[class~="sm:block"]').forEach(el => {
            if (!el.classList.contains('hidden')) return;
            const btn = el.querySelector(':scope > button');
            if (btn && /Upgrade/i.test(btn.textContent) && btn.querySelector('svg[viewBox="0 0 35 33"]')) {
                el.style.setProperty('display', 'none', 'important');
                logDebug('[HidePremium] Hidden Upgrade header button');
            }
        });
    }

    // Also dismiss/remove popups via observer for robustness
    function ge_dismissPopups() {
        if (!featureHidePopups) return;
        // Satisfaction / feedback popups
        const popups = document.querySelectorAll('div.rounded-3xl.backdrop-blur-lg');
        popups.forEach(popup => {
            const text = popup.textContent || '';
            if (/are you (happy|satisfied)|how was this response/i.test(text)) {
                const closeBtn = popup.querySelector('button[aria-label="Close"]');
                if (closeBtn) {
                    closeBtn.click();
                    logDebug('[HidePopups] Auto-dismissed satisfaction popup');
                }
            }
        });
        // "Think Harder" suggestion buttons
        document.querySelectorAll('div.relative.pt-2 > button').forEach(btn => {
            if (/think\s*harder/i.test(btn.textContent)) {
                const parent = btn.parentElement;
                if (parent) {
                    const closeBtn = parent.querySelector('button[aria-label="Close"]');
                    if (closeBtn) { closeBtn.click(); logDebug('[HidePopups] Auto-dismissed Think Harder'); }
                    else parent.style.display = 'none';
                }
            }
        });
        // Connect X account banner — hide inline (never remove React-managed nodes)
        document.querySelectorAll('div.rounded-2xl.border.bg-surface-base.shadow-sm, div.group.rounded-2xl.border.bg-surface-base').forEach(el => {
            if (/connect your.*account/i.test(el.textContent)) {
                el.style.setProperty('display', 'none', 'important');
                logDebug('[HidePopups] Hidden Connect X banner');
            }
        });
        // Homepage premium/add-X-account modal overlays that break the page
        document.querySelectorAll('div.fixed.inset-0').forEach(el => {
            if (/premium|supergrok|add.*x.*account|connect.*x.*account/i.test(el.textContent)) {
                const dialog = el.querySelector('[role="dialog"]');
                if (dialog) {
                    el.style.setProperty('display', 'none', 'important');
                    logDebug('[HidePopups] Hidden homepage modal overlay');
                }
            }
        });
    }

    // ══════════════════════════════════════════════════════════════
    //  3c3. Hide Sidebar Nav Items (Build / Imagine / Skills and Connectors)
    // ══════════════════════════════════════════════════════════════
    // Matched by visible label text rather than href — Build's href isn't confirmed
    // from the reference markup, and text-matching keeps Imagine/Skills-and-Connectors
    // working even if Grok changes their routes.
    const GE_SIDEBAR_NAV_HIDE_ITEMS = [
        { key: 'build', label: 'Build', get: () => featureHideBuildNav },
        { key: 'imagine', label: 'Imagine', get: () => featureHideImagineNav },
        { key: 'skills', label: 'Skills and Connectors', get: () => featureHideSkillsNav },
    ];

    function ge_scanSidebarNavHide() {
        const anyOn = GE_SIDEBAR_NAV_HIDE_ITEMS.some(i => i.get());
        ge_applyToggleStyle('ge-navhide-css', anyOn, '[data-ge-navhide] { display: none !important; }');
        document.querySelectorAll('[data-ge-navhide]').forEach(el => el.removeAttribute('data-ge-navhide'));
        if (!anyOn) return;
        document.querySelectorAll('[data-sidebar="menu-item"] a[data-sidebar="menu-button"]').forEach(link => {
            const span = link.querySelector('span.whitespace-nowrap');
            const text = span ? span.textContent.trim() : link.textContent.trim();
            const match = GE_SIDEBAR_NAV_HIDE_ITEMS.find(i => i.get() && i.label === text);
            if (!match) return;
            const target = link.closest('[data-sidebar="group"]') || link.closest('[data-sidebar="menu-item"]');
            if (target) target.setAttribute('data-ge-navhide', '1');
        });
    }

    // ══════════════════════════════════════════════════════════════
    //  3d. Hide Models from Model Dropdown (Heavy / Expert / Auto)
    // ══════════════════════════════════════════════════════════════
    const MODELS_HIDE_CSS_ID = 'ge-hide-models-css';

    function ge_applyHideModelsCSS(on) {
        ge_applyToggleStyle(MODELS_HIDE_CSS_ID, on, `
                [data-ge-hidden="model-heavy"] { display: none !important; }
                [data-ge-hidden="model-expert"] { display: none !important; }
                [data-ge-hidden="model-auto"] { display: none !important; }
                [data-ge-hidden="upgrade-heavy"] { display: none !important; }
                [data-ge-hidden="followups"] { display: none !important; }
            `);
    }

    // Walks elements matching `selector`, skipping ones already tagged with `checkedAttr`
    // (or `hideAttr` itself if no separate checkedAttr is given), tags matches — on the
    // element itself, or its nearest `containerSelector` ancestor — with hideAttr=hideValue.
    function ge_markElements({ selector, test, hideAttr, hideValue, checkedAttr, containerSelector }) {
        const skipAttr = checkedAttr || hideAttr;
        document.querySelectorAll(`${selector}:not([${skipAttr}])`).forEach(el => {
            if (checkedAttr) el.setAttribute(checkedAttr, '1');
            if (!test(el)) return;
            const target = containerSelector ? (el.closest(containerSelector) || el.parentElement) : el;
            if (target && target.getAttribute(hideAttr) !== hideValue) target.setAttribute(hideAttr, hideValue);
        });
    }

    // Mark "Upgrade to Heavy" buttons
    function ge_markUpgradeHeavyBtns() {
        if (!featureHideHeavy) return;
        ge_markElements({
            selector: 'button',
            test: btn => /^upgrade\s+to\s+heavy$/i.test(btn.textContent.trim()),
            hideAttr: 'data-ge-hidden', hideValue: 'upgrade-heavy',
        });
    }

    // Map of toggle state → model name → data attribute value
    function ge_markModelItems() {
        document.querySelectorAll('[data-ge-hidden^="model-"]').forEach(el => el.removeAttribute('data-ge-hidden'));
        const active = [];
        if (featureHideHeavy) active.push(['Heavy', 'model-heavy']);
        if (featureHideExpert) active.push(['Expert', 'model-expert']);
        if (featureHideAuto) active.push(['Auto', 'model-auto']);
        if (active.length === 0) return;
        for (const menu of document.querySelectorAll('[role="menu"]')) {
            for (const item of menu.querySelectorAll('[role="menuitem"]')) {
                const span = item.querySelector('span.font-semibold');
                if (!span) continue;
                const text = span.textContent.trim();
                for (const [name, attr] of active) {
                    if (new RegExp('^' + name + '$', 'i').test(text)) {
                        item.setAttribute('data-ge-hidden', attr);
                        break;
                    }
                }
            }
        }
    }

    // ══════════════════════════════════════════════════════════════
    //  3e. Hide Follow-up Prompts
    // ══════════════════════════════════════════════════════════════
    function ge_markFollowupContainers() {
        if (!featureHideFollowups) {
            document.querySelectorAll('[data-ge-hidden="followups"]').forEach(el => el.removeAttribute('data-ge-hidden'));
            return;
        }
        // Follow-ups appear as a flex-col container of buttons whose icon is corner-down-right.
        ge_markElements({
            selector: 'button',
            test: btn => !!btn.querySelector('svg.lucide-corner-down-right, svg[class*="corner-down-right"]'),
            hideAttr: 'data-ge-hidden', hideValue: 'followups',
            checkedAttr: 'data-ge-followup-checked',
            containerSelector: 'div.flex.flex-col.gap-1.mt-2.items-start.w-full',
        });
    }

    // ══════════════════════════════════════════════════════════════
    //  3f. Auto Private Mode
    // ══════════════════════════════════════════════════════════════
    let _ge_privateTimer = null;
    function ge_autoEnablePrivateMode() {
        if (!featureAutoPrivate) return;
        const privateBtn = document.querySelector('a[aria-label="Switch to Private Chat"]');
        if (privateBtn) {
            privateBtn.click();
            logDebug('[AutoPrivate] Activated private mode');
        }
    }

    // ══════════════════════════════════════════════════════════════
    //  3g. Privacy Mode — hide/blur sensitive chat names in sidebar
    // ══════════════════════════════════════════════════════════════
    // Grouped by category so Privacy Mode can hide/show each independently
    // (e.g. hide NSFW + Drugs but leave Medical visible) instead of one flat list.
    const GE_PRIVACY_CATEGORIES = {
      nsfw: { label: 'NSFW / Sexual', patterns: [
        /\bsex\b/i, /\bsexy/i, /\bporn/i, /\bhentai/i, /\bnude/i, /\bnaked/i, /\bnsfw/i,
        /\berotic/i, /\bfetish/i, /\borgasm/i, /\bmasturbat/i, /\bblowjob/i,
        /\banal\b/i, /\bcum\b/i, /\bdick\b/i, /\bcock\b/i, /\bpussy/i,
        /\bboob/i, /\btits\b/i, /\bass\b/i, /\bfuck/i, /\bhorny/i,
        /\bslut/i, /\bwhore/i, /\bdomin/i, /\bsubmiss/i, /\bbdsm/i,
        /\bkink/i, /\bsexual/i, /\bintimate/i, /\blust/i, /\bseduct/i,
        /\bstrip(p|t)/i, /\bthreesome/i, /\borgy/i, /\bdildo/i, /\bvibrat/i,
        /\bbondage/i, /\bgenital/i, /\bpenis/i, /\bvagina/i, /\bclitor/i,
        /\bbreast/i, /\bnipple/i, /\berection/i, /\bejaculat/i,
        /\bsemen/i, /\bvirgin/i, /\bprostitut/i, /\bescort\b/i, /\bhooker/i,
        /\bcunnilingus/i, /\bfellatio/i, /\bsodomy/i, /\baphrodisiac/i,
        /\bxxx/i, /\bx-rated/i, /\badult\s*(content|video|film|movie)/i,
        /\bmommy/i, /\bmom\b/i, /\bdaddy/i, /\bflirt/i, /\bfurr(y|ies)/i,
        /\bfuta\b/i, /\bfutanari/i, /\brule\s*34/i, /\br34\b/i,
        /\bpornhub/i, /\bxvideos/i, /\bxhamster/i, /\bredtube/i, /\byouporn/i,
        /\bbrazzers/i, /\bonlyfans/i, /\bchaturbate/i, /\bxnxx/i, /\bspankbang/i,
        /\bmyfreecams/i, /\blivejasmin/i, /\bfanvue/i, /\bfansly/i,
        // More adult platforms / services
        /\bmanyvids/i, /\bjustforfans/i, /\biwantclips/i, /\bclips4sale/i,
        /\bloyalfans/i, /\bmym\s*fans/i, /\bfrisk\b/i, /\bsextpanther/i,
        /\bniteflirt/i, /\bfancentro/i, /\bapclips/i, /\bbentbox/i,
        /\bfantime/i, /\badmireme/i, /\bpocketstars/i, /\bavn\s*stars/i,
        // Explicit descriptors & commonly requested terms
        /\bswallow(s|ing|ed)?\b/i, /\bpleasure/i, /\buncensored/i,
        /\blewd/i, /\bexplicit/i, /\bhardcore/i, /\bsoftcore/i,
        /\bmoan(s|ing|ed)?\b/i, /\bnudes?\b/i, /\bleaked?\b/i,
        /\bpremium\s*snap/i, /\bsnapchat\s*premium/i, /\bprivate\s*show/i,
        /\bcustom\s*(video|pic|content|request)/i,
        // Kinks / acts frequently flagged in adult contexts
        /\bsquirt(s|ing|ed)?\b/i, /\bedging\b/i, /\bgoon(ing|ed)\b/i,
        /\bbareback(s|ing|ed)?\b/i, /\brimjob\b/i, /\brimming\b/i, /\bpegging\b/i,
        /\bcuckold(s|ing|ed)?\b/i, /\bcuck\b/i, /\bhotwife\b/i,
        /\bfemdom\b/i, /\bfindom\b/i, /\bjoi\b/i, /\bgfe\b/i,
        /\bgag(s|ging|ged)?\b/i,
        // Adult anime / subgenre terms
        /\byaoi\b/i, /\byuri\b/i, /\bdoujinshi\b/i, /\becchi\b/i,
        /\bahegao\b/i, /\btentacle/i, /\bfan[\s-]*service/i,
        /\bcreampie/i, /\bthroat(ing|ed|s)?\b/i, /\bdeepthroat/i, /\bgangbang/i, /\b(dp)\b/i,
        /\bfacial\b/i, /\bcumdump/i, /\bbreeding/i, /\bimpreg/i,
        /\bface[\s-]*fuck(ing|ed|s)?\b/i, /\bthroat[\s-]*fuck(ing|ed|s)?\b/i,
        /\bnoncon/i, /\bcnc\b/i, /\bconsensual\s+non[\s-]?consent\b/i, /\bconsent\s*\/\s*non.con/i, /\bnon.con/i,
        /\bstepmom/i, /\bstepsis/i, /\bstepbro/i, /\bstepdad/i, /\bstepfath/i,
        /\bmilf/i, /\bdilf/i, /\bcougar/i, /\brape/i,
        // Additional NSFW / kink terms
        /\bcum[\s-]*slut/i, /\bcumslut/i,
        /\bbitch/i, /\bbreed\b/i, /\bbreeder\b/i,
        /\bjerk\s*off/i, /\bwank/i, /\bhand[\s-]*job/i, /\btit[\s-]*job/i, /\bfoot[\s-]*job/i, /\bball[\s-]*bust/i,
        /\bbukkake/i, /\bglory[\s-]*hole/i,
        /\bcunt/i, /\bcum[\s-]*shot/i, /\bmoney[\s-]*shot/i, /\bblow[\s-]*bang/i,
        /\bcam[\s-]*girl/i, /\bcam[\s-]*boy/i, /\bcam[\s-]*show/i,
        /\bsexting/i, /\bphone[\s-]*sex/i, /\bnude[\s-]*selfie/i, /\bdick[\s-]*pic/i,
        /\btitties/i, /\bboobies/i, /\basshole/i,
        /\bstrip[\s-]*tease/i, /\blap[\s-]*dance/i, /\btwerk/i,
        /\bstrip[\s-]*club/i, /\bbrothel/i, /\bred[\s-]*light/i, /\bmassage[\s-]*parlor/i, /\bhappy[\s-]*ending/i,
        /\blingerie/i, /\bgarter/i, /\bstockings/i, /\bpanties/i, /\bthong/i, /\bbikini/i,
        /\btopless/i, /\bbottomless/i,
        /\bpublic[\s-]*sex/i, /\boutdoor[\s-]*sex/i, /\bcar[\s-]*sex/i, /\boffice[\s-]*sex/i,
        /\bvoyeur/i, /\bexhibition(ist)?\b/i, /\borgasm[\s-]*denial/i,
        /\bschool[\s-]*girl/i, /\bnurse\b/i, /\bmaid\b/i,
        /\bpet\s*play/i, /\bddlg|dd\/lg|mdlb|md\/lb|cgl|cg\/l/i,
        /\brope\s*play/i, /\bshibari/i, /\bkinbaku/i, /\bwax\s*play/i, /\bage\s*play/i, /\babdl|adult\s*baby/i,
        /\bfist(ing)?\b/i, /\bdouble[\s-]*penetration/i, /\btriple[\s-]*penetration/i, /\bspit[\s-]*roast/i,
        /\brough[\s-]*sex/i, /\bchoke\s*(play|me|sex)/i, /\bchoking/i, /\bspank(ing)?\b/i,
        /\bdegrad(e|ing|ation)\b/i, /\bhumiliat(e|ing|ion)\b/i, /\btaboo/i, /\bincest/i,
        /\bpunish(ment)?\b/i, /\bbrat(ty)?\b/i, /\bcollar(ed)?\b/i, /\bleash/i,
        /\bsafeword/i, /\baftercare/i,
      ]},
      medical: { label: 'Medical / Personal', patterns: [
        // Personal / medical / embarrassing
        /\bstd\b/i, /\bherpes/i, /\bgonorrhea/i, /\bchlamydia/i, /\bsyphilis/i,
        /\bhiv\b/i, /\baids\b/i, /\bpregnant/i, /\bpregnancy/i, /\babortion/i,
        /\bmenstrua/i, /\bdiarrhea/i, /\bconstipat/i, /\bembarrass/i,
        /\baddiction/i, /\bdrug\s*(use|abuse|deal)/i, /\boverdose/i,
        /\balcohol(ic|ism)/i, /\brehab\b/i, /\btherapist/i, /\btherapy\b/i,
        /\bdepression/i, /\banxiety\b/i, /\bmental\s*health/i,
        /\bsuicid/i, /\bself.harm/i,
        /\bestrogen/i, /\btestosterone/i, /\bhrt\b/i, /\bhormones?\b/i,
        /\bestradiol/i, /\bpuberty/i, /\bsteroids?\b/i,
        // Abuse / assault
        /\babuse/i, /\bdomestic\s*(violence|abuse)/i, /\bassault/i,
        /\bsexual\s*assault/i, /\bforced\b/i, /\bmolest/i, /\bstalking/i,
        /\bharass/i, /\bbatter(ed|y|ing)/i,
      ]},
      drugs: { label: 'Drugs', patterns: [
        // Drugs
        /\bweed\b/i, /\bmarijuana/i, /\bcannabis/i, /\bcocaine/i, /\bcoke\b/i, /\bcrack\b/i,
        /\bheroin/i, /\bmeth\b/i, /\bmethamphetamine/i, /\bamphetamine/i,
        /\blsd\b/i, /\bshroom/i, /\bpsilocybin/i, /\bdmt\b/i, /\bketamine/i,
        /\becstasy/i, /\bmdma/i, /\bfentanyl/i, /\bxanax/i, /\badderall/i,
        /\bkratom/i, /\bopioid/i, /\bopiate/i, /\bbenzo/i,
        /\bthc\b/i, /\bcbd\b/i, /\bedible/i, /\bdab\b/i, /\bdabs\b/i,
        /\bvape/i, /\bsmok(e|ing)/i,
        // More drugs
        /\blean\b/i, /\bpurple\s*drank/i, /\bsyrup\b/i,
        /\bmolly\b/i,
        /\bsativa\b/i, /\bindica\b/i, /\bkush\b/i,
        /\bblunt\b/i, /\bjoint\b/i, /\bbong\b/i, /\bpipe\b/i, /\bbowl\b/i, /\broach\b/i,
        /\bvape\s*pen/i, /\bdab\s*rig/i,
        /\bwax\b/i, /\bcrumble\b/i, /\bshatter\b/i, /\blive\s*resin/i, /\brosin\b/i, /\bdistillate/i,
        /\bhash\b/i, /\bhashish/i, /\bkief\b/i,
        /\bsalvia\b/i, /\bpeyote\b/i, /\bmescaline\b/i, /\bayahuasca\b/i, /\bibogaine\b/i,
        /\bghb\b/i, /\bgbl\b/i, /\bpoppers\b/i, /\brush\b/i,
        /\bnitrous\b/i, /\bwhippets\b/i, /\binhalant/i, /\bhuffing\b/i,
        /\bdxm\b/i, /\btriple\s*c/i,
        /\bbenzedrex\b/i, /\bpropylhexedrine\b/i,
        /\bmethadone\b/i, /\bsuboxone\b/i, /\bsubutex\b/i, /\bbuprenorphine\b/i, /\bnaltrexone\b/i, /\bnaloxone\b/i,
        /\btramadol\b/i, /\bcodeine\b/i, /\boxycodone\b/i, /\boxy\b/i, /\bpercocet\b/i, /\bvicodin\b/i, /\bhydrocodone\b/i, /\bmorphine\b/i,
      ]},
      legal: { label: 'Legal', patterns: [
        // Legal
        /\blawsuit/i, /\battorney/i, /\blawyer/i, /\blegal\s*(advice|issue|trouble|help)/i,
        /\bcourt\b/i, /\bsubpoena/i, /\bindict/i, /\bfelony/i, /\bmisdemeanor/i,
        /\bbail\b/i, /\bparole/i, /\bprobation/i, /\barrest/i, /\bwarrant/i,
        /\bsettlement/i, /\blitigat/i, /\bdefendant/i, /\bplaintiff/i,
        /\blegality/i,
      ]},
      weapons: { label: 'Weapons / Self-defense', patterns: [
        // Guns / ammo / self-defense
        /\bgun\b/i, /\bguns\b/i, /\bfirearm/i, /\brifle/i, /\bshotgun/i,
        /\bpistol/i, /\bhandgun/i, /\bholster/i, /\bammo\b/i, /\bammunition/i,
        /\bcaliber/i, /\bcartridge/i, /\bbullet/i, /\bmagazine\s*(clip)/i,
        /\bself.defen[sc]e/i, /\bconcealed\s*carry/i, /\bopen\s*carry/i,
        /\bar.?15/i, /\bak.?47/i, /\bglock/i, /\bsig\s*sauer/i,
        /\bsmith\s*(&|and)\s*wesson/i, /\bremington/i, /\bweapon/i,
        /\.cal\b/i, /\bcal\b/i, /\b9mm/i, /\b45\s*acp/i, /\b223\b/i, /\b556/i,
        // Bladed / melee weapons
        /\bknife\b/i, /\bknives\b/i, /\bblade\b/i, /\bdagger/i, /\bstiletto/i,
        /\bsword/i, /\bmachete/i, /\bbowie/i, /\bflick\s*knife/i, /\bswitchblade/i,
        /\bbayonet/i, /\bspear/i, /\bnunchuck/i, /\bkatar/i, /\bkunai/i,
        // Archery / projectile
        /\bbow\s*and\s*arrow/i, /\bcrossbow/i, /\bslingshot/i, /\bblowgun/i,
        // Less-lethal / self-defense tools
        /\btaser\b/i, /\bstun\s*gun/i, /\bpepper\s*spray/i, /\bmace\s*spray/i,
        /\bkubotan/i, /\bblackjack\b/i, /\bbaton\b/i, /\bnunchaku/i,
      ]},
    };

    // ── Per-category enable state (all on by default — matches pre-category behavior) ──
    function ge_isPrivacyCategoryOn(key) {
        return getState(`GrokEnhancer_PrivacyCat_${key}`, true);
    }
    function ge_setPrivacyCategoryOn(key, on) {
        setState(`GrokEnhancer_PrivacyCat_${key}`, on);
    }

    // ── User-added words/regexes (settings UI) ──
    function ge_getPrivacyCustomWords() {
        return getState('GrokEnhancer_StreamerCustomWords', []);
    }
    function ge_savePrivacyCustomWords(list) {
        setState('GrokEnhancer_StreamerCustomWords', list);
    }

    // Pre-compile a single combined regex for performance; rebuilt when custom words
    // or category toggles change.
    let _GE_PRIVACY_COMBINED = null;
    function ge_rebuildPrivacyRegex() {
        const sources = [];
        for (const key of Object.keys(GE_PRIVACY_CATEGORIES)) {
            if (!ge_isPrivacyCategoryOn(key)) continue;
            sources.push(...GE_PRIVACY_CATEGORIES[key].patterns.map(r => r.source));
        }
        for (const w of ge_getPrivacyCustomWords()) {
            if (!w.text) continue;
            if (w.isRegex) {
                try { new RegExp(w.text); sources.push(w.text); } catch (_) { /* invalid regex, skip */ }
            } else {
                sources.push('\\b' + w.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
            }
        }
        // An empty pattern would compile to /(?:)/, which matches every string —
        // fall back to a regex that never matches instead.
        _GE_PRIVACY_COMBINED = sources.length ? new RegExp(sources.join('|'), 'i') : /(?!)/;
    }
    ge_rebuildPrivacyRegex();

    function ge_applyPrivacyCSS(on) {
        // Either hide matching items completely or blur them, depending on the blur toggle.
        const blur = on && featurePrivacyBlur;
        const css = blur
            ? `[data-ge-privacy-hide], [data-ge-privacy-row] {
                    filter: blur(8px) !important;
                    opacity: 0.7 !important;
                    user-select: none !important;
                    contain: paint !important;
                    will-change: filter !important;
                }`
            : `[data-ge-privacy-hide] { display: none !important; }
               [data-ge-privacy-row] { display: none !important; }`;
        ge_applyToggleStyle('ge-privacy-css', on, css);
        if (!on) {
            document.querySelectorAll('[data-ge-privacy-hide]').forEach(e => e.removeAttribute('data-ge-privacy-hide'));
            document.querySelectorAll('[data-ge-privacy-row]').forEach(e => e.removeAttribute('data-ge-privacy-row'));
            document.querySelectorAll('[data-ge-privacy-checked]').forEach(e => e.removeAttribute('data-ge-privacy-checked'));
            document.querySelectorAll('[data-ge-privacy-title]').forEach(e => { e.removeAttribute('data-ge-privacy-title'); e.style.removeProperty('visibility'); });
            _ge_privacyTitleCache.clear();
            if (_ge_privacyRealTitle !== null) { document.title = _ge_privacyRealTitle; _ge_privacyRealTitle = null; }
            _ge_privacyHiddenCount = 0;
            ge_updatePrivacyBadge();
        }
    }

    // Sidebar footer identity (avatar/username/email) — static once rendered, so
    // plain CSS per toggle is enough, no marking/scanning needed like the chat list.
    function ge_applyFooterPrivacyCSS() {
        const rules = [];
        if (featurePrivacyMode && featureHideAvatar) rules.push('[data-sidebar="footer"] img[alt="pfp"] { visibility: hidden !important; }');
        if (featurePrivacyMode && featureHideUsername) rules.push('[data-sidebar="footer"] span.text-sm.font-medium.truncate.leading-tight.text-fg-primary { visibility: hidden !important; }');
        if (featurePrivacyMode && featureHideEmail) rules.push('[data-sidebar="footer"] span.text-xs.truncate.leading-tight.text-fg-secondary { visibility: hidden !important; }');
        ge_applyToggleStyle('ge-footer-privacy-css', rules.length > 0, rules.join('\n'));
    }

    function _ge_testSensitive(text) {
        if (!text) return false;
        return _GE_PRIVACY_COMBINED.test(text);
    }

    // Conversation id -> { text, sensitive }, filled in as sidebar links are scanned.
    // Lets the active-chat-title masker (below) know whether the *currently open*
    // chat is sensitive without re-deriving it from the DOM.
    const _ge_privacyTitleCache = new Map();

    function _ge_queryIncludingSelf(root, selector) {
        if (!root) return [];
        const out = [];
        if (root.matches?.(selector)) out.push(root);
        if (root.querySelectorAll) out.push(...root.querySelectorAll(selector));
        return out;
    }

    let _ge_privacyHiddenCount = 0;

    function ge_updatePrivacyBadge() {
        const badge = document.getElementById('ge-privacy-badge');
        if (!badge) return;
        if (_ge_privacyHiddenCount <= 0) { badge.textContent = ''; return; }
        const label = featurePrivacyBlur ? 'blurred' : 'hidden';
        badge.textContent = ` (${_ge_privacyHiddenCount} ${label})`;
    }

    // scope: undefined/null = full document scan (initial load, toggle-on, word-list edits).
    // Otherwise an array of newly-added DOM nodes — only those are scanned, so routine
    // mutation-observer churn doesn't re-walk the whole sidebar every time.
    function ge_scanPrivacySensitive(scope) {
        if (!featurePrivacyMode) return;
        const roots = scope ? scope : [document];

        // 1) Sidebar chat links: [data-sidebar] a[href^="/c/"]
        for (const root of roots) {
            for (const link of _ge_queryIncludingSelf(root, '[data-sidebar] a[href^="/c/"]')) {
                if (link.hasAttribute('data-ge-privacy-checked')) continue;
                link.setAttribute('data-ge-privacy-checked', '1');
                const span = link.querySelector('span');
                const text = span ? span.textContent.trim() : link.textContent.trim();
                const sensitive = _ge_testSensitive(text);
                if (sensitive) link.setAttribute('data-ge-privacy-hide', '1');
                const cid = ge_extractPostId(link.getAttribute('href'));
                if (cid) _ge_privacyTitleCache.set(cid, { text, sensitive });
            }
        }

        // 2) Command menu dialog ("See all" — both small and large versions)
        for (const root of roots) {
            for (const item of _ge_queryIncludingSelf(root, '[data-analytics-name="command_menu"] [cmdk-item][data-value^="conversation:"]')) {
                if (item.hasAttribute('data-ge-privacy-checked')) continue;
                item.setAttribute('data-ge-privacy-checked', '1');
                const titleSpan = item.querySelector('span.truncate');
                const text = titleSpan ? titleSpan.textContent.trim() : '';
                if (_ge_testSensitive(text)) item.setAttribute('data-ge-privacy-row', '1');
            }
        }

        _ge_privacyHiddenCount = document.querySelectorAll('[data-ge-privacy-hide],[data-ge-privacy-row]').length;
        ge_updatePrivacyBadge();
        ge_maskPrivacyTitle();
    }

    // Forces a clean re-scan of the whole document — needed after the sensitive-word
    // list changes, since already-checked items must be re-evaluated against it.
    function ge_rescanPrivacyFull() {
        document.querySelectorAll('[data-ge-privacy-checked]').forEach(e => e.removeAttribute('data-ge-privacy-checked'));
        document.querySelectorAll('[data-ge-privacy-hide]').forEach(e => e.removeAttribute('data-ge-privacy-hide'));
        document.querySelectorAll('[data-ge-privacy-row]').forEach(e => e.removeAttribute('data-ge-privacy-row'));
        _ge_privacyTitleCache.clear();
        ge_scanPrivacySensitive();
    }

    // Grok's own React re-renders (selecting a chat, list virtualization) can strip
    // our data-ge-privacy-* attributes off an existing node without removing/adding
    // it, so the childList-only observers elsewhere never notice — Privacy Mode then
    // silently "un-hides" until the next full page load. Watch for that churn too.
    // ponytail: body-wide attribute watch, not a per-node retry-attach; cheap no-op
    // when Privacy Mode is off, upgrade to a scoped observer if this proves too broad.
    let _ge_privacyGuardTimer = null;
    function ge_startPrivacyGuardObserver() {
        const guard = new MutationObserver((mutations) => {
            if (!featurePrivacyMode) return;
            // Only react when a node that's supposed to carry our marker has lost it
            // (a real React re-render stripped our attributes) — not on every incidental
            // class/aria-selected flip. cmdk sets aria-selected on hover-highlight alone,
            // which used to false-trigger a full rescan on every mouse move over the
            // "See all chats" list, re-toggling filter:blur() on hundreds of items.
            const relevant = mutations.some(m => {
                const el = m.target.closest?.('[data-sidebar] a[href^="/c/"], [data-analytics-name="command_menu"] [cmdk-item]');
                return el && !el.hasAttribute('data-ge-privacy-checked');
            });
            if (!relevant) return;
            clearTimeout(_ge_privacyGuardTimer);
            _ge_privacyGuardTimer = setTimeout(ge_rescanPrivacyFull, 150);
        });
        guard.observe(document.body, {
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'data-state', 'aria-selected', 'aria-current'],
        });
    }

    // Single entry point for turning Privacy Mode on/off — used by both the panel
    // toggle and the panic hotkey so they always stay in sync.
    function ge_setPrivacyMode(on) {
        featurePrivacyMode = on;
        setState('GrokEnhancer_Streamer', on);
        ge_applyPrivacyCSS(on);
        ge_applyFooterPrivacyCSS();
        if (on) {
            // Rescan immediately so already-rendered items hide, then again after the
            // current event/mutation batch settles in case React is mid-render.
            ge_rescanPrivacyFull();
            requestAnimationFrame(() => ge_rescanPrivacyFull());
        }
        const checkbox = document.querySelector('#ge-panel #ge-privacy-toggle-input');
        if (checkbox) checkbox.checked = on;
    }

    // Turning Privacy Mode off is the sensitive direction — gate it behind
    // the PIN if one's set, so a panic hotkey press can't be trivially
    // undone by whoever's next at the keyboard. Turning it on is always
    // immediate. No PIN set at all = no gating, same as before.
    function ge_requestPrivacyModeChange(on) {
        if (on || !_ge_hasPinSet()) { ge_setPrivacyMode(on); return; }
        // The panel checkbox's native `change` event fires after the browser
        // already flipped input.checked — resync it back to "on" immediately
        // so the UI doesn't lie while the PIN prompt is open or if cancelled.
        const checkbox = document.querySelector('#ge-panel #ge-privacy-toggle-input');
        if (checkbox) checkbox.checked = true;
        ge_promptPinVerify(() => ge_setPrivacyMode(false), 'Enter PIN to disable Privacy Mode', 'Unlock');
    }

    // ── Panic hotkey: instantly toggle Privacy Mode from anywhere, including
    // while typing in the chat composer — a panic hotkey has to fire the instant
    // it's needed, not just when focus happens to be elsewhere. ──
    let ge_privacyHotkey = getState('GrokEnhancer_StreamerHotkey', { ctrl: true, shift: true, alt: false, meta: false, key: 'h' });

    function ge_formatHotkey(combo) {
        const parts = [];
        if (combo.ctrl) parts.push('Ctrl');
        if (combo.shift) parts.push('Shift');
        if (combo.alt) parts.push('Alt');
        if (combo.meta) parts.push('Meta');
        parts.push(combo.key.length === 1 ? combo.key.toUpperCase() : combo.key);
        return parts.join('+');
    }

    function ge_matchesHotkey(e, combo) {
        return !!combo &&
            e.ctrlKey === !!combo.ctrl && e.shiftKey === !!combo.shift &&
            e.altKey === !!combo.alt && e.metaKey === !!combo.meta &&
            e.key.toLowerCase() === combo.key.toLowerCase();
    }

    // Use capture phase so Grok's own keydown handlers can't stopPropagation
    // before the panic hotkey fires.
    document.addEventListener('keydown', (e) => {
        if (ge_matchesHotkey(e, ge_privacyHotkey)) {
            e.preventDefault();
            ge_requestPrivacyModeChange(!featurePrivacyMode);
        }
    }, true);

    // ── Auto-lock on idle: enable Privacy Mode automatically after N minutes
    // of no mouse/keyboard/tab activity. ──
    let _ge_idleTimer = null;
    function ge_resetIdleTimer() {
        clearTimeout(_ge_idleTimer);
        if (!featureAutoLock) return;
        _ge_idleTimer = setTimeout(() => {
            if (!featurePrivacyMode) ge_setPrivacyMode(true);
        }, ge_autoLockMinutes * 60 * 1000);
    }
    function ge_startIdleWatch() {
        ['mousemove', 'keydown', 'click', 'scroll'].forEach(evt =>
            document.addEventListener(evt, ge_resetIdleTimer, { passive: true }));
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) ge_resetIdleTimer();
        });
        ge_resetIdleTimer();
    }

    // ── PIN lock — so someone who has your unlocked laptop can't flip Privacy
    // Mode off (via the panel checkbox or the panic hotkey) or change/reset
    // the PIN itself. The settings panel always opens freely. Stored as a
    // SHA-256 hash, never the PIN itself; forgetting it just means "Reset PIN". ──
    async function ge_sha256Hex(str) {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
        return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    }

    function ge_openPinDialog({ title, confirmLabel, onSubmit }) {
        const existing = document.getElementById('ge-pin-modal');
        if (existing) { try { existing.close(); } catch (_) {} existing.remove(); }

        const dlg = document.createElement('dialog');
        dlg.id = 'ge-pin-modal';
        dlg.style.cssText = 'background:#1a1a1a;border:1px solid #333;border-radius:12px;width:260px;padding:20px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#ccc;text-align:center;';
        const bkStyle = document.createElement('style');
        bkStyle.textContent = '#ge-pin-modal::backdrop{background:rgba(0,0,0,0.6)}';
        dlg.appendChild(bkStyle);

        const h = document.createElement('h2');
        h.textContent = title;
        h.style.cssText = 'margin:0 0 12px;font-size:14px;color:#fff;';
        dlg.appendChild(h);

        const input = document.createElement('input');
        input.type = 'password';
        input.inputMode = 'numeric';
        input.maxLength = 4;
        input.style.cssText = 'width:100%;box-sizing:border-box;background:#111;color:#fff;border:1px solid #333;border-radius:6px;padding:8px;font-size:20px;letter-spacing:8px;text-align:center;';
        dlg.appendChild(input);

        const err = document.createElement('div');
        err.style.cssText = 'color:#e55;font-size:11px;height:16px;margin-top:6px;';
        dlg.appendChild(err);

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:8px;margin-top:12px;';
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = 'flex:1;background:#333;color:#aaa;border:none;border-radius:6px;padding:8px;cursor:pointer;';
        cancelBtn.addEventListener('click', () => { dlg.close(); dlg.remove(); });
        const okBtn = document.createElement('button');
        okBtn.textContent = confirmLabel;
        okBtn.style.cssText = 'flex:1;background:#444;color:#fff;border:none;border-radius:6px;padding:8px;cursor:pointer;';
        const submit = async () => {
            const ok = await onSubmit(input.value, err);
            if (ok) { dlg.close(); dlg.remove(); }
            else { input.value = ''; input.focus(); }
        };
        okBtn.addEventListener('click', submit);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(okBtn);
        dlg.appendChild(btnRow);

        document.body.appendChild(dlg);
        dlg.showModal();
        input.focus();
    }

    // Whether a PIN has actually been set — the authoritative "does gating
    // apply at all" check, since it's the actual secret being protected
    // (more reliable than the featurePinLock flag, a separate key).
    function _ge_hasPinSet() {
        return !!getState('GrokEnhancer_SettingsPinHash', null);
    }

    function ge_promptPinVerify(onSuccess, title, confirmLabel) {
        ge_openPinDialog({
            title,
            confirmLabel,
            onSubmit: async (val, errEl) => {
                if (!/^\d{4}$/.test(val)) { errEl.textContent = 'Enter a 4-digit PIN'; return false; }
                const stored = getState('GrokEnhancer_SettingsPinHash', null);
                const hash = await ge_sha256Hex(val);
                if (!stored || hash === stored) { onSuccess(); return true; }
                errEl.textContent = 'Incorrect PIN';
                return false;
            },
        });
    }

    function ge_setupPin(onDone) {
        ge_openPinDialog({
            title: 'Set a 4-digit PIN',
            confirmLabel: 'Next',
            onSubmit: async (first, errEl) => {
                if (!/^\d{4}$/.test(first)) { errEl.textContent = 'Enter a 4-digit PIN'; return false; }
                ge_openPinDialog({
                    title: 'Confirm PIN',
                    confirmLabel: 'Save',
                    onSubmit: async (second, errEl2) => {
                        if (second !== first) { errEl2.textContent = "PINs don't match"; return false; }
                        const hash = await ge_sha256Hex(first);
                        setState('GrokEnhancer_SettingsPinHash', hash);
                        featurePinLock = true;
                        setState('GrokEnhancer_PinLock', true);
                        if (onDone) onDone();
                        return true;
                    },
                });
                return true;
            },
        });
    }

    // ── Mask the open chat's own title (browser tab + on-page header) ──
    let _ge_privacyRealTitle = null;

    function ge_maskPrivacyTitle() {
        const cid = ge_extractPostId(location.pathname);
        const cached = cid ? _ge_privacyTitleCache.get(cid) : null;
        const sensitive = !!(featurePrivacyMode && cached && cached.sensitive);

        if (sensitive) {
            if (_ge_privacyRealTitle === null) _ge_privacyRealTitle = document.title;
            document.title = 'Grok';
        } else if (_ge_privacyRealTitle !== null) {
            document.title = _ge_privacyRealTitle;
            _ge_privacyRealTitle = null;
        }

        document.querySelectorAll('[data-ge-privacy-title]').forEach(el => {
            el.removeAttribute('data-ge-privacy-title');
            el.style.removeProperty('visibility');
        });
        if (!sensitive) return;

        // ponytail: exact header selector unverified against live grok.com DOM — matched by
        // text against the known sidebar title instead of a brittle guessed classname.
        const heading = [...document.querySelectorAll('main h1, main h2, [role="heading"]')]
            .find(el => el.textContent.trim() === cached.text && !el.closest('[data-sidebar]'));
        if (heading) {
            heading.setAttribute('data-ge-privacy-title', '1');
            heading.style.setProperty('visibility', 'hidden', 'important');
        }
    }

    function ge_openPrivacyWordsEditor() {
        let existing = document.getElementById('ge-privacy-words-modal');
        if (existing) { try { existing.close(); } catch (_) {} existing.remove(); }

        const dlg = document.createElement('dialog');
        dlg.id = 'ge-privacy-words-modal';
        dlg.style.cssText = 'background:#1a1a1a;border:1px solid #333;border-radius:12px;width:420px;max-width:90vw;max-height:80vh;overflow-y:auto;padding:20px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#ccc;';
        const bkStyle = document.createElement('style');
        bkStyle.textContent = '#ge-privacy-words-modal::backdrop{background:rgba(0,0,0,0.6)}';
        dlg.appendChild(bkStyle);

        function closeModal() { try { dlg.close(); } catch (_) {} dlg.remove(); }
        function reopen() { closeModal(); ge_openPrivacyWordsEditor(); }

        const title = document.createElement('h2');
        title.textContent = 'Privacy Mode — Custom Words';
        title.style.cssText = 'margin:0 0 16px;font-size:16px;color:#fff;';
        dlg.appendChild(title);

        const list = ge_getPrivacyCustomWords();
        if (list.length === 0) {
            const empty = document.createElement('div');
            empty.textContent = 'No custom words yet.';
            empty.style.cssText = 'color:#666;font-size:12px;padding:8px 0;';
            dlg.appendChild(empty);
        }

        list.forEach(w => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;';
            const txt = document.createElement('span');
            txt.textContent = w.text + (w.isRegex ? ' (regex)' : '');
            txt.style.cssText = 'flex:1;font-size:12px;color:#ddd;word-break:break-all;';
            row.appendChild(txt);
            const delBtn = document.createElement('button');
            delBtn.textContent = 'Del';
            delBtn.style.cssText = 'background:#333;color:#f66;border:none;border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;';
            delBtn.addEventListener('click', () => {
                ge_savePrivacyCustomWords(ge_getPrivacyCustomWords().filter(x => x.id !== w.id));
                ge_rebuildPrivacyRegex();
                ge_rescanPrivacyFull();
                reopen();
            });
            row.appendChild(delBtn);
            dlg.appendChild(row);
        });

        const addRow = document.createElement('div');
        addRow.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-top:12px;padding-top:12px;border-top:1px solid #333;';
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Word or regex to hide';
        input.style.cssText = 'background:#111;border:1px solid #333;border-radius:6px;padding:6px 8px;color:#ddd;font-size:12px;font-family:inherit;width:100%;box-sizing:border-box;outline:none;';
        addRow.appendChild(input);
        const regexLabel = document.createElement('label');
        regexLabel.style.cssText = 'font-size:11px;color:#aaa;display:flex;align-items:center;gap:6px;';
        const regexCheck = document.createElement('input');
        regexCheck.type = 'checkbox';
        regexLabel.appendChild(regexCheck);
        regexLabel.appendChild(document.createTextNode('Treat as regex'));
        addRow.appendChild(regexLabel);
        const addBtn = document.createElement('button');
        addBtn.textContent = '+ Add Word';
        addBtn.style.cssText = 'background:#444;color:#fff;border:none;border-radius:6px;padding:6px 16px;font-size:12px;cursor:pointer;align-self:flex-start;';
        addBtn.addEventListener('click', () => {
            const text = input.value.trim();
            if (!text) { input.style.borderColor = '#f66'; input.focus(); return; }
            if (regexCheck.checked) {
                try { new RegExp(text); } catch (_) { input.style.borderColor = '#f66'; input.focus(); return; }
            }
            const all = ge_getPrivacyCustomWords();
            all.push({ id: ge_generateId(), text, isRegex: regexCheck.checked });
            ge_savePrivacyCustomWords(all);
            ge_rebuildPrivacyRegex();
            ge_rescanPrivacyFull();
            reopen();
        });
        addRow.appendChild(addBtn);
        dlg.appendChild(addRow);

        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Close';
        closeBtn.style.cssText = 'background:#333;color:#aaa;border:none;border-radius:6px;padding:6px 16px;font-size:12px;cursor:pointer;margin-top:14px;';
        closeBtn.addEventListener('click', closeModal);
        dlg.appendChild(closeBtn);

        document.body.appendChild(dlg);
        dlg.showModal();
    }

    // ══════════════════════════════════════════════════════════════
    //  3h. Custom Response Styles
    // ══════════════════════════════════════════════════════════════
    function ge_getCustomStyles() {
        return getState('GrokEnhancer_CustomStyles', []);
    }
    function ge_saveCustomStyles(styles) {
        setState('GrokEnhancer_CustomStyles', styles);
    }
    function ge_generateId() {
        return 'ge_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5);
    }

    function ge_openStylesEditor(editId) {
        let existing = document.getElementById('ge-styles-modal');
        if (existing) { try { existing.close(); } catch(_){} existing.remove(); }

        const dlg = document.createElement('dialog');
        dlg.id = 'ge-styles-modal';
        dlg.style.cssText = 'background:#1a1a1a;border:1px solid #333;border-radius:12px;width:480px;max-width:90vw;max-height:80vh;overflow-y:auto;padding:20px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#ccc;';
        const bkStyle = document.createElement('style');
        bkStyle.textContent = '#ge-styles-modal::backdrop{background:rgba(0,0,0,0.6)}';
        dlg.appendChild(bkStyle);

        function closeModal() { try { dlg.close(); } catch(_){} dlg.remove(); }
        function reopen(id) { closeModal(); ge_openStylesEditor(id); }

        const title = document.createElement('h2');
        title.style.cssText = 'margin:0 0 16px;font-size:16px;color:#fff;';

        const contentArea = document.createElement('div');

        if (editId) {
            // ── Edit/Add form ──
            const editStyle = ge_getCustomStyles().find(s => s.id === editId);
            const isNew = !editStyle;
            const editing = editStyle || { id: ge_generateId(), name: '', description: '', instructions: '' };
            title.textContent = isNew ? 'Add Response Style' : 'Edit Response Style';

            const makeField = (labelText, value, type) => {
                const wrap = document.createElement('div');
                wrap.style.cssText = 'display:flex;flex-direction:column;gap:4px;margin-bottom:10px;';
                const lbl = document.createElement('label');
                lbl.textContent = labelText;
                lbl.style.cssText = 'font-size:11px;color:#aaa;';
                wrap.appendChild(lbl);
                let input;
                if (type === 'textarea') {
                    input = document.createElement('textarea');
                    input.style.cssText = 'background:#111;border:1px solid #333;border-radius:6px;padding:8px;color:#ddd;font-size:12px;resize:vertical;min-height:90px;font-family:inherit;width:100%;box-sizing:border-box;outline:none;';
                } else {
                    input = document.createElement('input');
                    input.type = 'text';
                    input.style.cssText = 'background:#111;border:1px solid #333;border-radius:6px;padding:6px 8px;color:#ddd;font-size:12px;font-family:inherit;width:100%;box-sizing:border-box;outline:none;';
                }
                input.value = value;
                wrap.appendChild(input);
                return { wrap, input };
            };
            const nameField = makeField('Name', editing.name);
            const descField = makeField('Description (optional)', editing.description);
            const instrField = makeField('Instructions \u2014 what should Grok do differently?', editing.instructions, 'textarea');
            contentArea.appendChild(nameField.wrap);
            contentArea.appendChild(descField.wrap);
            contentArea.appendChild(instrField.wrap);

            const fBtnRow = document.createElement('div');
            fBtnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:4px;';
            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = isNew ? 'Cancel' : 'Back';
            cancelBtn.style.cssText = 'background:#333;color:#aaa;border:none;border-radius:6px;padding:6px 16px;font-size:12px;cursor:pointer;';
            cancelBtn.addEventListener('click', () => isNew ? reopen() : reopen());
            fBtnRow.appendChild(cancelBtn);
            const saveBtn = document.createElement('button');
            saveBtn.textContent = isNew ? 'Add' : 'Save';
            saveBtn.style.cssText = 'background:#444;color:#fff;border:none;border-radius:6px;padding:6px 16px;font-size:12px;cursor:pointer;';
            saveBtn.addEventListener('click', () => {
                const name = nameField.input.value.trim();
                const desc = descField.input.value.trim();
                const instr = instrField.input.value.trim();
                if (!name) { nameField.input.style.borderColor = '#f66'; nameField.input.focus(); return; }
                if (!instr) { instrField.input.style.borderColor = '#f66'; instrField.input.focus(); return; }
                const all = ge_getCustomStyles();
                const entry = { id: editing.id, name, description: desc, instructions: instr };
                if (isNew) { all.push(entry); }
                else { const idx = all.findIndex(x => x.id === editing.id); if (idx >= 0) all[idx] = entry; else all.push(entry); }
                ge_saveCustomStyles(all);
                panelAddLog('Style "' + name + '" ' + (isNew ? 'added' : 'updated'));
                reopen();
            });
            fBtnRow.appendChild(saveBtn);
            contentArea.appendChild(fBtnRow);

            // Auto-focus name field after dialog opens
            setTimeout(() => nameField.input.focus(), 50);
        } else {
            // ── List view ──
            title.textContent = 'Custom Response Styles';
            const styles = ge_getCustomStyles();

            if (styles.length === 0) {
                const empty = document.createElement('div');
                empty.textContent = 'No custom styles yet. Click "+ Add Style" below.';
                empty.style.cssText = 'color:#666;font-size:12px;padding:8px 0;';
                contentArea.appendChild(empty);
            }

            styles.forEach(s => {
                const isActive = ge_activeStyleId === s.id;
                const card = document.createElement('div');
                card.style.cssText = 'background:' + (isActive ? '#1e2a1e' : '#222') + ';border-radius:8px;padding:10px;margin-bottom:8px;display:flex;align-items:center;gap:8px;';

                // Activate/deactivate button
                const toggleBtn = document.createElement('button');
                toggleBtn.textContent = isActive ? '\u2713' : '\u25CB';
                toggleBtn.title = isActive ? 'Deactivate' : 'Activate';
                toggleBtn.style.cssText = 'background:none;border:1px solid ' + (isActive ? '#4a4' : '#555') + ';color:' + (isActive ? '#4a4' : '#888') + ';border-radius:50%;width:22px;height:22px;font-size:11px;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;padding:0;';
                toggleBtn.addEventListener('click', () => {
                    if (ge_activeStyleId === s.id) {
                        ge_activeStyleId = null;
                        setState('GrokEnhancer_ActiveStyleId', null);
                        panelAddLog('Style "' + s.name + '" deactivated');
                    } else {
                        ge_activeStyleId = s.id;
                        setState('GrokEnhancer_ActiveStyleId', s.id);
                        panelAddLog('Style "' + s.name + '" activated');
                    }
                    reopen();
                });
                card.appendChild(toggleBtn);

                // Name + description
                const info = document.createElement('div');
                info.style.cssText = 'flex:1;min-width:0;';
                const nameEl = document.createElement('div');
                nameEl.textContent = s.name;
                nameEl.style.cssText = 'font-weight:600;font-size:13px;color:#fff;' + (isActive ? 'color:#6d6;' : '');
                info.appendChild(nameEl);
                if (s.description) {
                    const descEl = document.createElement('div');
                    descEl.textContent = s.description;
                    descEl.style.cssText = 'font-size:11px;color:#888;margin-top:2px;';
                    info.appendChild(descEl);
                }
                card.appendChild(info);

                // Edit button
                const editBtn = document.createElement('button');
                editBtn.textContent = 'Edit';
                editBtn.style.cssText = 'background:#333;color:#aaa;border:none;border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;';
                editBtn.addEventListener('click', () => reopen(s.id));
                card.appendChild(editBtn);

                // Delete button
                const delBtn = document.createElement('button');
                delBtn.textContent = 'Del';
                delBtn.style.cssText = 'background:#333;color:#f66;border:none;border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;';
                delBtn.addEventListener('click', () => {
                    if (!confirm('Delete "' + s.name + '"?')) return;
                    ge_saveCustomStyles(ge_getCustomStyles().filter(x => x.id !== s.id));
                    if (ge_activeStyleId === s.id) { ge_activeStyleId = null; setState('GrokEnhancer_ActiveStyleId', null); }
                    panelAddLog('Style "' + s.name + '" deleted');
                    reopen();
                });
                card.appendChild(delBtn);

                contentArea.appendChild(card);
            });

            // Footer buttons
            const footerRow = document.createElement('div');
            footerRow.style.cssText = 'display:flex;gap:8px;margin-top:4px;';
            const addBtn = document.createElement('button');
            addBtn.textContent = '+ Add Style';
            addBtn.style.cssText = 'background:#333;color:#ccc;border:none;border-radius:8px;padding:8px 16px;font-size:12px;cursor:pointer;flex:1;';
            addBtn.addEventListener('click', () => reopen('__new__'));
            footerRow.appendChild(addBtn);
            const closeBtn = document.createElement('button');
            closeBtn.textContent = 'Close';
            closeBtn.style.cssText = 'background:#222;color:#888;border:none;border-radius:8px;padding:8px 16px;font-size:12px;cursor:pointer;flex:1;';
            closeBtn.addEventListener('click', closeModal);
            footerRow.appendChild(closeBtn);
            contentArea.appendChild(footerRow);
        }

        dlg.appendChild(title);
        dlg.appendChild(contentArea);
        dlg.addEventListener('click', (e) => { if (e.target === dlg) closeModal(); });
        dlg.addEventListener('cancel', (e) => { e.preventDefault(); closeModal(); });
        document.body.appendChild(dlg);
        dlg.showModal();
    }

    // ══════════════════════════════════════════════════════════════
    //  4. Rate Limit Display
    //  KHROTU, ported from Blankspeaker & CursedAtom
    //  (https://greasyfork.org/en/scripts/558017-grok-rate-limit-display)
    // ══════════════════════════════════════════════════════════════
    let rl_lastHigh = { remaining: null, wait: null };
    let rl_lastLow  = { remaining: null, wait: null };
    let rl_lastBoth = { high: null, low: null, wait: null };

    const MODEL_MAP = {
        "Grok 4.3 (beta)": "grok-420-computer-use-sa", "Grok 4.20 (Beta)": "grok-420", "Grok 420": "grok-420",
        "Grok 4": "grok-4", "Grok 3": "grok-3", "Grok 4 Heavy": "grok-4-heavy",
        "Grok 4 With Effort Decider": "grok-4-auto", "Auto": "grok-4-auto", "Fast": "grok-3",
        "Expert": "grok-4", "Heavy": "grok-4-heavy", "Grok 4 Fast": "grok-4-mini-thinking-tahoe",
        "Grok 4.1": "grok-4-1-non-thinking-w-tool", "Grok 4.1 Thinking": "grok-4-1-thinking-1129",
        "Grok 2": "grok-2", "Grok 2 Mini": "grok-2-mini",
    };

    // ── Local usage tracking (reconciles API-reported totals/window with a
    // locally-tracked usage history, since Grok's own remaining-count can lag) ──
    const RL_STATE_DEFAULTS = { totalQueries: 40, windowSizeSeconds: 7200, usage: [] };
    let rl_state = getState('grok_state', {});
    function rl_saveState() { setState('grok_state', rl_state); }
    function rl_cleanupOldUsages() {
        let changed = false;
        const now = Date.now();
        for (const model in rl_state) {
            const windowMs = (rl_state[model].windowSizeSeconds || 7200) * 1000;
            const before = rl_state[model].usage.length;
            rl_state[model].usage = rl_state[model].usage.filter(ts => (now - ts) < windowMs);
            if (rl_state[model].usage.length !== before) changed = true;
        }
        if (changed) rl_saveState();
    }
    setInterval(rl_cleanupOldUsages, 60000);
    function rl_getRemainingLocally(model, apiTotal, windowSize) {
        if (!rl_state[model]) rl_state[model] = JSON.parse(JSON.stringify(RL_STATE_DEFAULTS));
        if (apiTotal != null) rl_state[model].totalQueries = apiTotal;
        if (windowSize != null) rl_state[model].windowSizeSeconds = windowSize;
        rl_saveState();
        rl_cleanupOldUsages();
        const total = rl_state[model].totalQueries || (model === 'grok-420' || model === 'grok-420-computer-use-sa' ? 40 : 100);
        const remaining = Math.max(0, total - rl_state[model].usage.length);
        const windowMs = (rl_state[model].windowSizeSeconds || 7200) * 1000;
        let waitSeconds = 0;
        if (rl_state[model].usage.length > 0) {
            const oldest = Math.min(...rl_state[model].usage);
            waitSeconds = Math.max(0, Math.ceil((oldest + windowMs - Date.now()) / 1000));
        }
        return { remaining, waitSeconds };
    }
    function rl_addUsage(model) {
        if (!featureRateLimit) return;
        if (!rl_state[model]) rl_state[model] = JSON.parse(JSON.stringify(RL_STATE_DEFAULTS));
        const now = Date.now();
        if (!rl_state[model].usage.some(ts => Math.abs(now - ts) < 2000)) {
            rl_state[model].usage.push(now);
            rl_saveState();
            if (rl_lastQueryBar) rl_fetchAndUpdate(rl_lastQueryBar, true);
        }
    }
    function rl_setRateLimitHit(model) {
        if (!featureRateLimit) return;
        if (!rl_state[model]) rl_state[model] = JSON.parse(JSON.stringify(RL_STATE_DEFAULTS));
        const total = rl_state[model].totalQueries || (model === 'grok-420' || model === 'grok-420-computer-use-sa' ? 40 : 100);
        const currentUsage = rl_state[model].usage.length;
        if (currentUsage < total) {
            const now = Date.now();
            for (let i = 0; i < (total - currentUsage); i++) rl_state[model].usage.push(now - (i * 10));
            rl_saveState();
            if (rl_lastQueryBar) rl_fetchAndUpdate(rl_lastQueryBar, true);
        }
    }
    function rl_getModelFromBody(body) {
        if (!body) return null;
        const modeId = body.modeId || body.modelName || body.metadata?.request_metadata?.mode || body.metadata?.requestMetadata?.mode || body.metadata?.modelName || body.metadata?.model_name;
        const modelMode = body.modelMode;
        if (modeId === 'grok-420' || modeId === 'grok-420-computer-use-sa' || modelMode === 'MODEL_MODE_GROK_420') return modeId;
        if (modeId === 'heavy' || modelMode === 'MODEL_MODE_HEAVY' || modeId === 'grok-4-heavy') return 'grok-4-heavy';
        if (modeId === 'fast' || modelMode === 'MODEL_MODE_FAST' || modeId === 'grok-3') return 'grok-3';
        if (modeId === 'expert' || modelMode === 'MODEL_MODE_EXPERT' || modeId === 'grok-4') return 'grok-4';
        if (modeId === 'auto' || modelMode === 'MODEL_MODE_AUTO' || modeId === 'grok-4-auto') return 'auto';
        return null;
    }

    // Record local usage for a just-sent chat request, and detect a 429 "Too many
    // requests" response to mark that model's local quota as exhausted. Called from
    // the shared _win.fetch interceptor with the response promise it's already returning
    // (never fetches a second time).
    function rl_trackUsageAndLimit(model, resultPromise) {
        if (model === 'auto') {
            resultPromise.then(async (res) => {
                if (!res.ok) return;
                try {
                    const clone = res.clone();
                    const reader = clone.body.getReader();
                    const decoder = new TextDecoder();
                    let buffer = '';
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        buffer += decoder.decode(value, { stream: true });
                        if (buffer.includes('"effort":"high"') || buffer.includes('"effort": "high"') || buffer.includes('"effortLevel":"high"') || buffer.includes('"is_high_effort":true')) { rl_addUsage('grok-4'); break; }
                        else if (buffer.includes('"effort":"low"') || buffer.includes('"effort": "low"') || buffer.includes('"effortLevel":"low"') || buffer.includes('"is_high_effort":false')) { rl_addUsage('grok-3'); break; }
                        if (buffer.length > 50000) buffer = buffer.slice(-10000);
                    }
                } catch (_) {}
            }).catch(() => {});
        } else {
            rl_addUsage(model);
        }
        resultPromise.then(async (res) => {
            if (res.status === 429 || !res.ok) {
                try {
                    const clone2 = res.clone();
                    const d = await clone2.json();
                    if (d?.error?.message === 'Too many requests' || d?.error?.code === 8) rl_setRateLimitHit(model === 'auto' ? 'grok-4' : model);
                } catch (_) {}
            }
        }).catch(() => {});
    }
    const RL_DEFAULT_MODEL = "grok-4";
    const RL_DEFAULT_KIND  = "DEFAULT";
    const RL_POLL_MS       = 30000;
    const RL_MODEL_SEL     = "button[aria-label='Model select']";
    const RL_QBAR_SEL      = ".query-bar";
    const RL_CONTAINER_ID  = "grok-rate-limit";
    const rl_cache = {};

    let rl_countdownTimer = null, rl_isCounting = false;
    let rl_lastQueryBar = null, rl_lastModelObs = null, rl_lastThinkObs = null, rl_lastSearchObs = null, rl_lastBodyObs = null;
    let rl_lastInput = null, rl_lastSubmit = null, rl_pollInterval = null, rl_lastModelName = null;
    let rl_overlapInterval = null, rl_isHidden = false;

    const rl_finders = {
        thinkButton:      { selector: "button", ariaLabel: "Think", svgPartialD: "M19 9C19 12.866" },
        deepSearchButton: { selector: "button", ariaLabelRegex: /Deep(er)?Search/i },
        attachButton:     { selector: "button", classContains: ["group/attach-button"] },
        submitButton:     { selector: "button", svgPartialD: "M6 11L12 5M12 5L18 11M12 5V19" },
    };

    function rl_isImagine() { return window.location.pathname.startsWith('/imagine'); }

    function rl_debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

    function rl_findEl(cfg, root = document) {
        for (const el of root.querySelectorAll(cfg.selector)) {
            let s = 0;
            if (cfg.ariaLabel && el.getAttribute('aria-label') === cfg.ariaLabel) s++;
            if (cfg.ariaLabelRegex) { const a = el.getAttribute('aria-label'); if (a && cfg.ariaLabelRegex.test(a)) s++; }
            if (cfg.svgPartialD) { const p = el.querySelector('path'); if (p && p.getAttribute('d')?.includes(cfg.svgPartialD)) s++; }
            if (cfg.classContains && cfg.classContains.some(c => el.classList.contains(c))) s++;
            if (s > 0) return el;
        }
        return null;
    }

    function rl_formatTimer(sec) {
        const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
        return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }

    let rl_measureCanvas = null;
    function rl_textWidth(text, font) {
        if (!rl_measureCanvas) rl_measureCanvas = document.createElement('canvas');
        const ctx = rl_measureCanvas.getContext('2d');
        ctx.font = font;
        return ctx.measureText(text).width;
    }

    function rl_checkOverlap(qb) {
        const rc = document.getElementById(RL_CONTAINER_ID);
        if (!rc) return;
        const ce = qb.querySelector('div[contenteditable="true"]');
        const ta = qb.querySelector('textarea[aria-label*="Ask Grok"]');
        const inp = ce || ta;
        if (!inp) return;
        const raw = (inp.value || inp.textContent || '').trim();
        const avail = qb.offsetWidth - rc.offsetWidth - 100;
        const small = window.innerWidth < 900 || avail < 200;
        const lim = small ? 0 : 28;
        let txt = raw.length;
        // Empty field on mobile: the placeholder itself can visually reach the
        // badge even though nothing's been typed, so measure its rendered
        // width instead of guessing from character count.
        if (!raw && small && inp.placeholder) {
            const cs = getComputedStyle(inp);
            const phWidth = rl_textWidth(inp.placeholder, `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`);
            if (phWidth > avail) txt = lim + 1;
        }
        const hide = txt > lim;
        if (hide && !rl_isHidden) {
            rc.style.transition = 'transform 0.2s ease-out, opacity 0.2s ease-out';
            rc.style.transform = 'translateX(100%)'; rc.style.opacity = '0';
            setTimeout(() => { if (rl_isHidden) rc.style.display = 'none'; }, 200);
            rl_isHidden = true;
        } else if (!hide && rl_isHidden) {
            rc.style.display = ''; rc.style.transition = 'transform 0.2s ease-out, opacity 0.2s ease-out';
            rc.offsetHeight; rc.style.transform = 'translateX(0)'; rc.style.opacity = '0.8';
            rl_isHidden = false;
        }
    }

    function rl_startOverlap(qb) {
        if (rl_overlapInterval) clearInterval(rl_overlapInterval);
        rl_overlapInterval = setInterval(() => {
            if (document.body.contains(qb)) rl_checkOverlap(qb);
            else { clearInterval(rl_overlapInterval); rl_overlapInterval = null; }
        }, 500);
    }

    function rl_stopOverlap() {
        if (rl_overlapInterval) { clearInterval(rl_overlapInterval); rl_overlapInterval = null; }
        rl_isHidden = false;
    }

    function rl_removeExisting() { const e = document.getElementById(RL_CONTAINER_ID); if (e) e.remove(); }

    // Long-press reset menu — lets the user clear the locally-tracked usage
    // history for the current model, or for every model.
    function rl_showResetMenu(anchor, modelName, qb) {
        const existing = document.getElementById('grok-rate-limit-reset-menu');
        if (existing) existing.remove();
        const menu = document.createElement('div');
        menu.id = 'grok-rate-limit-reset-menu';
        menu.style.cssText = 'position:fixed;background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:8px;z-index:9999;box-shadow:0 10px 25px rgba(0,0,0,0.5);color:#e5e5e5;min-width:140px;font-size:14px;';
        const createBtn = (text, action, isCancel) => {
            const b = document.createElement('button');
            b.textContent = text;
            b.style.cssText = `width:100%;text-align:${isCancel ? 'center' : 'left'};padding:8px 12px;border-radius:8px;background:none;border:none;color:inherit;cursor:pointer;`;
            if (isCancel) b.style.color = '#9a9a9a';
            b.onmouseover = () => b.style.background = '#333';
            b.onmouseout = () => b.style.background = 'none';
            b.onclick = (e) => { e.stopPropagation(); action(); menu.remove(); };
            return b;
        };
        menu.appendChild(createBtn('Reset Current', () => {
            if (modelName === 'grok-4-auto') { rl_state['grok-4'] = { usage: [] }; rl_state['grok-3'] = { usage: [] }; }
            else if (modelName) rl_state[modelName] = { usage: [] };
            rl_saveState(); rl_fetchAndUpdate(qb, true);
        }));
        menu.appendChild(createBtn('Reset All', () => { rl_state = {}; rl_saveState(); rl_fetchAndUpdate(qb, true); }));
        menu.appendChild(createBtn('Cancel', () => {}, true));
        document.body.appendChild(menu);
        const rect = anchor.getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();
        let targetLeft = rect.left + (rect.width / 2) - (menuRect.width / 2);
        if (targetLeft < 10) targetLeft = 10;
        menu.style.left = `${targetLeft}px`;
        menu.style.top = `${rect.top - menuRect.height - 8}px`;
        const close = (e) => { if (!menu.contains(e.target) && !anchor.contains(e.target)) { menu.remove(); document.removeEventListener('mousedown', close); } };
        setTimeout(() => document.addEventListener('mousedown', close), 0);
    }

    function rl_getModelKey(qb) {
        const btn = qb.querySelector(RL_MODEL_SEL);
        if (!btn) return RL_DEFAULT_MODEL;
        let sp = btn.querySelector('span.font-semibold');
        if (sp) return MODEL_MAP[sp.textContent.trim()] || RL_DEFAULT_MODEL;
        sp = btn.querySelector('span.inline-block');
        if (sp) return MODEL_MAP[sp.textContent.trim()] || RL_DEFAULT_MODEL;
        const svg = btn.querySelector('svg');
        if (svg) {
            const pd = Array.from(svg.querySelectorAll('path')).map(p => p.getAttribute('d') || '').filter(d => d.length).join(' ');
            const hbf = svg.querySelector('path[class*="fill-yellow-100"]') !== null;
            if (pd.includes('M6.5 12.5L11.5 17.5')) return 'grok-4-auto';
            if (pd.includes('M5 14.25L14 4')) return 'grok-3';
            if (hbf || pd.includes('M19 9C19 12.866')) return 'grok-4';
            if (pd.includes('M12 3a6 6 0 0 0 9 9')) return 'grok-4-mini-thinking-tahoe';
            if (pd.includes('M11 18H10C7.79086 18 6 16.2091 6 14V13')) return 'grok-4-heavy';
        }
        return RL_DEFAULT_MODEL;
    }

    function rl_getEffort(m) {
        if (m === 'grok-4-auto') return 'both';
        if (m === 'grok-3' || m === 'grok-4-1-non-thinking-w-tool') return 'low';
        return 'high';
    }

    function rl_appendSpan(par, txt, color) {
        const s = document.createElement('span');
        s.textContent = txt;
        if (color) s.style.color = color;
        par.appendChild(s);
        return s;
    }

    function rl_appendDivider(par) {
        const d = document.createElement('div');
        d.className = 'h-6 w-[2px] bg-border-l2 mx-1';
        par.appendChild(d);
    }

    function rl_setGaugeSVG(svg) {
        if (!svg) return;
        while (svg.firstChild) svg.removeChild(svg.firstChild);
        const p1 = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p1.setAttribute('d', 'm12 14 4-4');
        const p2 = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p2.setAttribute('d', 'M3.34 19a10 10 0 1 1 17.32 0');
        svg.appendChild(p1); svg.appendChild(p2);
        svg.setAttribute('class', 'lucide lucide-gauge stroke-[2] text-fg-secondary transition-colors duration-100');
    }

    function rl_setClockSVG(svg) {
        if (!svg) return;
        while (svg.firstChild) svg.removeChild(svg.firstChild);
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('cx','12'); c.setAttribute('cy','12'); c.setAttribute('r','8');
        c.setAttribute('stroke','currentColor'); c.setAttribute('stroke-width','2');
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d','M12 12L12 6'); p.setAttribute('stroke','currentColor');
        p.setAttribute('stroke-width','2'); p.setAttribute('stroke-linecap','round');
        svg.appendChild(c); svg.appendChild(p);
        svg.setAttribute('class', 'stroke-[2] text-fg-secondary group-hover/rate-limit:text-fg-primary transition-colors duration-100');
    }

    function rl_updateDisplay(qb, resp, effort) {
        if (!featureRateLimit || rl_isImagine()) { rl_removeExisting(); return; }
        let rc = document.getElementById(RL_CONTAINER_ID);
        if (!rc) {
            rc = document.createElement('div');
            rc.id = RL_CONTAINER_ID;
            rc.className = 'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60 disabled:cursor-not-allowed [&_svg]:duration-100 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:-mx-0.5 select-none text-fg-primary hover:bg-button-ghost-hover hover:border-border-l2 disabled:hover:bg-transparent h-10 px-3.5 py-2 text-sm rounded-full group/rate-limit transition-colors duration-100 relative overflow-hidden border border-transparent cursor-pointer';
            rc.style.opacity = '0.8'; rc.style.transition = 'opacity 0.1s ease-in-out'; rc.style.zIndex = '20';
            let rl_pressTimer = null;
            rc.addEventListener('mousedown', () => { rl_pressTimer = setTimeout(() => rl_showResetMenu(rc, rl_lastModelName, qb), 2000); });
            rc.addEventListener('mouseup', () => clearTimeout(rl_pressTimer));
            rc.addEventListener('mouseleave', () => clearTimeout(rl_pressTimer));
            rc.addEventListener('click', () => {
                clearTimeout(rl_pressTimer);
                if (!document.getElementById('grok-rate-limit-reset-menu')) rl_fetchAndUpdate(qb, true);
            });

            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('width','18'); svg.setAttribute('height','18'); svg.setAttribute('viewBox','0 0 24 24');
            svg.setAttribute('fill','none'); svg.setAttribute('stroke','currentColor'); svg.setAttribute('stroke-width','2');
            svg.setAttribute('stroke-linecap','round'); svg.setAttribute('stroke-linejoin','round');
            svg.setAttribute('class','lucide lucide-gauge stroke-[2] text-fg-secondary transition-colors duration-100');
            svg.setAttribute('aria-hidden','true');
            const cd = document.createElement('div'); cd.className = 'flex items-center';
            rc.appendChild(svg); rc.appendChild(cd);

            const tc = qb.querySelector('div.ms-auto.flex.flex-row.items-end.gap-1');
            if (tc) tc.prepend(rc);
            else { const bb = qb.querySelector('div.absolute.inset-x-0.bottom-0'); if (bb) bb.appendChild(rc); else { rc.remove(); return; } }
        }

        const cd = rc.lastChild, svg = rc.querySelector('svg');
        cd.innerHTML = '';
        const isBoth = effort === 'both';

        if (resp.error) {
            if (isBoth) {
                if (rl_lastBoth.high !== null && rl_lastBoth.low !== null) {
                    rl_appendSpan(cd, rl_lastBoth.high, ''); rl_appendDivider(cd); rl_appendSpan(cd, rl_lastBoth.low, '');
                    rc.title = `High: ${rl_lastBoth.high} | Low: ${rl_lastBoth.low} queries remaining`;
                } else { rl_appendSpan(cd, 'Unavailable', ''); rc.title = 'Unavailable'; }
            } else {
                const lf = effort === 'high' ? rl_lastHigh : rl_lastLow;
                if (lf.remaining !== null) { rl_appendSpan(cd, lf.remaining, ''); rc.title = `${lf.remaining} queries remaining`; }
                else { rl_appendSpan(cd, 'Unavailable', ''); rc.title = 'Unavailable'; }
            }
            rl_setGaugeSVG(svg);
        } else {
            if (rl_countdownTimer) { clearInterval(rl_countdownTimer); rl_countdownTimer = null; }
            if (isBoth) {
                rl_lastBoth.high = resp.highRemaining; rl_lastBoth.low = resp.lowRemaining; rl_lastBoth.wait = resp.waitTimeSeconds;
                let ccd = resp.waitTimeSeconds;
                if (resp.highRemaining > 0) {
                    rl_appendSpan(cd, resp.highRemaining, ''); rl_appendDivider(cd); rl_appendSpan(cd, resp.lowRemaining, '');
                    rc.title = `High: ${resp.highRemaining} | Low: ${resp.lowRemaining} queries remaining`; rl_setGaugeSVG(svg);
                } else if (ccd > 0) {
                    const ts = rl_appendSpan(cd, rl_formatTimer(ccd), '#ff6347'); rl_appendDivider(cd); rl_appendSpan(cd, resp.lowRemaining, '');
                    rc.title = `High: Time until reset | Low: ${resp.lowRemaining} queries remaining`; rl_setClockSVG(svg);
                    rl_isCounting = true;
                    if (rl_pollInterval) { clearInterval(rl_pollInterval); rl_pollInterval = null; }
                    rl_countdownTimer = setInterval(() => {
                        ccd--;
                        if (ccd <= 0) { clearInterval(rl_countdownTimer); rl_countdownTimer = null; rl_fetchAndUpdate(qb, true); rl_isCounting = false;
                            if (document.visibilityState === 'visible' && rl_lastQueryBar) rl_pollInterval = setInterval(() => rl_fetchAndUpdate(rl_lastQueryBar, true), RL_POLL_MS);
                        } else ts.textContent = rl_formatTimer(ccd);
                    }, 1000);
                } else {
                    rl_appendSpan(cd, '0', '#ff6347'); rl_appendDivider(cd); rl_appendSpan(cd, resp.lowRemaining, '');
                    rc.title = `High: Limit reached | Low: ${resp.lowRemaining} queries remaining`; rl_setGaugeSVG(svg);
                }
            } else {
                const lf = effort === 'high' ? rl_lastHigh : rl_lastLow;
                lf.remaining = resp.remainingQueries; lf.wait = resp.waitTimeSeconds;
                let ccd = lf.wait;
                if (lf.remaining > 0) {
                    rl_appendSpan(cd, lf.remaining, ''); rc.title = `${lf.remaining} queries remaining`; rl_setGaugeSVG(svg);
                } else if (ccd > 0) {
                    const ts = rl_appendSpan(cd, rl_formatTimer(ccd), '#ff6347'); rc.title = 'Time until reset'; rl_setClockSVG(svg);
                    rl_isCounting = true;
                    if (rl_pollInterval) { clearInterval(rl_pollInterval); rl_pollInterval = null; }
                    rl_countdownTimer = setInterval(() => {
                        ccd--;
                        if (ccd <= 0) { clearInterval(rl_countdownTimer); rl_countdownTimer = null; rl_fetchAndUpdate(qb, true); rl_isCounting = false;
                            if (document.visibilityState === 'visible' && rl_lastQueryBar) rl_pollInterval = setInterval(() => rl_fetchAndUpdate(rl_lastQueryBar, true), RL_POLL_MS);
                        } else ts.textContent = rl_formatTimer(ccd);
                    }, 1000);
                } else {
                    rl_appendSpan(cd, '0', '#ff6347'); rc.title = 'Limit reached. Awaiting reset.'; rl_setGaugeSVG(svg);
                }
            }
        }
    }

    async function rl_fetchLimit(model, kind, force = false) {
        if (!force) { const c = rl_cache[model]?.[kind]; if (c !== undefined) return c; }
        try {
            const r = await _originalFetch(window.location.origin + '/rest/rate-limits', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requestKind: kind, modelName: model }), credentials: 'include',
            });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const d = await r.json();
            if (!rl_cache[model]) rl_cache[model] = {};
            rl_cache[model][kind] = d; return d;
        } catch (_) {
            if (!rl_cache[model]) rl_cache[model] = {};
            rl_cache[model][kind] = undefined; return { error: true };
        }
    }

    function rl_processData(data, effort) {
        if (data.error) return data;
        if (effort === 'both') {
            const h = data.highEffortRateLimits?.remainingQueries, l = data.lowEffortRateLimits?.remainingQueries;
            const w = Math.max(data.highEffortRateLimits?.waitTimeSeconds || 0, data.lowEffortRateLimits?.waitTimeSeconds || 0, data.waitTimeSeconds || 0);
            return (h !== undefined && l !== undefined) ? { highRemaining: h, lowRemaining: l, waitTimeSeconds: w } : { error: true };
        }
        const rk = effort === 'high' ? 'highEffortRateLimits' : 'lowEffortRateLimits';
        let rem = data[rk]?.remainingQueries;
        if (rem === undefined) rem = data.remainingQueries;
        return rem !== undefined ? { remainingQueries: rem, waitTimeSeconds: data[rk]?.waitTimeSeconds || data.waitTimeSeconds || 0 } : { error: true };
    }

    // Reconcile the API's reported totals/window into the locally-tracked usage
    // history and overwrite the API's (sometimes-stale) remaining/wait with the
    // locally-computed one, same as rate-limit.txt's fetchAndUpdateRateLimit.
    function rl_reconcileLocal(data, effort) {
        if (data.error) return data;
        if (effort === 'both') {
            const h = rl_getRemainingLocally('grok-4', data.highEffortRateLimits?.totalQueries, data.windowSizeSeconds);
            const l = rl_getRemainingLocally('grok-3', data.lowEffortRateLimits?.totalQueries, data.windowSizeSeconds);
            data.highEffortRateLimits = { ...data.highEffortRateLimits, remainingQueries: h.remaining, waitTimeSeconds: h.waitSeconds };
            data.lowEffortRateLimits = { ...data.lowEffortRateLimits, remainingQueries: l.remaining, waitTimeSeconds: l.waitSeconds };
        } else {
            const rk = effort === 'high' ? 'highEffortRateLimits' : 'lowEffortRateLimits';
            const apiTotal = data[rk]?.totalQueries ?? data.totalQueries;
            const b = rl_getRemainingLocally(rl_lastModelForReconcile, apiTotal, data.windowSizeSeconds);
            if (!data[rk]) data[rk] = {};
            data[rk].remainingQueries = b.remaining;
            data[rk].waitTimeSeconds = b.waitSeconds;
        }
        return data;
    }
    let rl_lastModelForReconcile = null;

    async function rl_fetchAndUpdate(qb, force = false) {
        if (!featureRateLimit) { rl_removeExisting(); return; }
        if (rl_isImagine() || !qb || !document.body.contains(qb)) return;
        const model = rl_getModelKey(qb);
        if (model !== rl_lastModelName) force = true;
        if (rl_isCounting && !force) return;
        const effort = rl_getEffort(model);
        let kind = RL_DEFAULT_KIND;
        if (model === 'grok-3') {
            const tb = rl_findEl(rl_finders.thinkButton, qb), sb = rl_findEl(rl_finders.deepSearchButton, qb);
            if (tb && tb.getAttribute('aria-pressed') === 'true') kind = 'REASONING';
            else if (sb && sb.getAttribute('aria-pressed') === 'true') {
                const a = sb.getAttribute('aria-label') || '';
                kind = /deeper/i.test(a) ? 'DEEPERSEARCH' : 'DEEPSEARCH';
            }
        }
        const data = await rl_fetchLimit(model, kind, force);
        rl_lastModelForReconcile = model;
        rl_reconcileLocal(data, effort);
        rl_updateDisplay(qb, rl_processData(data, effort), effort);
        rl_lastModelName = model;
    }

    function rl_observeDOM() {
        const onVis = () => {
            if (document.visibilityState === 'visible' && rl_lastQueryBar && !rl_isImagine()) {
                rl_fetchAndUpdate(rl_lastQueryBar, true);
                if (!rl_isCounting) { if (rl_pollInterval) clearInterval(rl_pollInterval); rl_pollInterval = setInterval(() => rl_fetchAndUpdate(rl_lastQueryBar, true), RL_POLL_MS); }
            } else { if (rl_pollInterval) { clearInterval(rl_pollInterval); rl_pollInterval = null; } }
        };
        const onResize = rl_debounce(() => { if (rl_lastQueryBar) rl_checkOverlap(rl_lastQueryBar); }, 300);
        document.addEventListener('visibilitychange', onVis);
        window.addEventListener('resize', onResize);

        if (!rl_isImagine()) {
            const iqb = document.querySelector(RL_QBAR_SEL);
            if (iqb) {
                rl_removeExisting(); rl_fetchAndUpdate(iqb); rl_lastQueryBar = iqb;
                rl_setupQBarObs(iqb); rl_setupG3Obs(iqb); rl_setupSubmitListeners(iqb);
                rl_startOverlap(iqb); setTimeout(() => rl_checkOverlap(iqb), 100);
                if (document.visibilityState === 'visible' && !rl_isCounting) rl_pollInterval = setInterval(() => rl_fetchAndUpdate(rl_lastQueryBar, true), RL_POLL_MS);
            }
        }

        rl_lastBodyObs = new MutationObserver(() => {
            if (rl_isImagine()) {
                rl_removeExisting(); rl_stopOverlap();
                if (rl_lastModelObs) { rl_lastModelObs.disconnect(); rl_lastModelObs = null; }
                if (rl_lastThinkObs) { rl_lastThinkObs.disconnect(); rl_lastThinkObs = null; }
                if (rl_lastSearchObs) { rl_lastSearchObs.disconnect(); rl_lastSearchObs = null; }
                rl_lastInput = null; rl_lastSubmit = null;
                if (rl_pollInterval) { clearInterval(rl_pollInterval); rl_pollInterval = null; }
                rl_lastQueryBar = null; return;
            }
            const qb = document.querySelector(RL_QBAR_SEL);
            if (qb && qb !== rl_lastQueryBar) {
                rl_removeExisting(); rl_fetchAndUpdate(qb);
                if (rl_lastModelObs) rl_lastModelObs.disconnect();
                if (rl_lastThinkObs) rl_lastThinkObs.disconnect();
                if (rl_lastSearchObs) rl_lastSearchObs.disconnect();
                rl_setupQBarObs(qb); rl_setupG3Obs(qb); rl_setupSubmitListeners(qb);
                rl_startOverlap(qb); setTimeout(() => rl_checkOverlap(qb), 100);
                if (document.visibilityState === 'visible' && !rl_isCounting) {
                    if (rl_pollInterval) clearInterval(rl_pollInterval);
                    rl_pollInterval = setInterval(() => rl_fetchAndUpdate(rl_lastQueryBar, true), RL_POLL_MS);
                }
                rl_lastQueryBar = qb;
            } else if (!qb && rl_lastQueryBar) {
                rl_removeExisting(); rl_stopOverlap();
                if (rl_lastModelObs) rl_lastModelObs.disconnect();
                if (rl_lastThinkObs) rl_lastThinkObs.disconnect();
                if (rl_lastSearchObs) rl_lastSearchObs.disconnect();
                rl_lastQueryBar = null; rl_lastModelObs = null; rl_lastThinkObs = null; rl_lastSearchObs = null;
                rl_lastInput = null; rl_lastSubmit = null;
                if (rl_pollInterval) { clearInterval(rl_pollInterval); rl_pollInterval = null; }
            }
        });
        rl_lastBodyObs.observe(document.body, { childList: true, subtree: true });
    }

    function rl_setupQBarObs(qb) {
        const d = rl_debounce(() => { rl_fetchAndUpdate(qb); rl_setupG3Obs(qb); }, 300);
        rl_lastModelObs = new MutationObserver(d);
        rl_lastModelObs.observe(qb, { childList: true, subtree: true, attributes: true, characterData: true });
    }

    function rl_setupG3Obs(qb) {
        if (rl_getModelKey(qb) === 'grok-3') {
            const tb = rl_findEl(rl_finders.thinkButton, qb);
            if (tb) {
                if (rl_lastThinkObs) rl_lastThinkObs.disconnect();
                rl_lastThinkObs = new MutationObserver(() => rl_fetchAndUpdate(qb));
                rl_lastThinkObs.observe(tb, { attributes: true, attributeFilter: ['aria-pressed', 'class'] });
            }
            const sb = rl_findEl(rl_finders.deepSearchButton, qb);
            if (sb) {
                if (rl_lastSearchObs) rl_lastSearchObs.disconnect();
                rl_lastSearchObs = new MutationObserver(() => rl_fetchAndUpdate(qb));
                rl_lastSearchObs.observe(sb, { attributes: true, attributeFilter: ['aria-pressed', 'class'], childList: true, subtree: true, characterData: true });
            }
        } else {
            if (rl_lastThinkObs) { rl_lastThinkObs.disconnect(); rl_lastThinkObs = null; }
            if (rl_lastSearchObs) { rl_lastSearchObs.disconnect(); rl_lastSearchObs = null; }
        }
    }

    function rl_setupSubmitListeners(qb) {
        const inp = qb.querySelector('div[contenteditable="true"]');
        if (inp && inp !== rl_lastInput) {
            rl_lastInput = inp;
            const dc = rl_debounce(() => rl_checkOverlap(qb), 300);
            inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) setTimeout(() => rl_fetchAndUpdate(qb, true), 3000); });
            inp.addEventListener('input', dc);
            inp.addEventListener('focus', dc);
            inp.addEventListener('blur', () => setTimeout(() => rl_checkOverlap(qb), 200));
        }
        const bb = qb.querySelector('div.absolute.inset-x-0.bottom-0');
        const sub = bb ? rl_findEl(rl_finders.submitButton, bb) : rl_findEl(rl_finders.submitButton, qb);
        if (sub && sub !== rl_lastSubmit) {
            rl_lastSubmit = sub;
            sub.addEventListener('click', () => setTimeout(() => rl_fetchAndUpdate(qb, true), 3000));
        }
    }

    // ══════════════════════════════════════════════════════════════
    //  6. Settings Panel UI  (Grok-themed, compact)
    // ══════════════════════════════════════════════════════════════
    let panelStatusEl = null;
    let panelOpen = false;

    function panelAddLog(...a) { logDebug(...a); }

    function panelUpdateStatus(mr, isRecovering = false) {
        if (!panelStatusEl) return;
        let text = '', color = DEMOD_CONFIG.statusColors.safe;
        if (isRecovering)                         { text = 'Recovering...';               color = DEMOD_CONFIG.statusColors.recovering; }
        else if (mr === ModerationResult.BLOCKED)  { text = 'Blocked (Recovered/Cleared)'; color = DEMOD_CONFIG.statusColors.blocked; }
        else if (mr === ModerationResult.FLAGGED)  { text = 'Flagged (Cleared)';            color = DEMOD_CONFIG.statusColors.flagged; }
        else                                       { text = 'Safe';                          color = DEMOD_CONFIG.statusColors.safe; }
        panelStatusEl.textContent = text;
        panelStatusEl.style.color = color;
    }

    function injectPanelCSS() {
        if (document.getElementById('ge-panel-css')) return;
        const style = document.createElement('style');
        style.id = 'ge-panel-css';
        style.textContent = `
            @keyframes ge-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            #ge-fab {
                position: fixed; bottom: 12px; right: 12px; z-index: 10001;
                width: 40px; height: 40px; border-radius: 50%; border: none; cursor: pointer;
                color: #999; background: #111;
                display: flex; align-items: center; justify-content: center; padding: 0;
                box-shadow: 0 1px 4px rgba(0,0,0,0.5);
                transition: box-shadow 0.15s ease, background 0.15s ease, color 0.15s ease;
            }
            #ge-fab:hover {
                background: #222; color: #ccc;
                box-shadow: 0 2px 8px rgba(128,128,128,0.2);
            }
            #ge-fab:active {
                box-shadow: 0 1px 3px rgba(128,128,128,0.25); background: #1a1a1a;
            }
            #ge-fab.ge-spinning svg {
                animation: ge-spin 1.6s cubic-bezier(0.2, 0.6, 0.35, 1);
            }

            #ge-panel {
                position: fixed; bottom: 52px; right: 12px; z-index: 10000;
                background: #141414; border: 1px solid #2a2a2a; border-radius: 10px;
                box-shadow: 0 4px 16px rgba(0,0,0,0.6);
                display: none; flex-direction: column; gap: 0;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                color: #ccc; width: 210px; overflow: hidden;
            }
            #ge-panel.open { display: flex; }

            #ge-panel .ge-header {
                padding: 8px 12px; font-size: 11px; font-weight: 700; color: #fff;
                border-bottom: 1px solid #222; letter-spacing: 0.5px; text-transform: uppercase;
                text-align: center;
            }
            #ge-panel .ge-section {
                padding: 6px 12px; display: flex; flex-direction: column; gap: 6px;
            }
            #ge-panel .ge-row {
                display: flex; align-items: center; justify-content: space-between;
            }
            #ge-panel .ge-label {
                font-size: 12px; color: #aaa; user-select: none;
            }

            #ge-panel .ge-toggle {
                position: relative; display: inline-block; width: 30px; height: 16px; flex-shrink: 0;
            }
            #ge-panel .ge-toggle input {
                opacity: 0; width: 0; height: 0; position: absolute;
            }
            #ge-panel .ge-toggle .ge-slider {
                position: absolute; cursor: pointer; inset: 0;
                background: #333; border-radius: 8px; transition: background 0.2s;
            }
            #ge-panel .ge-toggle .ge-slider::before {
                content: ''; position: absolute; height: 12px; width: 12px;
                left: 2px; bottom: 2px;
                background: #666; border-radius: 50%;
                transition: transform 0.2s, background 0.2s;
            }
            #ge-panel .ge-toggle input:checked + .ge-slider { background: #444; }
            #ge-panel .ge-toggle input:checked + .ge-slider::before {
                transform: translateX(14px); background: #fff;
            }

            #ge-panel .ge-divider { height: 1px; background: #222; margin: 0; }

            #ge-panel .ge-status {
                padding: 4px 12px; font-size: 10px; color: #888; border-top: 1px solid #222;
            }
            #ge-panel .ge-status span { font-weight: 600; }

            /* Visited link styling for clickable links */
            a.ge-link { color: #4a9eff !important; }
            a.ge-link:visited { color: #9b59b6 !important; }

            /* Dropdown for grouped toggles (Hide Models) */
            #ge-panel .ge-dropdown-trigger {
                font-size: 11px; color: #888; cursor: pointer; user-select: none;
                padding: 2px 6px; border: 1px solid #2a2a2a; border-radius: 6px;
                background: #1a1a1a; max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            }
            #ge-panel .ge-dropdown {
                display: none; flex-direction: column; gap: 6px;
                margin: 2px -6px 2px; padding: 6px 8px;
                background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 8px;
            }
            #ge-panel .ge-dropdown.open { display: flex; }
            #ge-panel .ge-dropdown .ge-row { padding: 0; }

            /* Mobile: raise the FAB above Grok's send button (tune this
               offset if a given phone's composer height differs). */
            @media (max-width: 768px) {
                #ge-fab { bottom: 80px; }
                #ge-panel { bottom: 120px; }
                .ge-hotkey-row { display: none; }
            }
        `;
        document.head.appendChild(style);
    }

    function createToggle(label, checked, onChange) {
        const row = document.createElement('div');
        row.className = 'ge-row';
        const lbl = document.createElement('span');
        lbl.className = 'ge-label';
        lbl.textContent = label;
        const toggle = document.createElement('label');
        toggle.className = 'ge-toggle';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = checked;
        input.addEventListener('change', () => onChange(input.checked));
        const slider = document.createElement('span');
        slider.className = 'ge-slider';
        toggle.appendChild(input);
        toggle.appendChild(slider);
        row.appendChild(lbl);
        row.appendChild(toggle);
        return { row, input };
    }

    function createModelDropdown() {
        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';

        const row = document.createElement('div');
        row.className = 'ge-row';
        const lbl = document.createElement('span');
        lbl.className = 'ge-label';
        lbl.textContent = 'Hide Models';
        const trigger = document.createElement('span');
        trigger.className = 'ge-dropdown-trigger';

        const dropdown = document.createElement('div');
        dropdown.className = 'ge-dropdown';

        function updateSummary() {
            const names = [];
            if (featureHideHeavy) names.push('Heavy');
            if (featureHideExpert) names.push('Expert');
            if (featureHideAuto) names.push('Auto');
            trigger.textContent = names.length ? names.join(', ') : 'None';
        }

        const heavyToggle = createToggle('Heavy', featureHideHeavy, (on) => {
            featureHideHeavy = on; setState('GrokEnhancer_HideHeavy', on);
            ge_markModelItems(); ge_markUpgradeHeavyBtns(); updateSummary();
            panelAddLog(`Hide Heavy Model ${on ? 'ON' : 'OFF'}`);
        });
        const expertToggle = createToggle('Expert', featureHideExpert, (on) => {
            featureHideExpert = on; setState('GrokEnhancer_HideExpert', on);
            ge_markModelItems(); updateSummary();
            panelAddLog(`Hide Expert Model ${on ? 'ON' : 'OFF'}`);
        });
        const autoToggle = createToggle('Auto', featureHideAuto, (on) => {
            featureHideAuto = on; setState('GrokEnhancer_HideAuto', on);
            ge_markModelItems(); updateSummary();
            panelAddLog(`Hide Auto Model ${on ? 'ON' : 'OFF'}`);
        });

        dropdown.appendChild(heavyToggle.row);
        dropdown.appendChild(expertToggle.row);
        dropdown.appendChild(autoToggle.row);

        // Keep the dropdown open when clicking toggles inside it; only a click outside
        // or on the trigger should close it.
        dropdown.addEventListener('click', (e) => e.stopPropagation());

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = dropdown.classList.contains('open');
            document.querySelectorAll('#ge-panel .ge-dropdown.open').forEach(d => {
                if (d !== dropdown && !d.contains(dropdown) && !dropdown.contains(d)) d.classList.remove('open');
            });
            dropdown.classList.toggle('open', !isOpen);
        });
        document.addEventListener('click', (e) => {
            if (!wrapper.contains(e.target)) dropdown.classList.remove('open');
        });

        row.appendChild(lbl);
        row.appendChild(trigger);
        wrapper.appendChild(row);
        wrapper.appendChild(dropdown);
        updateSummary();
        return wrapper;
    }

    // Collapsible group of rows, reusing the same trigger/dropdown widget as
    // createModelDropdown() so the panel doesn't need a second UI pattern.
    function createSection(title, rowEls) {
        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';

        const header = document.createElement('div');
        header.className = 'ge-row';
        header.style.cursor = 'pointer';
        const lbl = document.createElement('span');
        lbl.className = 'ge-label';
        lbl.style.fontWeight = '600';
        lbl.textContent = title;
        const trigger = document.createElement('span');
        trigger.className = 'ge-dropdown-trigger';
        trigger.textContent = '▸';

        const dropdown = document.createElement('div');
        dropdown.className = 'ge-dropdown';
        rowEls.forEach(el => dropdown.appendChild(el));

        // Don't collapse the section when the user clicks controls inside it.
        dropdown.addEventListener('click', (e) => e.stopPropagation());

        header.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = dropdown.classList.contains('open');
            document.querySelectorAll('#ge-panel .ge-dropdown.open').forEach(d => {
                if (d !== dropdown && !d.contains(dropdown) && !dropdown.contains(d)) d.classList.remove('open');
            });
            dropdown.classList.toggle('open', !isOpen);
            trigger.textContent = isOpen ? '▸' : '▾';
        });
        document.addEventListener('click', (e) => {
            if (!wrapper.contains(e.target)) { dropdown.classList.remove('open'); trigger.textContent = '▸'; }
        });

        header.appendChild(lbl);
        header.appendChild(trigger);
        wrapper.appendChild(header);
        wrapper.appendChild(dropdown);
        return wrapper;
    }

    // Toggles that all follow the same shape (assign var, persist, optional
    // side effect, optional log) — driven from one loop instead of being
    // repeated inline for each one.
    const GE_SIMPLE_TOGGLES = [
        { label: 'SuperGrok Logo', get: () => featureLogo, stateKey: 'GrokEnhancer_Logo',
          onToggle: (on) => { featureLogo = on; if (!on) logoReplaced = false; else { logoReplaced = false; tryReplaceLogo(); } } },
        { label: 'Clickable Links', get: () => featureLinks, stateKey: 'GrokEnhancer_Links',
          onToggle: (on) => { featureLinks = on; } },
        { label: 'DeMod', get: () => featureDeMod, stateKey: 'GrokDeModEnabled',
          onToggle: (on) => { featureDeMod = on; } },
        { label: 'Hide Share Button', get: () => featureHideShare, stateKey: 'GrokEnhancer_HideShare',
          onToggle: (on) => { featureHideShare = on; applyShareHide(on); } },
        { label: 'Hide Popups', get: () => featureHidePopups, stateKey: 'GrokEnhancer_HidePopups',
          onToggle: (on) => { featureHidePopups = on; ge_applyPopupHideCSS(on); } },
        { label: 'Hide Premium Upsells', get: () => featureHidePremium, stateKey: 'GrokEnhancer_HidePremium',
          onToggle: (on) => { featureHidePremium = on; ge_applyPremiumHideCSS(on); if (on) ge_dismissPremium(); } },
        { label: 'Auto Private Chat', get: () => featureAutoPrivate, stateKey: 'GrokEnhancer_AutoPrivate',
          onToggle: (on) => { featureAutoPrivate = on; if (on) ge_autoEnablePrivateMode(); }, noLog: true },
        { label: 'Disable Auto Scroll', get: () => featureDisableAutoScroll, stateKey: 'GrokEnhancer_DisableAutoScroll',
          onToggle: (on) => { featureDisableAutoScroll = on; ge_enforceAutoScrollDisable(); } },
        { label: 'Debug', get: () => featureDebug, stateKey: 'GrokDeModDebug',
          onToggle: (on) => { featureDebug = on; }, noLog: true },
    ];

    function ge_buildSimpleToggleRow(label) {
        const cfg = GE_SIMPLE_TOGGLES.find(t => t.label === label);
        return createToggle(cfg.label, cfg.get(), (on) => {
            cfg.onToggle(on);
            setState(cfg.stateKey, on);
            if (!cfg.noLog) panelAddLog(`${cfg.label} ${on ? 'ON' : 'OFF'}`);
        }).row;
    }

    function setupPanel() {
        injectPanelCSS();

        // FAB button — no rotation, just subtle gray shadow on hover
        const fab = document.createElement('button');
        fab.id = 'ge-fab';
        fab.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0l2.5 9.5L24 12l-9.5 2.5L12 24l-2.5-9.5L0 12l9.5-2.5z"/></svg>';
        fab.title = 'Grok Enhancer Settings';
        const panel = document.createElement('div');
        panel.id = 'ge-panel';

        // ── Triple-click to hide FAB ─────────────────────────────
        function _ge_handleFabTripleClick() {
            _ge_fabHidden = true;
            if (featureFabStayHidden) setState('GrokEnhancer_FabHidden', true);
            fab.style.display = 'none';
            panelOpen = false;
            panel.classList.remove('open');
            logDebug('[FAB] Hidden via triple-click');
        }

        function _ge_reallyTogglePanel() {
            panelOpen = !panelOpen;
            panel.classList.toggle('open', panelOpen);
            fab.title = panelOpen ? 'Close settings' : 'Grok Enhancer Settings';
            fab.classList.remove('ge-spinning');
            void fab.offsetWidth;
            fab.classList.add('ge-spinning');
            fab.addEventListener('animationend', () => fab.classList.remove('ge-spinning'), { once: true });
        }

        fab.addEventListener('click', (e) => {
            e.stopPropagation();
            const now = Date.now();
            _ge_fabClicks.push(now);
            // Keep only clicks within the time window
            _ge_fabClicks = _ge_fabClicks.filter(t => now - t < GE_TRIPLE_CLICK_MS);
            if (_ge_fabClicks.length >= 3) {
                _ge_fabClicks = [];
                _ge_handleFabTripleClick();
                return;
            }
            _ge_reallyTogglePanel();
        });

        // Restore FAB via triple-click on bottom-right corner area
        document.addEventListener('click', (e) => {
            if (_ge_fabHidden) {
                // Check if click is in the bottom-right corner (where the FAB would be)
                const threshold = 60;
                const inCorner = (window.innerWidth - e.clientX) < threshold && (window.innerHeight - e.clientY) < threshold;
                if (inCorner) {
                    const now = Date.now();
                    _ge_fabClicks.push(now);
                    _ge_fabClicks = _ge_fabClicks.filter(t => now - t < GE_TRIPLE_CLICK_MS);
                    if (_ge_fabClicks.length >= 3) {
                        _ge_fabClicks = [];
                        _ge_fabHidden = false;
                        if (featureFabStayHidden) setState('GrokEnhancer_FabHidden', false);
                        fab.style.display = '';
                        logDebug('[FAB] Restored via triple-click');
                    }
                }
                return;
            }
            // Auto-close panel when clicking outside
            if (!panelOpen) return;
            if (fab.contains(e.target) || panel.contains(e.target)) return;
            panelOpen = false;
            panel.classList.remove('open');
            fab.title = 'Grok Enhancer Settings';
        });

        // If FAB was hidden in a previous session, hide on load
        if (_ge_fabHidden) fab.style.display = 'none';

        document.body.appendChild(fab);

        // Header
        const header = document.createElement('div');
        header.className = 'ge-header';
        header.innerHTML = '<span style="color:#555;font-size:14px">★</span>  Grok Enhancer  <span style="color:#555;font-size:14px">★</span>';
        panel.appendChild(header);

        // Feature toggles section
        const section = document.createElement('div');
        section.className = 'ge-section';

        // ── Core (always visible) ──
        section.appendChild(ge_buildSimpleToggleRow('SuperGrok Logo'));
        section.appendChild(createToggle('Imagine Menu', featureImagineMenu, (on) => {
            featureImagineMenu = on; setState('GrokEnhancer_ImagineMenu', on);
            const imFab = document.getElementById('ge-im-fab');
            const imPanel = document.getElementById('ge-im-panel');
            if (on) {
                if (!imFab) ge_setupImagineMenu();
                else { imFab.style.display = ''; }
            } else {
                if (imFab) imFab.style.display = 'none';
                if (imPanel) imPanel.classList.remove('open');
            }
            panelAddLog(`Imagine Menu ${on ? 'ON' : 'OFF'}`);
        }).row);
        section.appendChild(ge_buildSimpleToggleRow('DeMod'));
        section.appendChild(createToggle('Rate Limit', featureRateLimit, (on) => {
            featureRateLimit = on; setState('GrokEnhancer_RateLimit', on);
            if (!on) rl_removeExisting(); else if (rl_lastQueryBar) rl_fetchAndUpdate(rl_lastQueryBar, true);
            panelAddLog(`Rate Limit ${on ? 'ON' : 'OFF'}`);
        }).row);

        // ── UI Cleanup ──
        const followupsRow = createToggle('Hide Follow-up Prompts', featureHideFollowups, (on) => {
            featureHideFollowups = on; setState('GrokEnhancer_HideFollowups', on);
            if (!on) {
                document.querySelectorAll('[data-ge-hidden="followups"]').forEach(el => el.removeAttribute('data-ge-hidden'));
                document.querySelectorAll('[data-ge-followup-checked]').forEach(el => el.removeAttribute('data-ge-followup-checked'));
            } else {
                ge_markFollowupContainers();
            }
            panelAddLog(`Hide Follow-up Prompts ${on ? 'ON' : 'OFF'}`);
        }).row;
        const navHideRows = GE_SIDEBAR_NAV_HIDE_ITEMS.map(item => {
            const stateKey = { build: 'GrokEnhancer_HideBuildNav', imagine: 'GrokEnhancer_HideImagineNav', skills: 'GrokEnhancer_HideSkillsNav' }[item.key];
            return createToggle(`Hide ${item.label}`, item.get(), (on) => {
                if (item.key === 'build') featureHideBuildNav = on;
                else if (item.key === 'imagine') featureHideImagineNav = on;
                else featureHideSkillsNav = on;
                setState(stateKey, on);
                ge_scanSidebarNavHide();
                panelAddLog(`Hide ${item.label} ${on ? 'ON' : 'OFF'}`);
            }).row;
        });
        section.appendChild(createSection('UI Cleanup', [
            ge_buildSimpleToggleRow('Hide Share Button'),
            ge_buildSimpleToggleRow('Hide Popups'),
            ge_buildSimpleToggleRow('Hide Premium Upsells'),
            followupsRow,
            createModelDropdown(),
            ...navHideRows,
        ]));

        // ── Privacy ──
        const privacyToggle = createToggle('Privacy Mode', featurePrivacyMode, (on) => {
            ge_requestPrivacyModeChange(on);
        });
        privacyToggle.input.id = 'ge-privacy-toggle-input';
        const privacyBadge = document.createElement('span');
        privacyBadge.id = 'ge-privacy-badge';
        privacyBadge.style.cssText = 'color:#888;font-size:11px;';
        privacyToggle.row.querySelector('.ge-label').appendChild(privacyBadge);

        const privacyBlurToggle = createToggle('Blur Chats (instead of hide)', featurePrivacyBlur, (on) => {
            featurePrivacyBlur = on;
            setState('GrokEnhancer_PrivacyBlur', on);
            ge_applyPrivacyCSS(featurePrivacyMode);
            ge_updatePrivacyBadge();
            panelAddLog(`Privacy Blur ${on ? 'ON' : 'OFF'}`);
        });

        const hideUsernameToggle = createToggle('Hide Username', featureHideUsername, (on) => {
            featureHideUsername = on;
            setState('GrokEnhancer_HideUsername', on);
            ge_applyFooterPrivacyCSS();
            panelAddLog(`Hide Username ${on ? 'ON' : 'OFF'}`);
        });
        const hideEmailToggle = createToggle('Hide Email', featureHideEmail, (on) => {
            featureHideEmail = on;
            setState('GrokEnhancer_HideEmail', on);
            ge_applyFooterPrivacyCSS();
            panelAddLog(`Hide Email ${on ? 'ON' : 'OFF'}`);
        });
        const hideAvatarToggle = createToggle('Hide Avatar', featureHideAvatar, (on) => {
            featureHideAvatar = on;
            setState('GrokEnhancer_HideAvatar', on);
            ge_applyFooterPrivacyCSS();
            panelAddLog(`Hide Avatar ${on ? 'ON' : 'OFF'}`);
        });

        const privacyWordsBtn = document.createElement('div');
        privacyWordsBtn.className = 'ge-row';
        const privacyWordsLabel = document.createElement('span');
        privacyWordsLabel.className = 'ge-label';
        privacyWordsLabel.textContent = 'Privacy Custom Words';
        const privacyWordsOpenBtn = document.createElement('button');
        privacyWordsOpenBtn.textContent = 'Manage';
        privacyWordsOpenBtn.style.cssText = 'background:#333;color:#aaa;border:none;border-radius:4px;padding:2px 10px;font-size:11px;cursor:pointer;';
        privacyWordsOpenBtn.addEventListener('click', () => ge_openPrivacyWordsEditor());
        privacyWordsBtn.appendChild(privacyWordsLabel);
        privacyWordsBtn.appendChild(privacyWordsOpenBtn);

        const privacyHotkeyRow = document.createElement('div');
        privacyHotkeyRow.className = 'ge-row ge-hotkey-row';
        const privacyHotkeyLabel = document.createElement('span');
        privacyHotkeyLabel.className = 'ge-label';
        privacyHotkeyLabel.textContent = 'Panic Hotkey';
        const privacyHotkeyBtn = document.createElement('button');
        privacyHotkeyBtn.textContent = ge_formatHotkey(ge_privacyHotkey);
        privacyHotkeyBtn.style.cssText = 'background:#333;color:#aaa;border:none;border-radius:4px;padding:2px 10px;font-size:11px;cursor:pointer;min-width:90px;';
        privacyHotkeyBtn.addEventListener('click', () => {
            privacyHotkeyBtn.textContent = 'Press keys…';
            const capture = (e) => {
                if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return; // wait for a real key
                e.preventDefault();
                document.removeEventListener('keydown', capture, true);
                ge_privacyHotkey = { ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey, key: e.key };
                setState('GrokEnhancer_StreamerHotkey', ge_privacyHotkey);
                privacyHotkeyBtn.textContent = ge_formatHotkey(ge_privacyHotkey);
            };
            document.addEventListener('keydown', capture, true);
        });
        privacyHotkeyRow.appendChild(privacyHotkeyLabel);
        privacyHotkeyRow.appendChild(privacyHotkeyBtn);

        const privacyCategoryRows = Object.keys(GE_PRIVACY_CATEGORIES).map(key => {
            const cat = GE_PRIVACY_CATEGORIES[key];
            return createToggle(cat.label, ge_isPrivacyCategoryOn(key), (on) => {
                ge_setPrivacyCategoryOn(key, on);
                ge_rebuildPrivacyRegex();
                ge_rescanPrivacyFull();
                panelAddLog(`Privacy Category "${cat.label}" ${on ? 'ON' : 'OFF'}`);
            }).row;
        });
        const privacyCategoriesDropdown = createSection('Privacy Categories', privacyCategoryRows);

        const autoLockRow = document.createElement('div');
        autoLockRow.className = 'ge-row';
        const autoLockToggle = createToggle('Auto-Lock on Idle', featureAutoLock, (on) => {
            featureAutoLock = on;
            setState('GrokEnhancer_AutoLock', on);
            ge_resetIdleTimer();
            panelAddLog(`Auto-Lock on Idle ${on ? 'ON' : 'OFF'}`);
        });
        const autoLockMinutesInput = document.createElement('input');
        autoLockMinutesInput.type = 'number';
        autoLockMinutesInput.min = '1';
        autoLockMinutesInput.value = String(ge_autoLockMinutes);
        autoLockMinutesInput.style.cssText = 'width:44px;background:#333;color:#aaa;border:none;border-radius:4px;padding:2px 6px;font-size:11px;margin-right:8px;';
        autoLockMinutesInput.addEventListener('change', () => {
            const mins = Math.max(1, parseInt(autoLockMinutesInput.value, 10) || 5);
            ge_autoLockMinutes = mins;
            autoLockMinutesInput.value = String(mins);
            setState('GrokEnhancer_AutoLockMinutes', mins);
            ge_resetIdleTimer();
        });
        autoLockToggle.row.insertBefore(autoLockMinutesInput, autoLockToggle.row.lastChild);

        const pinLockRow = document.createElement('div');
        pinLockRow.className = 'ge-row';
        const pinLockLabel = document.createElement('span');
        pinLockLabel.className = 'ge-label';
        pinLockLabel.textContent = 'PIN Lock';
        const pinLockBtnGroup = document.createElement('span');
        pinLockBtnGroup.style.cssText = 'display:flex;gap:6px;';
        const pinSetBtn = document.createElement('button');
        pinSetBtn.textContent = 'Set PIN';
        pinSetBtn.style.cssText = 'background:#333;color:#aaa;border:none;border-radius:4px;padding:2px 10px;font-size:11px;cursor:pointer;';
        pinSetBtn.addEventListener('click', () => {
            const openSetup = () => ge_setupPin(() => panelAddLog('PIN Lock ON'));
            if (_ge_hasPinSet()) ge_promptPinVerify(openSetup, 'Enter current PIN to change it', 'Next');
            else openSetup();
        });
        const pinResetBtn = document.createElement('button');
        pinResetBtn.textContent = 'Reset';
        pinResetBtn.style.cssText = 'background:#333;color:#aaa;border:none;border-radius:4px;padding:2px 10px;font-size:11px;cursor:pointer;';
        pinResetBtn.addEventListener('click', () => {
            const doReset = () => {
                setState('GrokEnhancer_SettingsPinHash', null);
                featurePinLock = false;
                setState('GrokEnhancer_PinLock', false);
                panelAddLog('PIN Lock reset');
            };
            if (_ge_hasPinSet()) ge_promptPinVerify(doReset, 'Enter PIN to reset', 'Reset');
            else doReset();
        });
        pinLockBtnGroup.appendChild(pinSetBtn);
        pinLockBtnGroup.appendChild(pinResetBtn);
        pinLockRow.appendChild(pinLockLabel);
        pinLockRow.appendChild(pinLockBtnGroup);

        section.appendChild(createSection('Privacy', [
            ge_buildSimpleToggleRow('Auto Private Chat'),
            privacyToggle.row,
            privacyBlurToggle.row,
            hideUsernameToggle.row,
            hideEmailToggle.row,
            hideAvatarToggle.row,
            privacyWordsBtn,
            privacyHotkeyRow,
            privacyCategoriesDropdown,
            autoLockToggle.row,
            pinLockRow,
        ]));
        ge_updatePrivacyBadge();

        // ── Other ──
        const stylesBtn = document.createElement('div');
        stylesBtn.className = 'ge-row';
        const stylesLabel = document.createElement('span');
        stylesLabel.className = 'ge-label';
        stylesLabel.textContent = 'Custom Styles';
        const stylesOpenBtn = document.createElement('button');
        stylesOpenBtn.textContent = 'Manage';
        stylesOpenBtn.style.cssText = 'background:#333;color:#aaa;border:none;border-radius:4px;padding:2px 10px;font-size:11px;cursor:pointer;';
        stylesOpenBtn.addEventListener('click', () => ge_openStylesEditor());
        stylesBtn.appendChild(stylesLabel);
        stylesBtn.appendChild(stylesOpenBtn);

        section.appendChild(createSection('Other', [
            ge_buildSimpleToggleRow('Clickable Links'),
            createToggle('Hidden Menu Survives Refresh', featureFabStayHidden, (on) => {
                featureFabStayHidden = on; setState('GrokEnhancer_FabStayHidden', on);
                if (on && _ge_fabHidden) setState('GrokEnhancer_FabHidden', true);
                if (!on) setState('GrokEnhancer_FabHidden', false);
                panelAddLog(`Hidden Menu Survives Refresh ${on ? 'ON' : 'OFF'}`);
            }).row,
            ge_buildSimpleToggleRow('Disable Auto Scroll'),
            ge_buildSimpleToggleRow('Debug'),
            stylesBtn,
        ]));

        panel.appendChild(section);

        // Divider
        const div1 = document.createElement('div');
        div1.className = 'ge-divider';
        panel.appendChild(div1);

        // Status row
        const statusRow = document.createElement('div');
        statusRow.className = 'ge-status';
        const statusLabel = document.createTextNode('DeMod: ');
        const statusSpan = document.createElement('span');
        statusSpan.textContent = 'Safe';
        statusSpan.style.color = DEMOD_CONFIG.statusColors.safe;
        statusRow.appendChild(statusLabel);
        statusRow.appendChild(statusSpan);
        panel.appendChild(statusRow);
        panelStatusEl = statusSpan;

        document.body.appendChild(panel);
    }

    // ══════════════════════════════════════════════════════════════
    //  6. Content Observer (Logo + Linkify)
    // ══════════════════════════════════════════════════════════════
    let _debounceTimer = null;
    const _pendingNodes = new Set();

    function _scheduleProcess(node) {
        _pendingNodes.add(node);
        clearTimeout(_debounceTimer);
        _debounceTimer = setTimeout(() => {
            for (const n of _pendingNodes) { try { linkifyNode(n); } catch (_) {} }
            _pendingNodes.clear();
        }, 80);
    }

    // Content observer — only triggers menu-related work when menus are detected
    let _ge_popupTimer = null;

    function startContentObserver() {
        const obs = new MutationObserver((mutations) => {
            if (!logoReplaced && featureLogo) tryReplaceLogo();

            let menuDetected = false;
            const privacyNodes = featurePrivacyMode ? [] : null;
            for (const m of mutations) {
                for (const added of m.addedNodes) {
                    if (added.nodeType !== Node.ELEMENT_NODE) continue;
                    if (featureLinks) _scheduleProcess(added);
                    if (!menuDetected && (added.matches?.('[role="menu"]') || added.querySelector?.('[role="menu"]'))) menuDetected = true;
                    if (privacyNodes) privacyNodes.push(added);
                }
            }

            if (menuDetected && (featureHideHeavy || featureHideExpert || featureHideAuto)) { ge_markModelItems(); ge_markUpgradeHeavyBtns(); }
            if (featureHidePremium) ge_dismissPremium();

            // Mark "Upgrade to Heavy" buttons on any mutation
            if (featureHideHeavy) ge_markUpgradeHeavyBtns();

            // Hide follow-up prompt containers when they appear
            if (featureHideFollowups) ge_markFollowupContainers();

            // Hide sidebar nav items (Build / Imagine / Skills and Connectors)
            if (featureHideBuildNav || featureHideImagineNav || featureHideSkillsNav) ge_scanSidebarNavHide();

            // Privacy mode: scan only newly-added nodes, not the whole document
            if (featurePrivacyMode && privacyNodes.length) ge_scanPrivacySensitive(privacyNodes);

            // Debounce popup dismissal (less urgent, 500ms)
            if ((featureHidePopups || featureHidePremium) && !_ge_popupTimer) {
                _ge_popupTimer = setTimeout(() => {
                    _ge_popupTimer = null;
                    ge_dismissPopups();
                    ge_dismissPremium();
                }, 500);
            }

            // Auto-enable private mode
            if (featureAutoPrivate && !_ge_privateTimer) {
                _ge_privateTimer = setTimeout(() => {
                    _ge_privateTimer = null;
                    ge_autoEnablePrivateMode();
                }, 1000);
            }

            // Downloader: scan for new media and inject mass download button
            ge_scanForDownloadableMedia();
            ge_injectMassDownloadBtn();

            // Imagine Menu: moderation detection + video loop enforcement
            ge_checkModeration();
            ge_enforceVideoLoop();
        });
        obs.observe(document.body, { childList: true, subtree: true });
        if (featureLogo) tryReplaceLogo();
        if (featureLinks) _scheduleProcess(document.body);
    }

    // ══════════════════════════════════════════════════════════════
    //  6b. Media Downloader (Imagine Favorites + Individual)
    //  Uses API interception to build a media database with HD URLs,
    //  variants (child posts), proper filenames, and metadata.
    // ══════════════════════════════════════════════════════════════
    const GE_DL_CSS_ID = 'ge-downloader-css';

    function ge_injectDownloaderCSS() {
        if (document.getElementById(GE_DL_CSS_ID)) return;
        const s = document.createElement('style');
        s.id = GE_DL_CSS_ID;
        s.textContent = `
            .ge-dl-btn {
                position: absolute; bottom: 8px; left: 8px; z-index: 20;
                width: 36px; height: 36px; border-radius: 50%;
                background: rgba(0,0,0,0.55); border: 1px solid rgba(255,255,255,0.15);
                color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center;
                opacity: 0; transition: opacity 0.2s;
            }
            .group\\/media-post-masonry-card:hover .ge-dl-btn,
            [class*="group/media-post"]:hover .ge-dl-btn,
            div[role="listitem"]:hover .ge-dl-btn,
            .group:hover > .ge-dl-btn { opacity: 1; }
            .ge-dl-btn:hover { background: rgba(255,255,255,0.15); }
            .ge-dl-btn svg { width: 16px; height: 16px; }
            /* Detail page download — always visible */
            .ge-dl-detail-btn {
                display: inline-flex; align-items: center; justify-content: center; gap: 6px;
                white-space: nowrap; font-size: 14px; font-weight: 600; line-height: normal;
                cursor: pointer; transition: colors 0.1s; border: none; border-radius: 9999px;
                overflow: hidden; height: 40px; width: 40px; padding: 8px;
                background: rgba(0,0,0,0.4); backdrop-filter: blur(2px);
                color: #fff; border: 0;
            }
            .ge-dl-detail-btn:hover { background: rgba(0,0,0,0.8); color: #fff; }
            .ge-dl-detail-btn svg { width: 16px; height: 16px; }
        `;
        document.head.appendChild(s);
    }

    const GE_DL_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>';

    // Determine the best media URL from a card (DOM fallback when API data unavailable)
    function ge_getMediaSrc(card) {
        const video = card.querySelector('video[src]');
        if (video && video.src) return { url: video.src, type: 'video', ext: 'mp4' };
        const img = card.querySelector('img[src*="assets.grok.com"], img[src*="imagine-public"]');
        if (img) {
            let url = img.src;
            if (url.includes('share-videos') && url.includes('_thumbnail.jpg')) {
                return { url: url.replace('_thumbnail.jpg', '.mp4'), type: 'video', ext: 'mp4' };
            }
            return { url, type: 'image', ext: 'png' };
        }
        // Handle base64 data URI images (e.g. /imagine history page)
        const anyImg = card.querySelector('img[src^="data:image/"]');
        if (anyImg && anyImg.src) {
            const mimeMatch = anyImg.src.match(/^data:image\/(\w+);/);
            const ext = mimeMatch ? (mimeMatch[1] === 'jpeg' ? 'jpg' : mimeMatch[1]) : 'png';
            return { url: anyImg.src, type: 'image', ext };
        }
        return null;
    }

    // Derive a real filename for a download. Base64 data: URIs legitimately contain
    // '/' characters, so naively doing url.split('/').pop() on one grabs a random
    // fragment of the base64 payload (e.g. "Z", "2Q==") instead of a filename.
    function ge_filenameFromMedia(url, ext) {
        if (url.startsWith('data:')) return `grok_${Date.now()}.${ext}`;
        return url.split('/').pop().split('?')[0] || `grok_${Date.now()}.${ext}`;
    }

    // Reliable download — uses GM_xmlhttpRequest for CORS-free downloading,
    // handles base64 data URIs directly, falls back to _originalFetch if GM API unavailable
    async function ge_downloadBlob(url, filename) {
        // Handle base64 data URIs directly
        if (url.startsWith('data:')) {
            return new Promise((resolve) => {
                try {
                    const [header, b64data] = url.split(',');
                    const mimeMatch = header.match(/data:([^;]+)/);
                    const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
                    const binary = atob(b64data);
                    const bytes = new Uint8Array(binary.length);
                    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                    const blob = new Blob([bytes], { type: mime });
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
                    resolve(true);
                } catch (e) {
                    logError('[Downloader] Base64 download failed', e);
                    resolve(false);
                }
            });
        }
        return new Promise((resolve) => {
            if (typeof GM_xmlhttpRequest === 'function') {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    responseType: 'blob',
                    onload: (resp) => {
                        if (resp.status >= 200 && resp.status < 300) {
                            const a = document.createElement('a');
                            a.href = URL.createObjectURL(resp.response);
                            a.download = filename;
                            document.body.appendChild(a);
                            a.click();
                            setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
                            resolve(true);
                        } else {
                            logError('[Downloader] HTTP', resp.status, url);
                            resolve(false);
                        }
                    },
                    onerror: () => { logError('[Downloader] XHR error', url); resolve(false); },
                    ontimeout: () => { logError('[Downloader] Timeout', url); resolve(false); }
                });
            } else {
                // Fallback to fetch
                _originalFetch(url, { mode: 'cors', credentials: 'include' })
                    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.blob(); })
                    .then(blob => {
                        const a = document.createElement('a');
                        a.href = URL.createObjectURL(blob);
                        a.download = filename;
                        document.body.appendChild(a);
                        a.click();
                        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
                        resolve(true);
                    })
                    .catch(e => { logError('[Downloader] Fetch fallback failed', url, e); resolve(false); });
            }
        });
    }

    // Add a download button on masonry grid cards (favorites page)
    // Downloads only the single media item shown on the card (not all variants)
    function ge_addSingleDownloadBtn(card) {
        if (card.querySelector('.ge-dl-btn')) return;

        // Quick check there's any media in this card at all
        const img = card.querySelector('img');
        const video = card.querySelector('video');
        const mediaSrc = img?.src || img?.dataset?.src || video?.poster || video?.dataset?.src || video?.src || '';
        if (!mediaSrc && !ge_getMediaSrc(card)) return;

        const btn = document.createElement('button');
        btn.className = 'ge-dl-btn';
        btn.innerHTML = GE_DL_ICON;
        btn.title = 'Download media';

        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            e.preventDefault();
            btn.style.opacity = '0.5';
            btn.style.pointerEvents = 'none';

            // Re-read media sources at click time (API data may have arrived after button was created)
            const ci = card.querySelector('img');
            const cv = card.querySelector('video');
            const csrc = ci?.src || ci?.dataset?.src || cv?.poster || cv?.dataset?.src || cv?.src || '';
            const pid = ge_extractPostId(csrc);
            const apiEntry = pid ? _ge_mediaDatabase.get(pid) : null;

            if (apiEntry && apiEntry.items.length > 0) {
                // Download only the single item matching this card's post ID
                const match = apiEntry.items.find(i => i.id === pid) || apiEntry.items[0];
                await ge_downloadBlob(match.url, match.name);
            } else {
                // Fallback: download single visible media from DOM
                const directMedia = ge_getMediaSrc(card);
                if (directMedia) {
                    const fname = ge_filenameFromMedia(directMedia.url, directMedia.ext);
                    await ge_downloadBlob(directMedia.url, fname);
                }
            }

            btn.style.opacity = '';
            btn.style.pointerEvents = '';
        });

        // Place inside the first .relative wrapper, or a button container
        const container = card.querySelector('.absolute.bottom-2.right-2');
        if (container) {
            container.prepend(btn);
            // Override position for container placement
            btn.style.position = 'relative'; btn.style.bottom = ''; btn.style.left = '';
            btn.style.opacity = '1';
        } else {
            const wrapper = card.querySelector('.relative') || card;
            if (getComputedStyle(wrapper).position === 'static') wrapper.style.position = 'relative';
            wrapper.appendChild(btn);
        }
    }

    function ge_scanForDownloadableMedia() {
        // Add download buttons on masonry grid cards (favorites page list items)
        const cardSelector = 'div[role="listitem"] div[class*="group/media-post-masonry-card"]:not([data-ge-dl-checked])';
        const fallbackSelector = 'div[role="listitem"] div[class*="group"]:not([data-ge-dl-checked])';
        let cards = document.querySelectorAll(cardSelector);
        if (!cards.length) cards = document.querySelectorAll(fallbackSelector);
        cards.forEach(card => {
            card.setAttribute('data-ge-dl-checked', '1');
            ge_addSingleDownloadBtn(card);
        });

        // Detail/single page download button
        ge_injectDetailPageDownload();
    }

    // ── Detail page download button (shows on single image/video view pages) ──
    function ge_injectDetailPageDownload() {
        const article = document.querySelector('main > article');
        if (!article) return;
        const mediaGroup = article.querySelector('.group.relative.rounded-2xl.overflow-hidden');
        if (!mediaGroup) return;
        if (mediaGroup.querySelector('.ge-dl-detail-btn')) return;

        // Try to get post ID from the page URL or from media in the article
        const pagePostId = ge_extractPostId(window.location.pathname);
        const articleImg = mediaGroup.querySelector('img[src*="assets.grok.com"], img[src*="imagine-public"]');
        const articleVideo = mediaGroup.querySelector('video[src]');
        const articleSrc = articleVideo?.src || articleImg?.src || '';
        const mediaPostId = ge_extractPostId(articleSrc) || pagePostId;

        function collectDetailMedia() {
            // If we have API data for this post, use that (most reliable)
            if (mediaPostId) {
                const apiEntry = _ge_mediaDatabase.get(mediaPostId);
                if (apiEntry && apiEntry.items.length > 0) {
                    return apiEntry.items.map(i => ({ url: i.url, type: i.type, ext: i.ext, name: i.name }));
                }
            }

            // Fallback: scrape from DOM
            const media = [];
            const seen = new Set();
            const sdVideo = mediaGroup.querySelector('video#sd-video[src]');
            const hdVideo = mediaGroup.querySelector('video#hd-video[src]');
            const mainVideo = (hdVideo && hdVideo.src) ? hdVideo : sdVideo;
            if (mainVideo && mainVideo.src) {
                if (!seen.has(mainVideo.src)) {
                    seen.add(mainVideo.src);
                    media.push({ url: mainVideo.src, type: 'video', ext: 'mp4' });
                }
            }
            mediaGroup.querySelectorAll('img[src*="assets.grok.com"], img[src*="imagine-public"]').forEach(img => {
                if (img.classList.contains('invisible') || img.classList.contains('pointer-events-none')) return;
                const url = img.src;
                if (!seen.has(url)) { seen.add(url); media.push({ url, type: 'image', ext: 'png' }); }
            });
            if (media.length === 0) {
                const fallbackImg = mediaGroup.querySelector('img[src*="assets.grok.com"], img[src*="imagine-public"]');
                if (fallbackImg) {
                    const url = fallbackImg.src;
                    if (!seen.has(url)) { seen.add(url); media.push({ url, type: 'image', ext: 'png' }); }
                }
            }
            // Variant thumbnails
            const variantPanel = article.querySelector('.absolute[style*="left: -75px"], .absolute[style*="left:-75px"]');
            if (variantPanel) {
                variantPanel.querySelectorAll('button img[alt^="Thumbnail"]').forEach(vImg => {
                    const vUrl = vImg.src;
                    const isVideoVariant = vImg.closest('button')?.querySelector('svg path[d*="M22.5 19.0811"]');
                    if (isVideoVariant) {
                        const videoUrl = vUrl.replace('_thumbnail.jpg', '.mp4').replace('/preview_image.jpg', '/generated_video.mp4');
                        if (!seen.has(videoUrl)) { seen.add(videoUrl); media.push({ url: videoUrl, type: 'video', ext: 'mp4' }); }
                    } else {
                        const fullUrl = vUrl.replace('/preview_image.jpg', '/image.jpg');
                        if (!seen.has(fullUrl)) { seen.add(fullUrl); media.push({ url: fullUrl, type: 'image', ext: 'png' }); }
                    }
                });
            }
            return media;
        }

        const topBar = mediaGroup.querySelector('.absolute.top-0.left-0.flex.flex-row.justify-end');
        if (!topBar) return;

        const btn = document.createElement('button');
        btn.className = 'ge-dl-detail-btn';
        btn.innerHTML = GE_DL_ICON;
        btn.title = 'Download all media';
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            e.preventDefault();
            const media = collectDetailMedia();
            if (media.length === 0) { logDebug('[Downloader] No media found on detail page'); return; }
            btn.style.opacity = '0.5'; btn.style.pointerEvents = 'none';
            for (const m of media) {
                const fname = m.name || ge_filenameFromMedia(m.url, m.ext);
                await ge_downloadBlob(m.url, fname);
            }
            btn.style.opacity = ''; btn.style.pointerEvents = '';
        });
        const moreOptGroup = topBar.querySelector('.flex.flex-row.gap-2');
        if (moreOptGroup) {
            topBar.insertBefore(btn, moreOptGroup);
        } else {
            topBar.appendChild(btn);
        }
    }

    // ── Mass Downloader for /imagine/favorites ──
    function ge_injectMassDownloadBtn() {
        if (!window.location.pathname.startsWith('/imagine/favorites')) return;
        if (document.querySelector('[data-ge-mass-dl]')) return;

        const topBar = document.querySelector('div.py-3.flex.items-center.gap-3');
        if (!topBar) return;

        const uploadBtn = topBar.querySelector('button[aria-label="Upload image"]');
        if (!uploadBtn) return;

        const btn = document.createElement('button');
        btn.setAttribute('data-ge-mass-dl', '1');
        btn.className = uploadBtn.className;
        btn.type = 'button';
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-download size-4"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" x2="12" y1="15" y2="3"></line></svg><span class="font-semibold">Mass Download</span>`;
        btn.addEventListener('click', () => ge_openMassDownloadDialog());
        uploadBtn.parentNode.insertBefore(btn, uploadBtn);
    }

    // Collect all media from the favorites page, using the API database
    function ge_collectAllMedia() {
        const items = [];
        const seenIds = new Set();
        const seenUrls = new Set();

        document.querySelectorAll('div[role="listitem"]').forEach(listItem => {
            const card = listItem.querySelector('div[class*="group/media-post-masonry-card"]') || listItem;
            const img = card.querySelector('img');
            const video = card.querySelector('video');
            const src = img?.src || img?.dataset?.src || video?.poster || video?.dataset?.src || video?.src || '';
            const postId = ge_extractPostId(src);
            const entry = postId ? _ge_mediaDatabase.get(postId) : null;

            if (entry) {
                for (const mi of entry.items) {
                    if (!seenIds.has(mi.id)) {
                        seenIds.add(mi.id);
                        seenUrls.add(mi.url);
                        items.push({
                            url: mi.url, type: mi.type, ext: mi.ext,
                            thumb: mi.thumb, name: mi.name,
                            el: card, postId,
                            createTime: mi.createTime, prompt: mi.prompt,
                            isVariant: entry.items.indexOf(mi) > 0
                        });
                    }
                }
                return;
            }

            // Fallback: scrape from DOM
            const directMedia = ge_getMediaSrc(card);
            if (directMedia && !seenUrls.has(directMedia.url)) {
                seenUrls.add(directMedia.url);
                items.push({
                    url: directMedia.url, type: directMedia.type, ext: directMedia.ext,
                    thumb: directMedia.type === 'image' ? directMedia.url : '',
                    name: directMedia.url.split('/').pop().split('?')[0] || `media_${items.length}.${directMedia.ext}`,
                    el: card
                });
            }
        });

        return items;
    }

    function ge_openMassDownloadDialog() {
        let existing = document.getElementById('ge-mass-dl-modal');
        if (existing) { try { existing.close(); } catch(_){} existing.remove(); }

        const dlg = document.createElement('dialog');
        dlg.id = 'ge-mass-dl-modal';
        dlg.style.cssText = 'background:#1a1a1a;border:1px solid #333;border-radius:12px;width:520px;max-width:92vw;max-height:85vh;overflow-y:auto;padding:24px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#ccc;';
        const bk = document.createElement('style');
        bk.textContent = '#ge-mass-dl-modal::backdrop{background:rgba(0,0,0,0.6)}';
        dlg.appendChild(bk);

        function closeModal() { try { dlg.close(); } catch(_){} dlg.remove(); }

        // Title
        const title = document.createElement('h2');
        title.textContent = 'Mass Download';
        title.style.cssText = 'margin:0 0 16px;font-size:16px;color:#fff;';
        dlg.appendChild(title);

        // Database status
        const dbInfo = document.createElement('div');
        dbInfo.style.cssText = 'font-size:11px;color:#666;margin-bottom:8px;';
        dbInfo.textContent = `Media database: ${_ge_mediaDatabase.size} entries indexed`;
        dlg.appendChild(dbInfo);

        const allMedia = ge_collectAllMedia();

        // Info
        const info = document.createElement('div');
        info.style.cssText = 'font-size:12px;color:#888;margin-bottom:12px;';
        const imgCount = allMedia.filter(m => m.type === 'image').length;
        const vidCount = allMedia.filter(m => m.type === 'video').length;
        const varCount = allMedia.filter(m => m.isVariant).length;
        info.textContent = `Found ${allMedia.length} items (${imgCount} images, ${vidCount} videos` + (varCount ? `, ${varCount} variants` : '') + ')';
        dlg.appendChild(info);

        // Options container
        const opts = document.createElement('div');
        opts.style.cssText = 'display:flex;flex-direction:column;gap:10px;margin-bottom:16px;';

        // Concurrent downloads
        const concRow = document.createElement('div');
        concRow.style.cssText = 'display:flex;align-items:center;gap:8px;';
        const concLabel = document.createElement('span');
        concLabel.textContent = 'Concurrent downloads:';
        concLabel.style.cssText = 'font-size:12px;color:#aaa;';
        const concInput = document.createElement('input');
        concInput.type = 'number'; concInput.min = '1'; concInput.max = '10'; concInput.value = '3';
        concInput.style.cssText = 'background:#111;border:1px solid #333;border-radius:6px;padding:4px 8px;color:#ddd;font-size:12px;width:60px;';
        concRow.appendChild(concLabel); concRow.appendChild(concInput);
        opts.appendChild(concRow);

        // Media type checkboxes
        const typeRow = document.createElement('div');
        typeRow.style.cssText = 'display:flex;gap:16px;align-items:center;';
        const mkCheck = (lbl, def) => {
            const w = document.createElement('label');
            w.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:12px;color:#aaa;cursor:pointer;';
            const cb = document.createElement('input');
            cb.type = 'checkbox'; cb.checked = def;
            cb.style.cssText = 'accent-color:#666;';
            w.appendChild(cb);
            w.appendChild(document.createTextNode(lbl));
            return { wrap: w, input: cb };
        };
        const chkImages = mkCheck('Images', true);
        const chkVideos = mkCheck('Videos', true);
        const chkVariants = mkCheck('Include Variants', true);
        typeRow.appendChild(chkImages.wrap);
        typeRow.appendChild(chkVideos.wrap);
        typeRow.appendChild(chkVariants.wrap);
        opts.appendChild(typeRow);

        dlg.appendChild(opts);

        // Progress bar area (hidden initially)
        const progressArea = document.createElement('div');
        progressArea.style.cssText = 'display:none;margin-bottom:16px;';
        const progressText = document.createElement('div');
        progressText.style.cssText = 'font-size:13px;color:#ccc;margin-bottom:6px;';
        const progressBarOuter = document.createElement('div');
        progressBarOuter.style.cssText = 'width:100%;height:6px;background:#333;border-radius:3px;overflow:hidden;';
        const progressBarInner = document.createElement('div');
        progressBarInner.style.cssText = 'height:100%;width:0%;background:#4a9eff;border-radius:3px;transition:width 0.3s;';
        progressBarOuter.appendChild(progressBarInner);
        progressArea.appendChild(progressText);
        progressArea.appendChild(progressBarOuter);
        dlg.appendChild(progressArea);

        // Buttons
        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';

        function getFilteredMedia() {
            let items = [...allMedia];
            if (!chkVariants.input.checked) items = items.filter(m => !m.isVariant);
            if (!chkImages.input.checked) items = items.filter(m => m.type !== 'image');
            if (!chkVideos.input.checked) items = items.filter(m => m.type !== 'video');
            return items;
        }

        let _dl_cancelled = false;

        async function runDownload(items) {
            _dl_cancelled = false;
            const concurrent = Math.max(1, Math.min(10, parseInt(concInput.value) || 3));
            progressArea.style.display = 'block';
            let done = 0, failed = 0;
            const total = items.length;
            progressText.textContent = `0 / ${total}`;
            progressBarInner.style.width = '0%';

            btnRow.querySelectorAll('button').forEach(b => b.disabled = true);

            const queue = [...items];
            const workers = [];
            for (let i = 0; i < concurrent; i++) {
                workers.push((async () => {
                    while (queue.length > 0 && !_dl_cancelled) {
                        const item = queue.shift();
                        if (!item) break;
                        const ok = await ge_downloadBlob(item.url, item.name);
                        if (!ok) failed++;
                        done++;
                        progressText.textContent = `${done} / ${total}` + (failed ? ` (${failed} failed)` : '');
                        progressBarInner.style.width = `${Math.round((done / total) * 100)}%`;
                    }
                })());
            }
            await Promise.all(workers);

            if (_dl_cancelled) {
                progressText.textContent = `Stopped at ${done} / ${total}` + (failed ? ` (${failed} failed)` : '');
            } else {
                progressText.textContent = `Done! ${done} / ${total}` + (failed ? ` (${failed} failed)` : '');
            }
            btnRow.querySelectorAll('button').forEach(b => b.disabled = false);
        }

        // "Download All" button
        const dlAllBtn = document.createElement('button');
        dlAllBtn.textContent = 'Download All';
        dlAllBtn.style.cssText = 'background:#4a9eff;color:#fff;border:none;border-radius:6px;padding:8px 16px;font-size:12px;cursor:pointer;font-weight:600;';
        dlAllBtn.addEventListener('click', () => {
            const items = getFilteredMedia();
            if (items.length === 0) { info.textContent = 'No items match the current filters.'; return; }
            runDownload(items);
        });
        btnRow.appendChild(dlAllBtn);

        // "Stop" button
        const stopBtn = document.createElement('button');
        stopBtn.textContent = 'Stop';
        stopBtn.style.cssText = 'background:#333;color:#aaa;border:none;border-radius:6px;padding:8px 16px;font-size:12px;cursor:pointer;';
        stopBtn.addEventListener('click', () => { _dl_cancelled = true; });
        btnRow.appendChild(stopBtn);

        // "Export Links" button
        const exportBtn = document.createElement('button');
        exportBtn.textContent = 'Export Links';
        exportBtn.style.cssText = 'background:#333;color:#aaa;border:none;border-radius:6px;padding:8px 16px;font-size:12px;cursor:pointer;';
        exportBtn.addEventListener('click', () => {
            const items = getFilteredMedia();
            if (items.length === 0) { info.textContent = 'No items to export.'; return; }
            let content = '';
            items.forEach((item, i) => {
                content += `${i + 1}. ${item.name}\n   Type: ${item.type}${item.isVariant ? ' (variant)' : ''}\n   URL: ${item.url}\n\n`;
            });
            const blob = new Blob([content], { type: 'text/plain' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `grok_favorites_links_${Date.now()}.txt`;
            document.body.appendChild(a); a.click();
            setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        });
        btnRow.appendChild(exportBtn);

        // "Export Metadata" button
        const metaBtn = document.createElement('button');
        metaBtn.textContent = 'Export Metadata';
        metaBtn.style.cssText = 'background:#333;color:#aaa;border:none;border-radius:6px;padding:8px 16px;font-size:12px;cursor:pointer;';
        metaBtn.addEventListener('click', () => {
            const items = getFilteredMedia();
            if (items.length === 0) { info.textContent = 'No items to export.'; return; }
            const meta = items.map(item => ({
                name: item.name, type: item.type, url: item.url,
                isVariant: !!item.isVariant, thumbnail: item.thumb || null,
                createTime: item.createTime || null, prompt: item.prompt || null
            }));
            const blob = new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `grok_favorites_metadata_${Date.now()}.json`;
            document.body.appendChild(a); a.click();
            setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        });
        btnRow.appendChild(metaBtn);

        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Close';
        closeBtn.style.cssText = 'background:#333;color:#aaa;border:none;border-radius:6px;padding:8px 16px;font-size:12px;cursor:pointer;margin-left:auto;';
        closeBtn.addEventListener('click', closeModal);
        btnRow.appendChild(closeBtn);

        dlg.appendChild(btnRow);
        document.body.appendChild(dlg);
        dlg.showModal();
    }

    // Init downloader: inject CSS, scan media, inject mass download button
    function ge_initDownloader() {
        ge_injectDownloaderCSS();
        ge_scanForDownloadableMedia();
        ge_injectMassDownloadBtn();
    }

    // ══════════════════════════════════════════════════════════════
    //  6c. Imagine Menu — Video Controls, Auto-Retry, Prompt Manager
    // ══════════════════════════════════════════════════════════════

    // ── Moderation detection ──
    const GE_MODERATION_EXACT = 'Content Moderated. Try a different idea.';
    const GE_MODERATION_PATTERNS = ['content moderated', 'try a different idea', 'moderated', 'content policy', 'cannot generate', 'unable to generate'];

    function ge_findModerationSignal() {
        // Method 1: Detect blurred/moderated images — alt="Moderated" with blur classes
        const moderatedImgs = document.querySelectorAll('img[alt="Moderated"]');
        for (const img of moderatedImgs) {
            const cls = img.className || '';
            if (cls.includes('blur') || cls.includes('saturate-0')) return true;
        }

        // Method 2: Detect eye-off SVG icon (lucide-eye-off) used on moderated content
        const eyeOff = document.querySelectorAll('svg.lucide-eye-off, svg[class*="lucide-eye-off"]');
        for (const svg of eyeOff) {
            // Only count it if it's large (size-24 = main content, not thumbnail)
            const w = parseInt(svg.getAttribute('width') || '0');
            if (w >= 24) return true;
            const cls = svg.className?.baseVal || svg.className || '';
            if (cls.includes('size-24')) return true;
        }

        // Method 3: Toast / notification text patterns
        const toastRoot = document.querySelector('section[aria-label="Notifications alt+T"]')
            || document.querySelector('section[aria-label*="Notification"]')
            || document.querySelector('[role="alert"]');
        if (toastRoot) {
            const txt = (toastRoot.textContent || '').toLowerCase();
            if (GE_MODERATION_PATTERNS.some(p => txt.includes(p))) return true;
        }

        // Method 4: Exact text match in spans
        const main = document.querySelector('main') || document.body;
        const spans = main.querySelectorAll('span');
        const cap = Math.min(spans.length, 600);
        for (let i = 0; i < cap; i++) {
            if ((spans[i].textContent || '').trim() === GE_MODERATION_EXACT) return true;
        }

        // Method 5: Gray placeholder thumbnail with eye-off icon in variant strip
        const thumbContainers = document.querySelectorAll('button .bg-gray-700');
        for (const tc of thumbContainers) {
            if (tc.querySelector('svg.lucide-eye-off, svg[class*="lucide-eye-off"]')) return true;
        }

        return false;
    }

    // ── Persistent Prompt: restore prompt text when moderation clears it ──
    let _ge_lastPromptText = '';
    let _ge_persistentPromptTimer = null;

    function ge_startPersistentPromptWatch() {
        if (_ge_persistentPromptTimer) return;
        _ge_persistentPromptTimer = setInterval(() => {
            if (!ge_imPersistentPrompt || !_ge_lastPromptText) {
                if (!ge_imPersistentPrompt) { clearInterval(_ge_persistentPromptTimer); _ge_persistentPromptTimer = null; }
                return;
            }
            const input = document.querySelector('textarea[aria-label="Make a video"]')
                || document.querySelector('textarea[aria-label="Ask anything"]')
                || document.querySelector('textarea');
            if (!input) return;
            // If the textarea was cleared but we had a prompt saved, restore it
            if (!input.value || input.value.trim() === '') {
                const setter = Object.getOwnPropertyDescriptor(_win.HTMLTextAreaElement.prototype, 'value')?.set;
                if (setter) { setter.call(input, _ge_lastPromptText); } else { input.value = _ge_lastPromptText; }
                input.dispatchEvent(new Event('input', { bubbles: true }));
                logDebug('[ImagineMenu] Persistent Prompt restored text');
            }
        }, 500);
    }

    // Also save the prompt text whenever the user types (not just on moderation)
    function ge_trackPromptText() {
        if (!ge_imPersistentPrompt) return;
        const input = document.querySelector('textarea[aria-label="Make a video"]')
            || document.querySelector('textarea[aria-label="Ask anything"]')
            || document.querySelector('textarea');
        if (input && input.value && input.value.trim() !== '') {
            _ge_lastPromptText = input.value;
        }
    }

    // ── Auto-retry on moderation ──
    let _ge_imLastModScan = 0;

    function ge_checkModeration() {
        if (!featureImagineMenu) return;

        // Track prompt for Persistent Prompt feature
        ge_trackPromptText();

        // Re-read state to ensure toggle changes are reflected immediately
        const retryOn = ge_imAutoRetry;
        const smartOn = ge_imSmartRetry;
        if (!retryOn && !smartOn) return;
        const now = Date.now();
        if (now - _ge_imLastModScan < 400) return;
        _ge_imLastModScan = now;
        if (!ge_findModerationSignal()) {
            // Moderation cleared (e.g. a retry succeeded) — reset so auto-retry doesn't
            // permanently stop working for the rest of the session once it hits the cap.
            // The 5s cooldown avoids resetting mid-flight, before the just-clicked retry's
            // own moderation signal has had time to render.
            if (ge_imRetryCount > 0 && now - ge_imLastRetryTime > 5000) {
                ge_imRetryCount = 0;
                ge_updateImStatus();
            }
            return;
        }

        const btn = document.querySelector('button[aria-label="Make video"]')
            || document.querySelector('button[aria-label="Send"]')
            || document.querySelector('button[data-testid="send-button"]');
        const input = document.querySelector('textarea[aria-label="Make a video"]')
            || document.querySelector('textarea[aria-label="Ask anything"]')
            || document.querySelector('textarea');

        if (!btn || !input) return;
        if (ge_imRetryCount >= ge_imMaxRetries) return;
        if (now - ge_imLastRetryTime < 3000) return;

        // Smart Retry: reword the prompt to evade moderation filters
        if (smartOn && input.value) {
            const reworded = ge_smartRewritePrompt(input.value, ge_imRetryCount + 1);
            if (reworded !== input.value) {
                const setter = Object.getOwnPropertyDescriptor(_win.HTMLTextAreaElement.prototype, 'value')?.set;
                if (setter) { setter.call(input, reworded); } else { input.value = reworded; }
                input.dispatchEvent(new Event('input', { bubbles: true }));
                logDebug('[ImagineMenu] Smart Retry rewrote prompt');
            }
        }

        // Persistent Prompt: save the prompt before retry so it can be restored if cleared
        if (ge_imPersistentPrompt && input.value) {
            _ge_lastPromptText = input.value;
        }

        if (retryOn) {
            ge_imRetryCount++;
            ge_imLastRetryTime = now;
            logDebug(`[ImagineMenu] Auto-retry ${ge_imRetryCount}/${ge_imMaxRetries}`);
            setTimeout(() => { btn.click(); }, 800);
            ge_updateImStatus();
        }
    }

    // ── Smart Retry: multi-strategy prompt rewriting to avoid moderation ──
    // Each retry attempt uses a different strategy to produce varied results.

    // Strategy 1: Leet speak — broad char-level substitution
    const _ge_leetMap = { 'a': '4', 'e': '3', 'i': '1', 'o': '0', 'u': 'v', 's': '5', 't': '7', 'b': '8', 'g': '9', 'l': '1' };
    function ge_leetSpeak(text) {
        return text.split('').map(ch => {
            const lower = ch.toLowerCase();
            const repl = _ge_leetMap[lower];
            if (!repl) return ch;
            if (Math.random() < 0.65) return repl;
            return ch;
        }).join('');
    }

    // Strategy 2: Zero-width character insertion between characters of each word
    function ge_zeroWidthInsert(text) {
        const zwChars = ['\u200B', '\u200C', '\u200D', '\uFEFF'];
        return text.split(/\b/).map(token => {
            if (!/^[a-zA-Z]{3,}$/.test(token)) return token;
            let out = '';
            for (let i = 0; i < token.length; i++) {
                out += token[i];
                if (i < token.length - 1 && Math.random() < 0.45) {
                    out += zwChars[Math.floor(Math.random() * zwChars.length)];
                }
            }
            return out;
        }).join('');
    }

    // Strategy 3: Word synonym / obfuscated-form swap
    const _ge_synonymMap = {
        // ── Nudity / adult ──
        'naked': 'n4ked', 'nude': 'nud3', 'nudity': 'nudty',
        'sexy': 's3xy', 'sexual': 's3xual', 'sex': 's3x',
        'porn': 'p0rn', 'pornographic': 'p0rngrphc', 'pornography': 'p0rngrphy',
        'erotic': 'er0tic', 'erotica': 'er0tica',
        'hentai': 'h3ntai', 'explicit': 'expl1cit',
        'nsfw': 'n5fw', 'uncensored': 'uncen5ored',
        'lewd': 'l3wd', 
        // ── Body parts ──
        'breast': 'br3ast', 'breasts': 'br3asts', 'boobs': 'b00bs', 'boob': 'b00b',
        'nipple': 'n1pple', 'nipples': 'n1pples',
        'butt': 'bu7t', 'ass': '4ss', 'buttocks': 'buttks',
        'vagina': 'v4gina', 'pussy': 'pu5sy',
        'penis': 'p3nis', 'cock': 'c0ck', 'dick': 'd1ck',
        'genitals': 'gntls', 'crotch': 'cr0tch', 'groin': 'gr01n',
        'cleavage': 'cl3avage', 'thigh': 'thi9h', 'thighs': 'thi9hs',
        'belly': 'b3lly', 'torso': 't0rso',
        // ── Actions / adult ──
        'strip': 'str1p', 'stripping': 'str1pping', 'undress': 'undr3ss',
        'unclothed': 'uncl0thed', 'disrobe': 'd1srobe',
        'topless': 't0pless', 'bottomless': 'b0ttomless',
        'revealing': 'r3vealing', 'exposed': 'exp0sed',
        'seduce': 's3duce', 'seductive': 's3ductive',
        'aroused': '4roused', 'orgasm': '0rgasm', 'climax': 'cl1max',
        'masturbate': 'm4sturbate', 'masturbating': 'm4sturbating',
        'blow': 'bl0w', 'blowjob': 'bl0wj0b',
        'lick': 'l1ck', 'licking': 'l1cking',
        'suck': '5uck', 'sucking': '5ucking',
        'fondle': 'f0ndle', 'grope': 'gr0pe', 'groping': 'gr0ping',
        'penetrate': 'p3netrate', 'intercourse': '1ntercourse',
        'cum': 'c0m', 'cumshot': 'c0mshot',
        'moan': 'm04n', 'moaning': 'm04ning',
        'pleasure': 'pl3asure', 'naughty': 'n4ughty',
        // ── Clothing ──
        'clothes': 'cl0ths', 'clothing': 'cl0thng',
        'shirt': 'sh1rt', 'pants': 'pnt5', 'underwear': 'undrwr',
        'panties': 'pnt1es', 'thong': 'th0ng', 'bra': 'br4',
        'bikini': 'bk1ni', 'lingerie': 'l1ngerie',
        'skirt': 'sk1rt', 'shorts': 'sh0rts',
        'dress': 'dr3ss', 'outfit': '0utfit',
        // ── Violence ──
        'choke': 'ch0ke',
        // ── Weapons ──
        'gun': 'gu n', 'guns': 'gun5', 'rifle': 'r1fle',
        'weapon': 'we4pon', 'weapons': 'we4pons',
        'knife': 'kn1fe', 'blade': 'bl4de',
        // ── Substances ──
        'drug': 'dr0g', 'drugs': 'dr0gs',
        'cocaine': 'c0caine', 'heroin': 'her01n', 'meth': 'm3th',
        'marijuana': 'marij0ana', 'weed': 'w33d',
        // ── Other flagged ──
        'fight': 'f1ght', 'fighting': 'f1ghting',
        'body': 'b0dy', 'figure': 'f1gure',
        // ── Common softeners ──
        'hot': 'h0t', 'girl': 'g1rl', 'boy': 'b0y',
        'woman': 'w0man', 'man': 'm4n', 'anime': 'anim3',
        'show': 'sh0w', 'remove': 'rem0ve', 'touch': 't0uch',
        'take': 't4ke', 'put': 'pu7', 'off': '0ff',
        'pull': 'pul1', 'reveal': 'rev34l',
    };
    let _ge_synonymRegex = null;
    function ge_getSynonymRegex() {
        if (!_ge_synonymRegex) {
            const keys = Object.keys(_ge_synonymMap).sort((a, b) => b.length - a.length);
            _ge_synonymRegex = new RegExp('\\b(' + keys.join('|') + ')\\b', 'gi');
        }
        return _ge_synonymRegex;
    }
    function ge_synonymSwap(text) {
        return text.replace(ge_getSynonymRegex(), (m) => {
            const r = _ge_synonymMap[m.toLowerCase()];
            if (!r) return m;
            if (m[0] === m[0].toUpperCase() && m[0] !== m[0].toLowerCase()) return r[0].toUpperCase() + r.slice(1);
            return r;
        });
    }

    // Strategy 4: Abbreviation / interior vowel dropping
    function ge_abbreviate(text) {
        return text.split(/\b/).map(token => {
            if (!/^[a-zA-Z]{4,}$/.test(token)) return token;
            if (Math.random() < 0.3) return token;
            const first = token[0], last = token[token.length - 1];
            const middle = token.slice(1, -1).replace(/[aeiou]/gi, (v) => Math.random() < 0.65 ? '' : v);
            return first + middle + last;
        }).join('');
    }

    // Strategy 5: Letter doubling + random capitalization
    function ge_letterDouble(text) {
        return text.split('').map(ch => {
            if (/[a-zA-Z]/.test(ch)) {
                if (Math.random() < 0.2) ch = ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase();
                if (Math.random() < 0.18 && !/[aeiouAEIOU]/.test(ch)) return ch + ch;
            }
            return ch;
        }).join('');
    }

    // Strategy 6: Combined synonym swap + leet speak
    function ge_combinedRewrite(text) {
        return ge_leetSpeak(ge_synonymSwap(text));
    }

    // Strategy 7: Typo Scrambler — simulates mistyping: drops letters, keyboard
    // neighbor substitutions, leet vowels, and occasional transpositions.
    // Produces results like "clothes" → "cl0ths", "take off" → "t4ke 0ff".
    const _ge_kbNeighbors = {
        'a':'qs','b':'vn','c':'xv','d':'se','e':'wr','f':'dg','g':'fh','h':'gj',
        'i':'uo','j':'hk','k':'jl','l':'k','m':'n','n':'mb','o':'ip','p':'ol',
        'q':'wa','r':'et','s':'ad','t':'ry','u':'yi','v':'cb','w':'eq','x':'zc',
        'y':'tu','z':'xs',
    };
    function ge_typoScramble(text) {
        return text.split(/\b/).map(token => {
            if (!/^[a-zA-Z]{3,}$/.test(token)) return token;
            let chars = token.split('');
            // Leet-substitute vowels (~50% each)
            chars = chars.map((c, i) => {
                if (i === 0) return c; // keep first char
                const leet = { 'a':'4','e':'3','i':'1','o':'0','A':'4','E':'3','I':'1','O':'0' };
                if (leet[c] && Math.random() < 0.5) return leet[c];
                // Keyboard neighbor (~15%)
                const nb = _ge_kbNeighbors[c.toLowerCase()];
                if (nb && Math.random() < 0.15) {
                    const rep = nb[Math.floor(Math.random() * nb.length)];
                    return c === c.toUpperCase() ? rep.toUpperCase() : rep;
                }
                return c;
            });
            // Drop interior letters (~22% each, never first/last)
            chars = chars.filter((c, i) => i === 0 || i === chars.length - 1 || Math.random() > 0.22);
            // Transpose one adjacent pair (~30% of words)
            if (chars.length >= 4 && Math.random() < 0.3) {
                const idx = 1 + Math.floor(Math.random() * (chars.length - 2));
                const swap = Math.min(idx + 1, chars.length - 1);
                [chars[idx], chars[swap]] = [chars[swap], chars[idx]];
            }
            return chars.join('');
        }).join('');
    }

    // Strategy 8: Typo scramble + synonym swap (most aggressive)
    function ge_fullScramble(text) {
        return ge_typoScramble(ge_synonymSwap(text));
    }

    // Ordered strategy list — cycles through on each retry
    const _ge_rewriteStrategies = [
        ge_synonymSwap,
        ge_typoScramble,
        ge_leetSpeak,
        ge_abbreviate,
        ge_combinedRewrite,
        ge_zeroWidthInsert,
        ge_letterDouble,
        ge_fullScramble,
    ];

    function ge_smartRewritePrompt(text, retryNum) {
        const idx = ((retryNum || ge_imRetryCount) - 1) % _ge_rewriteStrategies.length;
        const strategy = _ge_rewriteStrategies[Math.max(0, idx)];
        const result = strategy(text);
        logDebug(`[ImagineMenu] Smart Retry strategy ${idx}: ${strategy.name}`);
        return result;
    }

    // ── Auto Upscale removed ──
    // ── Video loop enforcement ──
    function ge_enforceVideoLoop() {
        if (!featureImagineMenu) return;
        const videos = document.querySelectorAll('video');
        videos.forEach(v => {
            if (ge_imDisableLoop) {
                if (v.hasAttribute('loop') || v.loop) {
                    v.removeAttribute('loop');
                    v.loop = false;
                }
            }
        });
    }

    // ── Disable Auto Scroll enforcement ──
    // Grok has an auto-scroll setting that re-enables itself. This watches for it
    // and forces it off by intercepting the scrollIntoView and scrollTo calls,
    // and by toggling the setting in Grok's preferences via the API.
    let _ge_autoScrollPatched = false;
    function ge_enforceAutoScrollDisable() {
        if (!featureDisableAutoScroll) {
            // Restore original scroll behavior if toggle turned off
            if (_ge_autoScrollPatched) {
                if (_ge_origScrollIntoView) {
                    Element.prototype.scrollIntoView = _ge_origScrollIntoView;
                }
                _ge_autoScrollPatched = false;
            }
            return;
        }
        if (_ge_autoScrollPatched) return;
        _ge_autoScrollPatched = true;

        // Override scrollIntoView to suppress automatic scrolling during message streaming
        _ge_origScrollIntoView = Element.prototype.scrollIntoView;
        Element.prototype.scrollIntoView = function(opts) {
            // Allow scroll if user initiated (click, keyboard shortcuts)
            // Block if it looks like auto-scroll from streaming response
            const isUserAction = _ge_userScrolling;
            if (isUserAction) {
                return _ge_origScrollIntoView.call(this, opts);
            }
            // Check if this is coming from the message area (auto-scroll)
            const inMsgArea = this.closest && (
                this.closest('[class*="message"]') ||
                this.closest('[class*="response"]') ||
                this.closest('[class*="chat"]') ||
                this.closest('main')
            );
            if (inMsgArea) {
                logDebug('[AutoScroll] Blocked automatic scrollIntoView');
                return;
            }
            return _ge_origScrollIntoView.call(this, opts);
        };

        // Also try to set the preference via API
        ge_apiDisableAutoScroll();

        logDebug('[AutoScroll] Auto scroll disabled');
    }
    let _ge_origScrollIntoView = null;
    let _ge_userScrolling = false;

    // Track user scroll actions
    if (typeof document !== 'undefined') {
        document.addEventListener('wheel', () => { _ge_userScrolling = true; setTimeout(() => { _ge_userScrolling = false; }, 300); }, { passive: true });
        document.addEventListener('keydown', (e) => {
            if (['PageDown', 'PageUp', 'ArrowDown', 'ArrowUp', 'Home', 'End', ' '].includes(e.key)) {
                _ge_userScrolling = true; setTimeout(() => { _ge_userScrolling = false; }, 300);
            }
        });
    }

    async function ge_apiDisableAutoScroll() {
        // Try to update auto-scroll preference via Grok's settings API
        const endpoints = [
            { url: '/rest/app-chat/settings', method: 'PATCH', body: JSON.stringify({ autoScroll: false }) },
            { url: '/rest/app-chat/settings', method: 'PUT', body: JSON.stringify({ autoScroll: false, auto_scroll: false }) },
            { url: '/rest/app-chat/preferences', method: 'PATCH', body: JSON.stringify({ autoScroll: false }) },
            { url: '/rest/app-chat/preferences', method: 'PUT', body: JSON.stringify({ autoScroll: false, auto_scroll: false }) },
        ];
        for (const ep of endpoints) {
            try {
                const r = await _originalFetch(ep.url, {
                    method: ep.method,
                    credentials: 'include',
                    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
                    body: ep.body,
                });
                if (r.ok) {
                    logDebug(`[AutoScroll] API disabled auto-scroll via ${ep.url}`);
                    return;
                }
            } catch (_) {}
        }
        logDebug('[AutoScroll] API disable failed, relying on scrollIntoView override');
    }

    // ── Overlay controls hide CSS ──
    function ge_applyOverlayHideCSS(on) {
        const id = 'ge-im-overlay-hide-css';
        const existing = document.getElementById(id);
        if (on) {
            if (existing) return;
            const s = document.createElement('style');
            s.id = id;
            s.textContent = `
                /* Hide video overlay controls (volume, more options, etc) */
                video + div button,
                video ~ div button[aria-label="More options"],
                video ~ div button[aria-label="Volume"],
                video ~ div button[aria-label="Mute"],
                .absolute button[aria-label="More options"],
                [class*="group/media-post"] button[aria-label="More options"] { display: none !important; }
            `;
            document.head.appendChild(s);
        } else {
            if (existing) existing.remove();
        }
    }

    // ── Imagine Menu status helper ──
    function ge_updateImStatus() {
        const el = document.getElementById('ge-im-status');
        if (!el) return;
        let txt = '';
        if (ge_imInterceptCount > 0) txt += `${ge_imInterceptCount} req modified`;
        if (ge_imRetryCount > 0) txt += (txt ? ' · ' : '') + `Retry ${ge_imRetryCount}/${ge_imMaxRetries}`;
        if (!txt) txt = ge_imInterceptOn ? 'Ready — waiting for video gen' : 'Interception OFF';
        el.textContent = txt;
    }

    function ge_updateImActiveLabel() {
        const el = document.getElementById('ge-im-active-prompt');
        if (!el) return;
        if (ge_imActivePromptId) {
            const p = ge_getPrompts().find(x => x.id === ge_imActivePromptId);
            el.textContent = p ? '→ ' + p.name : '';
            el.style.display = p ? 'block' : 'none';
        } else {
            el.textContent = '';
            el.style.display = 'none';
        }
    }

    // ── Prompt Manager Dialog ──
    function ge_openPromptManager() {
        const existing = document.getElementById('ge-prompt-mgr-dlg');
        if (existing) existing.remove();

        const dlg = document.createElement('dialog');
        dlg.id = 'ge-prompt-mgr-dlg';
        dlg.style.cssText = 'position:fixed;inset:0;margin:auto;width:460px;max-height:80vh;background:#1a1a1a;border:1px solid #333;border-radius:12px;color:#ccc;padding:0;z-index:100002;overflow:hidden;';

        // Header
        const hdr = document.createElement('div');
        hdr.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid #333;';
        const hTitle = document.createElement('div');
        hTitle.textContent = 'Prompt Manager';
        hTitle.style.cssText = 'font-size:14px;font-weight:700;color:#fff;';
        const hClose = document.createElement('button');
        hClose.textContent = '✕';
        hClose.style.cssText = 'background:none;border:none;color:#666;cursor:pointer;font-size:16px;padding:0 4px;';
        hClose.addEventListener('click', () => { dlg.close(); dlg.remove(); });
        hdr.appendChild(hTitle);
        hdr.appendChild(hClose);
        dlg.appendChild(hdr);

        // Body (list)
        const body = document.createElement('div');
        body.style.cssText = 'padding:12px 16px;overflow-y:auto;max-height:calc(80vh - 120px);display:flex;flex-direction:column;gap:8px;';

        function renderList() {
            body.innerHTML = '';
            const prompts = ge_getPrompts();
            if (prompts.length === 0) {
                const empty = document.createElement('div');
                empty.textContent = 'No prompts yet. Click "New Prompt" to create one.';
                empty.style.cssText = 'font-size:12px;color:#666;text-align:center;padding:24px 0;';
                body.appendChild(empty);
                return;
            }
            for (const p of prompts) {
                const card = document.createElement('div');
                card.style.cssText = `padding:10px 12px;background:#222;border-radius:8px;border:1px solid ${p.id === ge_imActivePromptId ? '#4ade80' : '#333'};`;

                const topRow = document.createElement('div');
                topRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';
                const nameEl = document.createElement('div');
                nameEl.style.cssText = 'font-size:13px;font-weight:600;color:#fff;display:flex;align-items:center;gap:6px;';
                const nameText = document.createElement('span');
                nameText.textContent = p.name + (p.id === ge_imActivePromptId ? ' ✓' : '');
                nameEl.appendChild(nameText);
                // Type badge
                if (p.sourceType && p.sourceType !== 'both') {
                    const badge = document.createElement('span');
                    badge.textContent = p.sourceType === 'image' ? '🖼️' : '🎬';
                    badge.title = p.sourceType === 'image' ? 'Image prompt' : 'Video prompt';
                    badge.style.cssText = 'font-size:11px;';
                    nameEl.appendChild(badge);
                }
                const btnGroup = document.createElement('div');
                btnGroup.style.cssText = 'display:flex;gap:4px;';

                const useBtn = document.createElement('button');
                useBtn.textContent = p.id === ge_imActivePromptId ? 'Deselect' : 'Use';
                useBtn.style.cssText = `background:${p.id === ge_imActivePromptId ? '#333' : '#2d5a3d'};color:${p.id === ge_imActivePromptId ? '#aaa' : '#4ade80'};border:none;border-radius:4px;padding:2px 8px;font-size:10px;cursor:pointer;`;
                useBtn.addEventListener('click', () => {
                    if (ge_imActivePromptId === p.id) {
                        ge_imActivePromptId = null;
                        setState('GrokEnhancer_ActivePromptId', null);
                    } else {
                        ge_imActivePromptId = p.id;
                        setState('GrokEnhancer_ActivePromptId', p.id);
                    }
                    ge_updateImActiveLabel();
                    renderList();
                });

                const editBtn = document.createElement('button');
                editBtn.textContent = 'Edit';
                editBtn.style.cssText = 'background:#333;color:#aaa;border:none;border-radius:4px;padding:2px 8px;font-size:10px;cursor:pointer;';
                editBtn.addEventListener('click', () => openEditor(p));

                const delBtn = document.createElement('button');
                delBtn.textContent = 'Del';
                delBtn.style.cssText = 'background:#3a2020;color:#f87171;border:none;border-radius:4px;padding:2px 8px;font-size:10px;cursor:pointer;';
                delBtn.addEventListener('click', () => {
                    const all = ge_getPrompts().filter(x => x.id !== p.id);
                    ge_savePrompts(all);
                    if (ge_imActivePromptId === p.id) {
                        ge_imActivePromptId = null;
                        setState('GrokEnhancer_ActivePromptId', null);
                        ge_updateImActiveLabel();
                    }
                    renderList();
                });

                btnGroup.appendChild(useBtn);
                btnGroup.appendChild(editBtn);
                btnGroup.appendChild(delBtn);
                topRow.appendChild(nameEl);
                topRow.appendChild(btnGroup);
                card.appendChild(topRow);

                if (p.description) {
                    const desc = document.createElement('div');
                    desc.textContent = p.description;
                    desc.style.cssText = 'font-size:11px;color:#888;margin-top:4px;';
                    card.appendChild(desc);
                }
                if (p.text) {
                    const preview = document.createElement('div');
                    preview.textContent = p.text.length > 100 ? p.text.slice(0, 97) + '...' : p.text;
                    preview.style.cssText = 'font-size:10px;color:#555;margin-top:4px;font-family:monospace;white-space:pre-wrap;word-break:break-all;';
                    card.appendChild(preview);
                }
                body.appendChild(card);
            }
        }

        function openEditor(existing) {
            body.innerHTML = '';
            const isNew = !existing;
            const data = existing || { id: 'prompt_' + Date.now(), name: '', description: '', text: '', sourceType: 'both' };
            if (!data.sourceType) data.sourceType = 'both';

            const mkRow = (label, val, type) => {
                const r = document.createElement('div');
                r.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
                const l = document.createElement('label');
                l.textContent = label;
                l.style.cssText = 'font-size:11px;color:#888;';
                const inp = type === 'textarea' ? document.createElement('textarea') : document.createElement('input');
                inp.value = val || '';
                inp.style.cssText = `width:100%;padding:8px;background:#111;color:#fff;border:1px solid #444;border-radius:6px;font-size:12px;font-family:inherit;${type === 'textarea' ? 'min-height:120px;resize:vertical;' : ''}`;
                r.appendChild(l);
                r.appendChild(inp);
                return { row: r, input: inp };
            };

            const nameF = mkRow('Name', data.name, 'text');
            const descF = mkRow('Description', data.description, 'text');

            // Type selector (Image / Video / Both)
            const typeRow = document.createElement('div');
            typeRow.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
            const typeLbl = document.createElement('label');
            typeLbl.textContent = 'Type';
            typeLbl.style.cssText = 'font-size:11px;color:#888;';
            const typeSelect = document.createElement('select');
            typeSelect.style.cssText = 'width:100%;padding:8px;background:#111;color:#fff;border:1px solid #444;border-radius:6px;font-size:12px;';
            ['both', 'image', 'video'].forEach(t => {
                const opt = document.createElement('option');
                opt.value = t; opt.textContent = t.charAt(0).toUpperCase() + t.slice(1);
                if (data.sourceType === t) opt.selected = true;
                typeSelect.appendChild(opt);
            });
            typeRow.appendChild(typeLbl);
            typeRow.appendChild(typeSelect);

            const textF = mkRow('Prompt Text', data.text, 'textarea');
            body.appendChild(nameF.row);
            body.appendChild(descF.row);
            body.appendChild(typeRow);
            body.appendChild(textF.row);

            const btns = document.createElement('div');
            btns.style.cssText = 'display:flex;gap:8px;margin-top:8px;';

            const saveBtn = document.createElement('button');
            saveBtn.textContent = isNew ? 'Create' : 'Save';
            saveBtn.style.cssText = 'background:#2d5a3d;color:#4ade80;border:none;border-radius:6px;padding:6px 16px;font-size:12px;cursor:pointer;';
            saveBtn.addEventListener('click', () => {
                const name = nameF.input.value.trim();
                if (!name) { nameF.input.style.borderColor = '#f87171'; return; }
                data.name = name;
                data.description = descF.input.value.trim();
                data.sourceType = typeSelect.value;
                data.text = textF.input.value;
                const all = ge_getPrompts();
                const idx = all.findIndex(x => x.id === data.id);
                if (idx >= 0) all[idx] = data;
                else all.push(data);
                ge_savePrompts(all);
                renderList();
            });
            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = 'Cancel';
            cancelBtn.style.cssText = 'background:#333;color:#aaa;border:none;border-radius:6px;padding:6px 16px;font-size:12px;cursor:pointer;';
            cancelBtn.addEventListener('click', () => renderList());
            btns.appendChild(saveBtn);
            btns.appendChild(cancelBtn);
            body.appendChild(btns);
        }

        renderList();
        dlg.appendChild(body);

        // Footer
        const foot = document.createElement('div');
        foot.style.cssText = 'padding:10px 16px;border-top:1px solid #333;display:flex;justify-content:space-between;';
        const newBtn = document.createElement('button');
        newBtn.textContent = '+ New Prompt';
        newBtn.style.cssText = 'background:#2d5a3d;color:#4ade80;border:none;border-radius:6px;padding:6px 14px;font-size:12px;cursor:pointer;';
        newBtn.addEventListener('click', () => openEditor(null));
        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Close';
        closeBtn.style.cssText = 'background:#333;color:#aaa;border:none;border-radius:6px;padding:6px 14px;font-size:12px;cursor:pointer;';
        closeBtn.addEventListener('click', () => { dlg.close(); dlg.remove(); });
        foot.appendChild(newBtn);
        foot.appendChild(closeBtn);
        dlg.appendChild(foot);

        document.body.appendChild(dlg);
        dlg.showModal();
    }

    // ── Imagine Menu FAB + Panel ──
    function ge_setupImagineMenu() {
        // CSS
        const css = document.createElement('style');
        css.id = 'ge-im-css';
        css.textContent = `
            #ge-im-fab {
                position: fixed; bottom: 12px; right: 56px; z-index: 10001;
                width: 40px; height: 40px; border-radius: 50%; border: none; cursor: pointer;
                color: #4ade80; background: #111;
                display: flex; align-items: center; justify-content: center; padding: 0;
                box-shadow: 0 1px 4px rgba(0,0,0,0.5);
                transition: box-shadow 0.15s ease, background 0.15s ease;
            }
            #ge-im-fab:hover { background: #222; box-shadow: 0 2px 8px rgba(74,222,128,0.2); }
            #ge-im-panel {
                position: fixed; bottom: 52px; right: 56px; z-index: 10000;
                background: #141414; border: 1px solid #2a2a2a; border-radius: 10px;
                box-shadow: 0 4px 16px rgba(0,0,0,0.6);
                display: none; flex-direction: column; gap: 0;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                color: #ccc; width: 230px; overflow: hidden;
            }
            #ge-im-panel.open { display: flex; }
            #ge-im-panel .im-hdr {
                padding: 8px 12px;font-size:11px;font-weight:700;color:#4ade80;
                border-bottom:1px solid #222;letter-spacing:0.5px;text-transform:uppercase;text-align:center;
            }
            #ge-im-panel .im-section { padding:6px 12px;display:flex;flex-direction:column;gap:6px; }
            #ge-im-panel .im-row { display:flex;align-items:center;justify-content:space-between; }
            #ge-im-panel .im-lbl { font-size:12px;color:#aaa;user-select:none; }
            #ge-im-panel .im-divider { height:1px;background:#222;margin:0; }

            @media (max-width: 768px) {
                #ge-im-fab { bottom: 80px; }
                #ge-im-panel { bottom: 120px; }
            }
        `;
        document.head.appendChild(css);

        // FAB
        const fab = document.createElement('button');
        fab.id = 'ge-im-fab';
        fab.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>';
        fab.title = 'Imagine Menu';

        // Panel
        const panel = document.createElement('div');
        panel.id = 'ge-im-panel';

        let imOpen = false;
        fab.addEventListener('click', (e) => {
            e.stopPropagation();
            imOpen = !imOpen;
            panel.classList.toggle('open', imOpen);
        });
        document.addEventListener('click', (e) => {
            if (!imOpen) return;
            if (fab.contains(e.target) || panel.contains(e.target)) return;
            imOpen = false;
            panel.classList.remove('open');
        });

        // Header
        const hdr = document.createElement('div');
        hdr.className = 'im-hdr';
        hdr.textContent = '💡 Imagine Menu 💡';
        panel.appendChild(hdr);

        const section = document.createElement('div');
        section.className = 'im-section';

        // Toggle helper (reuse GE toggle styling)
        function imToggle(label, checked, onChange) {
            const row = document.createElement('div'); row.className = 'im-row';
            const lbl = document.createElement('span'); lbl.className = 'im-lbl'; lbl.textContent = label;
            const tgl = document.createElement('label'); tgl.style.cssText = 'position:relative;display:inline-block;width:30px;height:16px;flex-shrink:0;';
            const inp = document.createElement('input'); inp.type = 'checkbox'; inp.checked = checked;
            inp.style.cssText = 'opacity:0;width:0;height:0;position:absolute;';
            const sl = document.createElement('span');
            sl.style.cssText = `position:absolute;cursor:pointer;inset:0;background:${checked ? '#444' : '#333'};border-radius:8px;transition:background 0.2s;`;
            const dot = document.createElement('span');
            dot.style.cssText = `content:'';position:absolute;height:12px;width:12px;left:2px;bottom:2px;background:${checked ? '#fff' : '#666'};border-radius:50%;transition:transform 0.2s,background 0.2s;${checked ? 'transform:translateX(14px);' : ''}`;
            sl.appendChild(dot);
            inp.addEventListener('change', () => {
                const on = inp.checked;
                sl.style.background = on ? '#444' : '#333';
                dot.style.background = on ? '#fff' : '#666';
                dot.style.transform = on ? 'translateX(14px)' : '';
                onChange(on);
            });
            tgl.appendChild(inp); tgl.appendChild(sl);
            row.appendChild(lbl); row.appendChild(tgl);
            return { row, input: inp };
        }

        // ── Interception toggle ──
        const interceptLabel = document.createElement('span');
        interceptLabel.className = 'im-lbl';
        interceptLabel.textContent = ge_imInterceptOn ? 'Enabled' : 'Disabled';
        const interceptToggle = imToggle('', ge_imInterceptOn, (on) => {
            ge_imInterceptOn = on; setState('GrokEnhancer_IM_Intercept', on);
            interceptLabel.textContent = on ? 'Enabled' : 'Disabled';
            ge_updateImStatus();
        });
        // Replace the empty label with our dynamic one
        interceptToggle.row.prepend(interceptLabel);
        section.appendChild(interceptToggle.row);

        // ── Video length input ──
        const lenRow = document.createElement('div'); lenRow.className = 'im-row';
        const lenLbl = document.createElement('span'); lenLbl.className = 'im-lbl'; lenLbl.textContent = 'Extend Video Length';
        const lenWrap = document.createElement('div'); lenWrap.style.cssText = 'display:flex;align-items:center;gap:4px;';
        const lenInp = document.createElement('input');
        lenInp.type = 'number'; lenInp.min = '1'; lenInp.max = '30'; lenInp.value = ge_imVideoLength;
        lenInp.style.cssText = 'width:42px;padding:2px 4px;background:#222;color:#fff;border:1px solid #444;border-radius:4px;font-size:11px;text-align:center;';
        // Restrict to spinner arrows only — block all keyboard input except arrows
        lenInp.addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') { e.preventDefault(); }
        });
        lenInp.addEventListener('paste', (e) => e.preventDefault());
        lenInp.addEventListener('change', () => {
            const v = parseInt(lenInp.value);
            if (v >= 1 && v <= 30) { ge_imVideoLength = v; setState('GrokEnhancer_IM_VideoLength', v); }
        });
        const lenSuf = document.createElement('span'); lenSuf.style.cssText = 'font-size:10px;color:#666;'; lenSuf.textContent = 'sec';
        lenWrap.appendChild(lenInp); lenWrap.appendChild(lenSuf);
        lenRow.appendChild(lenLbl); lenRow.appendChild(lenWrap);
        section.appendChild(lenRow);

        // ── Status ──
        const statusEl = document.createElement('div');
        statusEl.id = 'ge-im-status';
        statusEl.style.cssText = 'font-size:10px;color:#4ade80;padding:6px 0;font-family:monospace;';
        statusEl.textContent = 'Ready — waiting for video gen';
        section.appendChild(statusEl);

        // Divider
        const d1 = document.createElement('div'); d1.className = 'im-divider';
        section.appendChild(d1);

        // ── Auto-retry toggle ──
        section.appendChild(imToggle('Auto-Retry on Moderation', ge_imAutoRetry, (on) => {
            ge_imAutoRetry = on; setState('GrokEnhancer_IM_AutoRetry', on);
            if (!on) { ge_imRetryCount = 0; ge_imLastRetryTime = 0; ge_updateImStatus(); }
        }).row);

        // ── Smart Retry toggle ──
        section.appendChild(imToggle('Smart Retry', ge_imSmartRetry, (on) => {
            ge_imSmartRetry = on; setState('GrokEnhancer_IM_SmartRetry', on);
        }).row);

        // ── Persistent Prompt toggle ──
        section.appendChild(imToggle('Persistent Prompt', ge_imPersistentPrompt, (on) => {
            ge_imPersistentPrompt = on; setState('GrokEnhancer_IM_PersistentPrompt', on);
            if (on) ge_startPersistentPromptWatch();
            else _ge_lastPromptText = '';
        }).row);

        // ── Max retries ──
        const retRow = document.createElement('div'); retRow.className = 'im-row';
        const retLbl = document.createElement('span'); retLbl.className = 'im-lbl'; retLbl.textContent = 'Max Retries';
        const retInp = document.createElement('input');
        retInp.type = 'number'; retInp.min = '1'; retInp.max = '20'; retInp.value = ge_imMaxRetries;
        retInp.style.cssText = 'width:42px;padding:2px 4px;background:#222;color:#fff;border:1px solid #444;border-radius:4px;font-size:11px;text-align:center;';
        retInp.addEventListener('change', () => {
            const v = parseInt(retInp.value);
            if (v >= 1 && v <= 20) { ge_imMaxRetries = v; setState('GrokEnhancer_IM_MaxRetries', v); }
        });
        retRow.appendChild(retLbl); retRow.appendChild(retInp);
        section.appendChild(retRow);

        // Divider
        const d2 = document.createElement('div'); d2.className = 'im-divider';
        section.appendChild(d2);

        // ── Disable Video Looping ──
        section.appendChild(imToggle('Disable Video Loop', ge_imDisableLoop, (on) => {
            ge_imDisableLoop = on; setState('GrokEnhancer_IM_DisableLoop', on);
            ge_enforceVideoLoop();
        }).row);

        // ── Hide Overlay Controls ──
        section.appendChild(imToggle('Hide Overlay Controls', ge_imHideOverlay, (on) => {
            ge_imHideOverlay = on; setState('GrokEnhancer_IM_HideOverlay', on);
            ge_applyOverlayHideCSS(on);
        }).row);

        // Divider
        const d3 = document.createElement('div'); d3.className = 'im-divider';
        section.appendChild(d3);

        // ── Prompt Manager button ──
        const pmRow = document.createElement('div'); pmRow.className = 'im-row';
        const pmLbl = document.createElement('span'); pmLbl.className = 'im-lbl'; pmLbl.textContent = 'Prompts';
        const pmBtn = document.createElement('button');
        pmBtn.textContent = 'Manage';
        pmBtn.style.cssText = 'background:#333;color:#aaa;border:none;border-radius:4px;padding:2px 10px;font-size:11px;cursor:pointer;';
        pmBtn.addEventListener('click', () => ge_openPromptManager());
        pmRow.appendChild(pmLbl); pmRow.appendChild(pmBtn);
        section.appendChild(pmRow);

        // ── Active prompt indicator ──
        const activeLabel = document.createElement('div');
        activeLabel.id = 'ge-im-active-prompt';
        activeLabel.style.cssText = 'font-size:10px;color:#4ade80;padding:2px 0;display:none;';
        section.appendChild(activeLabel);

        panel.appendChild(section);
        document.body.appendChild(fab);
        document.body.appendChild(panel);

        // Apply initial states
        ge_applyOverlayHideCSS(ge_imHideOverlay);
        ge_enforceVideoLoop();
        ge_enforceAutoScrollDisable();
        ge_updateImStatus();
        ge_updateImActiveLabel();
    }

    // ══════════════════════════════════════════════════════════════
    //  7. Initialization
    // ══════════════════════════════════════════════════════════════
    function applyShareHide(on) {
        const existingStyle = document.getElementById('ge-share-hide-css');
        if (on) {
            if (existingStyle) return;
            const s = document.createElement('style');
            s.id = 'ge-share-hide-css';
            s.textContent = 'button[aria-label="Create share link"] { display: none !important; }';
            document.head.appendChild(s);
        } else {
            if (existingStyle) existingStyle.remove();
        }
    }

    function init() {
        setupPanel();
        applyShareHide(featureHideShare);
        ge_applyPopupHideCSS(featureHidePopups);
        ge_applyPremiumHideCSS(featureHidePremium);
        ge_applyHideModelsCSS(featureHideHeavy || featureHideExpert || featureHideAuto || featureHideFollowups);
        ge_applyPrivacyCSS(featurePrivacyMode);
        ge_applyFooterPrivacyCSS();
        startContentObserver();
        ge_startPrivacyGuardObserver();
        ge_startIdleWatch();
        rl_observeDOM();
        if (featureAutoPrivate) ge_autoEnablePrivateMode();
        if (featurePrivacyMode) ge_scanPrivacySensitive();
        if (featureHideHeavy || featureHideExpert || featureHideAuto) ge_markModelItems();
        if (featureHideHeavy) ge_markUpgradeHeavyBtns();
        if (featureHideFollowups) ge_markFollowupContainers();
        if (featureHideBuildNav || featureHideImagineNav || featureHideSkillsNav) ge_scanSidebarNavHide();
        if (featureHidePremium) {
            ge_dismissPremium();
            setTimeout(ge_dismissPremium, 1500); // catch late-rendered Upgrade button
        }
        ge_initDownloader();
        if (featureImagineMenu) ge_setupImagineMenu();
        if (ge_imPersistentPrompt) ge_startPersistentPromptWatch();
        if (featureDisableAutoScroll) ge_enforceAutoScrollDisable();
        console.log('[GrokEnhancer] Loaded — Logo:', featureLogo, '| Links:', featureLinks, '| DeMod:', featureDeMod, '| RateLimit:', featureRateLimit, '| Debug:', featureDebug, '| HideShare:', featureHideShare, '| HidePopups:', featureHidePopups, '| HidePremium:', featureHidePremium, '| HideHeavy:', featureHideHeavy, '| HideExpert:', featureHideExpert, '| HideAuto:', featureHideAuto, '| HideFollowups:', featureHideFollowups, '| AutoPrivate:', featureAutoPrivate, '| PrivacyMode:', featurePrivacyMode, '| ImagineMenu:', featureImagineMenu);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

})();
