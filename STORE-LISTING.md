# Chrome Web Store listing — Monday.com Inspector

Ready-to-paste content for the Chrome Web Store Developer Dashboard.
Keep this in sync with each release. Current version: **v1.6.4**.

Dashboard: https://chrome.google.com/webstore/devconsole
Listing: https://chromewebstore.google.com/detail/kmmmfnkjdcmemcmjipidodnipidadaeg

---

## Store listing tab

### Product name
```
Monday.com Inspector
```

### Summary (max 132 chars — this is the manifest `description`)
```
Inspect, query, edit & bulk-manage monday.com boards: GraphQL editor, schema viewer, CSV import, bulk update, Excel image upload.
```

### Category
**Workflow & Planning** (fallback: **Developer Tools**)

### Language
English

### Detailed description (paste into the big description field)
```
Monday.com Inspector is the free power-user toolkit for monday.com. It adds the features monday.com never shipped — bulk import, image upload, a GraphQL workspace, a schema viewer, and bulk editing — right next to your boards. No account, no row limits, and your API token never leaves your browser.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT YOU CAN DO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📥 IMPORT FROM CSV & EXCEL
• Import items AND subitems from a single CSV or Excel file — something monday's native import can't do.
• Re-import a monday.com board export (.xlsx) and keep the full hierarchy: groups, parents, subitems, and all column values.
• Map your sheet columns to any of 18+ writable column types — status, people, date, timeline, dropdown, numbers, link, email, phone, rating, country, and more.
• No row limit. Automatic batching and rate-limit handling for thousands of rows.

🖼️ BULK IMAGE UPLOAD FROM EXCEL  (the feature monday.com never built)
• Drop an .xlsx with images pasted into cells — every image is extracted, anchored to its row, and uploaded to a File column.
• Two modes: attach images to existing items (match by name or id), OR create brand-new items from each row with the image attached.
• Works directly on monday.com's "Export to Excel" output and on hand-built spreadsheets.

🛟 SMART ERROR RECOVERY
• If an import has errors, a recovery banner names the column(s) most likely causing them and offers a one-click "Skip these columns & re-run".
• Per-row error messages show monday.com's exact response. "Copy all errors" puts the full list on your clipboard.
• A single bad column never blocks the rest of your data.

⚡ BULK UPDATE
• Update hundreds of items across multiple columns in one pass — from a CSV of item IDs and new values. Works on parents and subitems.

🔍 GRAPHQL QUERY INSPECTOR
• A full-page GraphQL workspace inspired by Salesforce Inspector. 14 ready-made query templates, a saved-query library, table + JSON results, a complexity-budget meter, and CSV/JSON export. No coding required.

🗂 SCHEMA INSPECTOR
• Explore every column — type, id, settings — for parents and subitems. Auto-detects classic vs multi-level boards (monday API 2026-04). One-click copy of column IDs.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRIVACY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Your monday.com API token is stored locally in your browser (chrome.storage) and is sent only to api.monday.com over HTTPS.
• No analytics, no telemetry, no third-party servers, no data collection.
• Open source: https://github.com/sametivon/monday.inspector

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHO IT'S FOR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
monday.com admins, consultants, agencies, and developers who need to move faster than the native UI allows — board migrations, bulk data loads, image catalogues, and API exploration.

Built by Fruition Services. Free & open source.
Website: https://mondayinspector.eu
```

---

## What's new (version notes for v1.6.4)
```
v1.6.4 — Correct import dates + errors you can actually see
• Dates now import on the right day: ambiguous dates like 03/04 default to UK day/month (3 April) — matching monday's D/M/YYYY export format — and Excel date serials convert directly to ISO, so 3 Nov no longer flips to 11 Mar.
• Import failures are always visible: failing rows show live during the run and stay on screen after, in a scrollable list with a copy-all button. Rows where monday returns no message now say so.
• The Importer auto-creates missing groups on the target board (in source order), so items land in the right group instead of the default one.
• Handles monday's 2026 export format: the marketing cells monday now embeds in board/group rows no longer confuse the parser.
• Builds on v1.6.3 (native-column-only imports) and v1.6.2 (smart import error recovery).
```

---

## Privacy practices tab

### Single purpose (required)
```
Monday.com Inspector adds power-user tooling to monday.com boards: bulk CSV/Excel import (items, subitems, and images into File columns), bulk update, a GraphQL query workspace, and a schema viewer. Everything operates on the user's own monday.com data via the official monday.com API using a token the user provides.
```

### Permission justifications

**storage**
```
Stores the user's monday.com API token and their saved GraphQL queries locally on their device so they don't have to re-enter the token on every use. Nothing in storage is transmitted anywhere except, for the token, to api.monday.com to authenticate the user's own requests.
```

**activeTab**
```
Used to detect when the user is on a monday.com board and to inject the inspector panel into the current tab when the user clicks the extension. No browsing data is read from any other tab.
```

**host permission — https://*.monday.com/***
```
The extension runs only on monday.com pages: it reads the current board context (board id from the URL) and renders its inspector UI there. All API calls go to api.monday.com over HTTPS using the user's own token.
```

### Data usage disclosures (check these on the form)
- ❌ Does NOT collect or use: personally identifiable info, health, financial, authentication, personal communications, location, web history, user activity, website content — for ANY purpose beyond the single purpose above.
- ✅ Affirm all three certification checkboxes:
  - I do not sell or transfer user data to third parties (outside approved use cases)
  - I do not use or transfer user data for purposes unrelated to my item's single purpose
  - I do not use or transfer user data to determine creditworthiness or for lending

> Note: the API token is "authentication information," but it is stored locally and only sent to monday.com (the service the user is authenticating to). It is not collected by the developer. If the form asks, declare that the extension handles authentication information and that it is used only for the app's single purpose, stored locally, and not sold/transferred.

### Privacy policy URL
```
https://mondayinspector.eu/privacy.html
```

---

## Graphic assets checklist (upload in Store listing tab)

| Asset | Size | Required | Source |
|---|---|---|---|
| Store icon | 128×128 PNG | ✅ | `dist/icons/icon128.png` |
| Screenshot(s) | 1280×800 or 640×400 PNG/JPG | ✅ (1–5) | capture the Importer, Image Importer, Query Inspector, Schema viewer |
| Small promo tile | 440×280 PNG | optional but recommended | reuse `docs/og-image.png` cropped, or brand purple (#7c5cfc) |
| Marquee promo tile | 1400×560 PNG | optional | brand banner |

**Suggested 5 screenshots (1280×800):**
1. The Importer step 3 — column mapping for a monday export
2. The smart error-recovery banner ("Skip these columns & re-run")
3. The Image Importer — mode picker + create mode column mapping
4. The Query Inspector — a template running with table results
5. The Schema viewer — columns with types + copy id

---

## Graphic assets (ready to upload — `store-assets/out/`)
| Asset | File | Size |
|---|---|---|
| Store icon | `store-icon-128.png` | 128×128 |
| Screenshot 1 — overview | `screenshot-1-overview-1280x800.png` | 1280×800 |
| Screenshot 2 — import subitems | `screenshot-2-import-1280x800.png` | 1280×800 |
| Screenshot 3 — GraphQL | `screenshot-3-graphql-1280x800.png` | 1280×800 |
| Screenshot 4 — schema + bulk | `screenshot-4-schema-1280x800.png` | 1280×800 |
| Screenshot 5 — Excel images | `screenshot-5-images-1280x800.png` | 1280×800 |
| Small promo tile | `promo-small-440x280.png` | 440×280 |
| Marquee promo tile | `promo-marquee-1400x560.png` | 1400×560 |

All 24-bit RGB (no alpha). Sources are HTML art-boards in `store-assets/src/` —
edit and re-render with `bash store-assets/build.sh`.

## Pre-submit checklist
- [ ] Upload `monday-inspector-v1.6.4.zip` (manifest at root, description ≤132 chars)
- [ ] Paste Summary + Detailed description
- [ ] Set category = Workflow & Planning
- [ ] Add 1–5 screenshots (1280×800)
- [ ] Fill Single purpose + 3 permission justifications
- [ ] Privacy policy URL = https://mondayinspector.eu/privacy.html
- [ ] Tick the 3 data-use certification boxes
- [ ] Submit for review
```
