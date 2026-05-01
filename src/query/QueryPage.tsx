import { useCallback, useEffect, useMemo, useState } from "react";
import { executeRawQuery, type RawQueryResult } from "../services/mondayApi";
import { TemplateGallery } from "./components/TemplateGallery";
import { QueryEditor } from "./components/QueryEditor";
import { ResultsPane } from "./components/ResultsPane";
import { SavedQueriesList } from "./components/SavedQueriesList";
import { TokenSetupCard } from "./components/TokenSetupCard";
import {
  loadSavedQueries,
  upsertSavedQuery,
  deleteSavedQuery,
  type SavedQuery,
} from "./savedQueriesStorage";
import { TEMPLATES } from "./templates";

// The full Query Inspector shell.
//
// State machine:
//   1. No token → show TokenSetupCard, save token to chrome.storage.
//   2. Token present → show 3-pane layout (templates · editor · results).
//
// We deliberately keep editor state in this component (not in a sub-component)
// so loading a template / saved query / re-running still uses one source of
// truth. Sub-components are presentational.

type LeftPaneTab = "templates" | "saved";

export function QueryPage() {
  const [token, setToken] = useState<string>("");
  const [tokenLoaded, setTokenLoaded] = useState(false);

  const [query, setQuery] = useState<string>(TEMPLATES[0]?.query ?? "");
  const [variables, setVariables] = useState<string>("{}");
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(
    TEMPLATES[0]?.id ?? null,
  );

  const [leftPaneTab, setLeftPaneTab] = useState<LeftPaneTab>("templates");
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [activeSavedId, setActiveSavedId] = useState<string | null>(null);

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RawQueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRunMs, setLastRunMs] = useState<number | null>(null);

  // ── Token bootstrap ─────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const finish = (t: string) => {
      if (cancelled) return;
      setToken(t);
      setTokenLoaded(true);
    };
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.local.get("monday_api_token", (r) => {
        finish((r.monday_api_token as string) ?? "");
      });
    } else {
      finish(localStorage.getItem("monday_api_token") ?? "");
    }
    return () => {
      cancelled = true;
    };
  }, []);

  // Load query/board from URL params after first render (e.g. when opened from
  // the inline panel's "Open in new tab" button).
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const initialQuery = params.get("query");
      const initialVars = params.get("variables");
      if (initialQuery) {
        setQuery(initialQuery);
        setActiveTemplateId(null);
      }
      if (initialVars) setVariables(initialVars);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void loadSavedQueries().then(setSavedQueries);
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────────
  const handleSelectTemplate = useCallback(
    (id: string) => {
      const t = TEMPLATES.find((x) => x.id === id);
      if (!t) return;
      setActiveTemplateId(id);
      setActiveSavedId(null);
      setQuery(t.query);
      setVariables(t.variables ? JSON.stringify(t.variables, null, 2) : "{}");
    },
    [],
  );

  const handleSelectSaved = useCallback(
    (id: string) => {
      const q = savedQueries.find((s) => s.id === id);
      if (!q) return;
      setActiveSavedId(id);
      setActiveTemplateId(null);
      setQuery(q.query);
      setVariables(q.variables ?? "{}");
    },
    [savedQueries],
  );

  const handleRun = useCallback(async () => {
    if (!query.trim() || !token) return;
    setRunning(true);
    setError(null);
    setResult(null);

    let parsedVars: Record<string, unknown> | undefined;
    if (variables.trim()) {
      try {
        const v = JSON.parse(variables);
        if (v && typeof v === "object" && !Array.isArray(v)) {
          parsedVars = v as Record<string, unknown>;
        }
      } catch (err) {
        setError(`Variables JSON is invalid: ${(err as Error).message}`);
        setRunning(false);
        return;
      }
    }

    const start = performance.now();
    try {
      const r = await executeRawQuery(token, query, parsedVars);
      setResult(r);
      if (r.errors?.length) {
        setError(r.errors.map((e) => e.message).join("\n"));
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLastRunMs(Math.round(performance.now() - start));
      setRunning(false);
    }
  }, [query, variables, token]);

  // Cmd/Ctrl + Enter to run
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void handleRun();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleRun]);

  const handleSave = useCallback(
    async (name: string) => {
      const saved = await upsertSavedQuery({
        id: activeSavedId ?? undefined,
        name,
        query,
        variables,
      });
      const fresh = await loadSavedQueries();
      setSavedQueries(fresh);
      setActiveSavedId(saved.id);
      setActiveTemplateId(null);
      setLeftPaneTab("saved");
    },
    [activeSavedId, query, variables],
  );

  const handleDeleteSaved = useCallback(async (id: string) => {
    await deleteSavedQuery(id);
    const fresh = await loadSavedQueries();
    setSavedQueries(fresh);
    setActiveSavedId((curr) => (curr === id ? null : curr));
  }, []);

  const handleTokenSaved = useCallback((t: string) => {
    setToken(t);
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.local.set({ monday_api_token: t });
    } else {
      localStorage.setItem("monday_api_token", t);
    }
  }, []);

  const complexityLabel = useMemo(() => {
    const c = result?.complexity;
    if (!c) return null;
    return `${c.query.toLocaleString()} pts · ${c.after.toLocaleString()} budget left`;
  }, [result]);

  // ── Render ───────────────────────────────────────────────────────────
  if (!tokenLoaded) {
    return (
      <div className="qi-shell">
        <Topbar />
        <div className="qi-setup">
          <div className="qi-setup-card">
            <p>Loading…</p>
          </div>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="qi-shell">
        <Topbar />
        <div className="qi-setup">
          <TokenSetupCard onSave={handleTokenSaved} />
        </div>
      </div>
    );
  }

  return (
    <div className="qi-shell">
      <Topbar />

      <div className="qi-main">
        {/* Left pane — templates / saved */}
        <aside className="qi-pane">
          <header className="qi-pane-header" style={{ gap: 4 }}>
            <button
              className={`qi-result-tab ${leftPaneTab === "templates" ? "active" : ""}`}
              onClick={() => setLeftPaneTab("templates")}
            >
              Templates
            </button>
            <button
              className={`qi-result-tab ${leftPaneTab === "saved" ? "active" : ""}`}
              onClick={() => setLeftPaneTab("saved")}
            >
              Saved {savedQueries.length > 0 && `(${savedQueries.length})`}
            </button>
          </header>
          <div className="qi-pane-body">
            {leftPaneTab === "templates" ? (
              <TemplateGallery
                activeId={activeTemplateId}
                onSelect={handleSelectTemplate}
              />
            ) : (
              <SavedQueriesList
                items={savedQueries}
                activeId={activeSavedId}
                onSelect={handleSelectSaved}
                onDelete={handleDeleteSaved}
              />
            )}
          </div>
        </aside>

        {/* Centre pane — editor */}
        <section className="qi-pane">
          <header className="qi-pane-header">
            <span className="qi-pane-title">Query Editor</span>
            <span className="qi-meta-pill" title="Press to run">
              ⌘ / Ctrl + Enter
            </span>
          </header>
          <QueryEditor
            query={query}
            onQueryChange={setQuery}
            variables={variables}
            onVariablesChange={setVariables}
            running={running}
            onRun={handleRun}
            onSave={handleSave}
            currentName={
              activeSavedId
                ? savedQueries.find((s) => s.id === activeSavedId)?.name
                : activeTemplateId
                  ? TEMPLATES.find((t) => t.id === activeTemplateId)?.title
                  : undefined
            }
            statusLabel={
              error
                ? { kind: "err", text: "Error" }
                : running
                  ? { kind: "info", text: "Running…" }
                  : lastRunMs != null
                    ? {
                        kind: "ok",
                        text: `${lastRunMs} ms`,
                      }
                    : null
            }
            complexityLabel={complexityLabel}
          />
        </section>

        {/* Right pane — results */}
        <section className="qi-pane">
          <header className="qi-pane-header">
            <span className="qi-pane-title">Results</span>
          </header>
          <ResultsPane
            running={running}
            error={error}
            result={result}
            currentQuery={query}
          />
        </section>
      </div>
    </div>
  );
}

function Topbar() {
  return (
    <header className="qi-topbar">
      <a className="qi-brand" href="https://mondayinspector.eu" target="_blank" rel="noopener noreferrer">
        <span className="qi-brand-mark">M</span>
        <span>monday.inspector</span>
      </a>
      <div className="qi-brand-divider" />
      <span className="qi-page-title">Query Inspector</span>
      <div className="qi-topbar-spacer" />
      <div className="qi-topbar-meta">
        <a
          className="qi-btn qi-btn-sm qi-btn-ghost"
          href="https://developer.monday.com/api-reference/docs/introduction-to-graphql"
          target="_blank"
          rel="noopener noreferrer"
        >
          monday API docs ↗
        </a>
      </div>
    </header>
  );
}
