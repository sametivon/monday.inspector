# Monday.com Inspector

Productivity tool for Monday.com users, administrators, and developers to bulk import parent items and subitems directly from CSV or Excel files — right from the Monday.com UI.

**IMPORTANT:** If you have any questions or facing bugs, please use the GitHub repository: https://github.com/sametivon/monday.inspector/issues

---

## Install

### Chrome Web Store

[Install from Chrome Web Store](https://chromewebstore.google.com/detail/kmmmfnkjdcmemcmjipidodnipidadaeg)

### Manual Install (from source)

1. Clone this repository:
   ```bash
   git clone https://github.com/sametivon/monday.inspector.git
   cd monday-inspector
   ```
2. Install dependencies and build:
   ```bash
   npm install
   npm run build
   ```
3. Open `chrome://extensions` in Google Chrome
4. Enable **Developer mode** (toggle in the top-right corner)
5. Click **Load unpacked** and select the `dist` folder
6. Navigate to any Monday.com board page — you're ready to go

---

## Features

Monday.com Inspector contains lots of powerful features:

- **Bulk import parent items and subitems** from CSV, TSV, or Excel files
- **Auto-detect Monday.com board export format** (.xlsx) — hierarchical structure is preserved automatically
- **Smart column mapping** — map file columns to Monday.com board/subitem columns with an intuitive interface
- **Two-phase import** — creates parent items first, then subitems under them, all in one flow
- **Batch processing with rate-limit awareness** — imports in batches of 5 with automatic delays to respect Monday.com API limits
- **Automatic retry with exponential backoff** — failed API calls are retried up to 3 times
- **Real-time progress tracking** — watch your import live with success/failure counts and percentage
- **Detailed error reporting** — every failed row is reported with the exact error message
- **Parent matching by item name or ID** — flexible parent resolution for flat CSV files
- **Group-aware import** — preserves Monday.com board groups when importing from board exports
- **One-click access from Monday.com** — an "Import Subitems" button is injected directly into the board toolbar
- **Token verification** — verify your API token works before importing
- **Privacy-first** — your API token stays in your browser, no data is sent to third-party servers
- **Supports flat CSV and Monday.com export formats** — two different workflows for different use cases
- **Include or exclude parent items** — choose whether to create new parents or only import subitems under existing ones
- **Open source** — no account required, no limits

And more to come!

---

## How It Works

1. **Install & Connect** — Install the extension, add your Monday.com API token (Profile → Developers → API token), and verify the connection.

2. **Open & Upload** — Navigate to your Monday.com board, click "Import Subitems" in the toolbar (or open the panel from the popup), and upload a CSV or Excel file. The tool auto-detects whether it's a flat file or a Monday.com board export.

3. **Map Columns** — Preview your data and map file columns to Monday.com subitem (and parent) columns. Set parent item matching method.

4. **Import** — Hit "Start Import" and watch the real-time progress. Failed rows are reported with detailed error messages so you can fix and retry.

---

## Screenshots

> Screenshots will be added soon.

---

## Tech Stack

- **React 18** + **TypeScript 5.5**
- **Vite 5.4** for builds
- **Chrome Manifest V3**
- **PapaParse** (CSV/TSV parsing) + **xlsx** (Excel parsing)
- **Monday.com GraphQL API** (v2024-10)

---

## Project Structure

```
src/
├── background/       # Service worker (panel opener)
├── content/          # Content script (injects button into Monday.com)
├── panel/            # Main import UI (4-step wizard)
├── popup/            # Extension popup (token settings + panel launcher)
├── components/       # Reusable React components
│   ├── FileUploader      # Drag & drop file upload
│   ├── DataPreview       # Table/tree preview of parsed data
│   ├── ColumnMapper      # Column mapping interface
│   ├── ImportProgress    # Real-time import progress
│   └── ...
├── services/
│   ├── fileParser.ts     # CSV/XLSX parsing + Monday export detection
│   └── mondayApi.ts      # GraphQL API calls, batch import, retry logic
└── utils/
    ├── constants.ts      # API URL, batch size, retry config
    ├── storage.ts        # Chrome storage helpers
    └── types.ts          # TypeScript type definitions
```

---

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m "Add my feature"`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a Pull Request

For bug reports and feature requests, please use [GitHub Issues](https://github.com/sametivon/monday.inspector/issues).

---

## Built by Sam @ Fruition Services

Built by [Sam](https://www.linkedin.com/in/sametivon/) @ [Fruition Services](https://www.fruitionservices.io) — Platinum monday.com consulting partner with 500+ implementations across Australia, US, and UK. Need help with monday.com implementation, CRM setup, workflow automation, or team training? [Book a consultation](https://calendly.com/sam-fruitionservices/30min).

If you find this tool useful, consider supporting the development:

<a href="https://buymeacoffee.com/sametivon" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="40"></a>

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
