import { useState } from "react";

interface Props {
  onSave: (token: string) => void;
}

/**
 * First-run state when the Query Inspector is opened without a stored token.
 * Mirrors the inline panel's TokenSetup but in a SaaS-style card.
 */
export function TokenSetupCard({ onSave }: Props) {
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);

  const submit = () => {
    const trimmed = value.replace(/\s+/g, "").trim();
    if (!trimmed) return;
    onSave(trimmed);
  };

  return (
    <div className="qi-setup-card">
      <span className="qi-cat-tag" style={{ alignSelf: "center" }}>
        First-run setup
      </span>
      <h1>Connect to monday.com</h1>
      <p>
        Paste a <strong>monday.com API v2 token</strong> below to start running
        queries. The token is stored locally in your browser via{" "}
        <code>chrome.storage.local</code> and never leaves your device.
      </p>
      <input
        className="qi-input"
        type={show ? "text" : "password"}
        placeholder="eyJhbGciOiJIUzI1NiJ9..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        autoFocus
      />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: -4 }}>
        <button
          className="qi-btn qi-btn-sm qi-btn-ghost"
          onClick={() => setShow((s) => !s)}
        >
          {show ? "Hide" : "Show"} token
        </button>
        <a
          className="qi-btn qi-btn-sm qi-btn-ghost"
          href="https://developer.monday.com/api-reference/docs/authentication"
          target="_blank"
          rel="noopener noreferrer"
        >
          Where do I find my token? ↗
        </a>
      </div>
      <button className="qi-btn qi-btn-primary" onClick={submit} disabled={!value.trim()}>
        Save & continue
      </button>
    </div>
  );
}
