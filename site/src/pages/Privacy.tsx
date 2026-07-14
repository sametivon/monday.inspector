import { Head } from "vite-react-ssg";
import ArticleShell from "@/components/ArticleShell";

export default function Privacy() {
  return (
    <>
      <Head>
        <title>Privacy Policy — Monday.com Inspector</title>
        <meta name="description" content="Monday.com Inspector runs entirely in your browser. Your API token, board data and files never leave your device or pass through any server we control." />
        <link rel="canonical" href="https://mondayinspector.eu/privacy.html" />
      </Head>
      <ArticleShell badge="Privacy" title="Privacy Policy" meta={["Last updated: July 12, 2026", "Version 1.6.4"]}>
        <div className="mb-8 rounded-2xl border border-hairline bg-softmint/50 p-6">
          <p className="font-display font-bold text-ink">TL;DR — we collect nothing.</p>
          <p className="mt-1 text-[14.5px] leading-relaxed text-muted">
            Monday.com Inspector runs entirely inside your browser. Your API token, your board
            data and your files never leave your device or pass through any server we control.
          </p>
        </div>

        <div className="prose-calm">
          <h2>What we collect</h2>
          <p>
            Nothing. The extension has no analytics, no tracking and no backend of ours. It talks
            directly to monday.com's API from your browser using the token you provide.
          </p>
          <h2>Your monday.com API token</h2>
          <p>
            Your token is stored locally in your browser's extension storage so you don't have to
            paste it every time. It is sent only to monday.com's official API endpoint and never
            to us.
          </p>
          <h2>Your files &amp; board data</h2>
          <p>
            CSV/Excel files you import are parsed in-browser. Board data you read or export stays
            on your device. We never see, store or transmit any of it.
          </p>
          <h2>Permissions</h2>
          <p>
            The extension requests only the permissions it needs to run inside monday.com and call
            the API on your behalf. It is open source — you can review exactly what it does.
          </p>
          <h2>Contact</h2>
          <p>
            Questions? Email <a href="mailto:hello@shift-tab.eu">hello@shift-tab.eu</a>.
          </p>
        </div>
      </ArticleShell>
    </>
  );
}
