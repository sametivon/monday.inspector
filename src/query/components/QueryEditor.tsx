import { useState } from "react";

interface StatusLabel {
  kind: "ok" | "warn" | "err" | "info";
  text: string;
}

interface Props {
  query: string;
  onQueryChange: (q: string) => void;
  variables: string;
  onVariablesChange: (v: string) => void;
  running: boolean;
  onRun: () => void;
  onSave: (name: string) => Promise<void> | void;
  currentName?: string;
  statusLabel?: StatusLabel | null;
  complexityLabel?: string | null;
}

/**
 * Centre pane: the actual query + variables editor.
 * Variables JSON is kept as a string so the user can type / paste freely;
 * the parent component validates + parses it on Run.
 */
export function QueryEditor({
  query,
  onQueryChange,
  variables,
  onVariablesChange,
  running,
  onRun,
  onSave,
  currentName,
  statusLabel,
  complexityLabel,
}: Props) {
  const [savePromptOpen, setSavePromptOpen] = useState(false);
  const [pendingName, setPendingName] = useState("");

  const startSave = () => {
    setPendingName(currentName ?? "Untitled query");
    setSavePromptOpen(true);
  };
  const confirmSave = async () => {
    const name = pendingName.trim();
    if (!name) return;
    await onSave(name);
    setSavePromptOpen(false);
  };

  return (
    <div className="qi-editor-wrap">
      {/* Toolbar */}
      <div className="qi-editor-toolbar">
        <button
          className="qi-btn qi-btn-primary"
          onClick={onRun}
          disabled={running}
        >
          {running ? "Running…" : "▶ Run query"}
        </button>
        <button className="qi-btn qi-btn-sm" onClick={startSave}>
          💾 Save
        </button>
        <button
          className="qi-btn qi-btn-sm qi-btn-ghost"
          onClick={() => navigator.clipboard.writeText(query)}
          title="Copy query to clipboard"
        >
          Copy
        </button>
        <div className="qi-toolbar-spacer" />
        {statusLabel && (
          <span className={`qi-status-pill ${statusLabel.kind}`}>
            {statusLabel.text}
          </span>
        )}
        {complexityLabel && (
          <span className="qi-meta-pill" title="Cost of last query">
            {complexityLabel}
          </span>
        )}
      </div>

      {savePromptOpen && (
        <div
          style={{
            display: "flex",
            gap: 8,
            background: "hsl(var(--qi-primary-soft))",
            padding: "10px 12px",
            borderRadius: "var(--qi-radius-sm)",
          }}
        >
          <input
            className="qi-input"
            value={pendingName}
            onChange={(e) => setPendingName(e.target.value)}
            placeholder="Name this query"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") void confirmSave();
              if (e.key === "Escape") setSavePromptOpen(false);
            }}
          />
          <button className="qi-btn qi-btn-primary qi-btn-sm" onClick={confirmSave}>
            Save
          </button>
          <button
            className="qi-btn qi-btn-sm qi-btn-ghost"
            onClick={() => setSavePromptOpen(false)}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Query textarea */}
      <textarea
        className="qi-textarea"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        spellCheck={false}
        style={{ minHeight: 280 }}
      />

      {/* Variables */}
      <div className="qi-vars-block">
        <details open={variables !== "{}" && variables.trim() !== ""}>
          <summary>Variables (JSON)</summary>
          <textarea
            value={variables}
            onChange={(e) => onVariablesChange(e.target.value)}
            spellCheck={false}
            placeholder={`{\n  "boardId": "1234567890"\n}`}
          />
        </details>
      </div>

      {/* Hint */}
      <div className="qi-status-row">
        <span>
          Tip: variables are typed at the top of the query (e.g.{" "}
          <code>$boardId: ID!</code>) and passed in as JSON below.
        </span>
      </div>
    </div>
  );
}
