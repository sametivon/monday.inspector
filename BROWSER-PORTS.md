# Cross-browser ports

Reality check on which browsers are actually viable, where the code differs,
and how to publish to each store.

| Browser | Status | Code change needed | Where to ship |
|---|---|---|---|
| **Chrome** | ✅ Live | none — primary target | [Chrome Web Store](https://chrome.google.com/webstore/devconsole) |
| **Edge** (Chromium-based) | ✅ Compatible today | none — same `dist/` works | [Microsoft Edge Add-ons](https://partner.microsoft.com/en-us/dashboard/microsoftedge) |
| **Firefox** 121+ | ✅ Built in this repo | manifest fork only | [Mozilla Add-ons (AMO)](https://addons.mozilla.org/developers/) |
| **Brave / Opera / Vivaldi** | ✅ Compatible today | none — install from Chrome Web Store directly | already listed via Chrome |
| **Safari** | ⚠️ Possible, not built yet | macOS conversion + Apple Developer account | App Store via Xcode |
| **Internet Explorer** | ❌ Not possible | — | IE was retired by Microsoft in June 2022. No extension API exists. |

## Firefox — built and ready

The same JS/CSS/HTML bundles run on Firefox 121+. Only the manifest differs:
Firefox requires a stable `gecko.id` (a unique identifier) and a
`strict_min_version`.

### Build
```bash
npm run build:all       # → dist/ (Chrome) AND dist-firefox/ (Firefox)
# or
npm run build:firefox   # same — alias for clarity
```

The `scripts/build-firefox.mjs` post-build step copies `dist/` into
`dist-firefox/` and overwrites `manifest.json` with the Firefox variant
from `public/manifest.firefox.json`.

### Package + submit to AMO
```powershell
# From the repo root in PowerShell
Compress-Archive -Path "dist-firefox\*" -DestinationPath "monday-inspector-firefox-v1.5.4.zip" -Force
```

Then:
1. Sign in at [addons.mozilla.org/developers/](https://addons.mozilla.org/developers/) (free Mozilla account)
2. **Submit a new add-on** → On this site
3. Upload `monday-inspector-firefox-v1.5.4.zip`
4. Choose **listed** distribution (public listing on AMO)
5. Reuse `store/description.txt`, the same screenshots, and `https://mondayinspector.eu/privacy.html` as the privacy policy URL
6. Source code: AMO requires source for any extension that uses minified or
   bundled JS. We bundle via Vite, so include the GitHub repo URL in the
   source-code field — Mozilla reviewers can rebuild from main.

Review usually takes 1–7 days for new add-ons; manual review every release
after that. Faster if you join the [recommended developers
program](https://blog.mozilla.org/addons/2019/06/12/recommended-extensions/).

### What's different between Chrome and Firefox
- **Manifest** — only this differs:
  - Firefox needs `browser_specific_settings.gecko.id` (`monday-inspector@fruitionservices.io`)
  - Firefox needs `strict_min_version: "121.0"` (MV3 service-worker support
    landed in Firefox 121 — December 2023)
- **Runtime APIs** — every `chrome.*` call we make
  (`chrome.storage.local`, `chrome.tabs.query`, `chrome.runtime.onMessage`,
  `chrome.action.setBadgeBackgroundColor`, `chrome.runtime.getURL`) is part
  of the standard WebExtensions API and works on Firefox without changes.
  Firefox aliases the `chrome.*` namespace to `browser.*` for compat.
- **CSP** — our existing `script-src 'self'; object-src 'self'` is valid
  Firefox MV3 CSP.

### Verifying the Firefox build before submitting
1. Open Firefox → `about:debugging`
2. Click **This Firefox** → **Load Temporary Add-on…**
3. Pick `dist-firefox/manifest.json`
4. The extension installs for the current session. Test on a
   `monday.com` board page — popup, inline panel toggle, full-page
   Importer, full-page Query Inspector should all behave identically
   to Chrome.

## Edge — already works, just needs a separate listing

Edge is Chromium under the hood and accepts Chrome Web Store extensions
directly. Two options:

### Option A — keep one codebase, list separately
1. Use the same `monday-inspector-v1.5.4.zip` we submitted to Chrome.
2. Sign in at [Microsoft Partner Center → Edge Add-ons](https://partner.microsoft.com/dashboard/microsoftedge).
3. **Create new extension** → upload the Chrome zip.
4. Reuse the Chrome listing copy + screenshots + privacy URL.
5. Submit. Edge review usually takes 1–3 days.

### Option B — let Edge users install from the Chrome Web Store
Edge can install Chrome extensions directly. The "Install" link on
mondayinspector.eu already works for Edge users — they just see a banner
asking them to allow extensions from the Chrome Web Store. No additional
work required.

The benefit of Option A is discoverability inside Edge's own store and
a slightly better trust signal for enterprise users.

## Safari — separate, larger effort

Safari supports WebExtensions but needs a native macOS wrapper:

1. **Hardware**: macOS machine (or VM with caveats)
2. **Tools**: Xcode 14+
3. **Account**: [Apple Developer Program](https://developer.apple.com/programs/) — **$99/year**
4. **Conversion**: run `xcrun safari-web-extension-converter dist-firefox/`
   (Firefox's manifest is closer to Safari's accepted shape)
5. **Build** the generated Xcode project, sign with your developer cert
6. **Submit** to App Store Connect for review

Realistic effort: 2–4 hours for the first port + ongoing maintenance per
release. We haven't done this yet because the user count is still small —
revisit when there's demand.

If/when we do: the `chrome.*` API calls all work on Safari (it accepts
both `chrome.*` and `browser.*` namespaces), so the source code requires
zero changes — only the wrapping/distribution differs.

## Internet Explorer — not possible

Microsoft retired IE on June 15, 2022. There is no extension API for IE
and no way to ship to it. Anyone still on IE should be redirected to Edge.

## Brave / Opera / Vivaldi

All three are Chromium-based and install Chrome Web Store extensions
directly. The "Add to Chrome" link on the website works for them as-is.
There's no Brave Store / Opera Add-ons listing for Chromium extensions
worth pursuing — the user count is dominated by direct Chrome Web Store
installs.

---

## Maintenance: what to do per release

Every time you ship a new version (e.g. v1.5.5):

1. Bump the version in:
   - `public/manifest.json` (Chrome)
   - `public/manifest.firefox.json` (Firefox)
   - `package.json`
   - `docs/index.html`, `docs/privacy.html` version refs
2. `npm run build:all`
3. Zip `dist/` → upload to Chrome Web Store + Edge Add-ons
4. Zip `dist-firefox/` → upload to AMO

The two zips share the same JS/CSS/HTML — only the manifest differs.
