import React, { useEffect, useState } from "react";
import { Button } from "../components/ui/button";
import { BRAND } from "../utils/brandConfig";
import { TokenCard } from "../components/TokenCard";
import { Coffee, Globe, Layout, ArrowRight, Code2, Download } from "lucide-react";

type PageStatus =
  | { type: "loading" }
  | { type: "monday_board"; boardId: string | null; isOpen: boolean }
  | { type: "monday_other" }
  | { type: "not_monday" };

export const Popup: React.FC = () => {
  const [status, setStatus] = useState<PageStatus>({ type: "loading" });
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    detectPage();
  }, []);

  const detectPage = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url) {
        setStatus({ type: "not_monday" });
        return;
      }

      const url = new URL(tab.url);
      const isMonday = url.hostname.endsWith("monday.com");

      if (!isMonday) {
        setStatus({ type: "not_monday" });
        return;
      }

      // On monday.com — try to get status from content script
      if (tab.id) {
        try {
          const response = await chrome.tabs.sendMessage(tab.id, { type: "GET_STATUS" });
          if (response?.isBoardPage) {
            setStatus({ type: "monday_board", boardId: response.boardId, isOpen: response.isOpen });
          } else {
            setStatus({ type: "monday_other" });
          }
        } catch {
          // Content script not ready or not injected
          const boardMatch = url.pathname.match(/\/boards\/(\d+)/);
          if (boardMatch) {
            setStatus({ type: "monday_board", boardId: boardMatch[1], isOpen: false });
          } else {
            setStatus({ type: "monday_other" });
          }
        }
      } else {
        setStatus({ type: "monday_other" });
      }
    } catch {
      setStatus({ type: "not_monday" });
    }
  };

  const handleTogglePanel = async () => {
    setToggling(true);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        const response = await chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_PANEL" });
        if (response?.ok) {
          setStatus((prev) =>
            prev.type === "monday_board"
              ? { ...prev, isOpen: response.isOpen }
              : prev,
          );
          // Close popup after toggling
          window.close();
        }
      }
    } catch {
      // Fallback: content script not available
    } finally {
      setToggling(false);
    }
  };

  const openMonday = () => {
    chrome.tabs.create({ url: "https://monday.com" });
    window.close();
  };

  const openQueryInspector = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("src/query/index.html") });
    window.close();
  };

  const openImporter = () => {
    const boardId =
      status.type === "monday_board" && status.boardId
        ? `?boardId=${status.boardId}`
        : "";
    chrome.tabs.create({
      url: chrome.runtime.getURL("src/import/index.html") + boardId,
    });
    window.close();
  };

  return (
    <div className="p-4 w-[340px]">
      {/* Header */}
      <div className="mb-3 text-center">
        <h2 className="text-base font-bold tracking-tight text-foreground">
          Monday.com Inspector
        </h2>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          Inspect, query, edit & manage your boards
        </p>
      </div>

      {/* Status-aware main section */}
      {status.type === "loading" ? (
        <div className="flex items-center justify-center py-6">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : status.type === "monday_board" ? (
        <div className="rounded-lg border border-border bg-card p-3 mb-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-medium text-emerald-700">
              Board detected
            </span>
            {status.boardId && (
              <span className="text-[10px] text-muted-foreground ml-auto">
                ID: {status.boardId}
              </span>
            )}
          </div>
          <Button
            className="w-full"
            onClick={handleTogglePanel}
            disabled={toggling}
          >
            {toggling ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : status.isOpen ? (
              <>Close Inspector Panel</>
            ) : (
              <>
                <Layout className="w-4 h-4" />
                Open Inspector Panel
              </>
            )}
          </Button>
          <p className="text-[10px] text-muted-foreground mt-2 text-center">
            Opens the inline inspector on this board
          </p>
        </div>
      ) : status.type === "monday_other" ? (
        <div className="rounded-lg border border-border bg-card p-3 mb-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-xs font-medium text-amber-700">
              On monday.com
            </span>
          </div>
          <p className="text-xs text-muted-foreground mb-2">
            Navigate to a board to use the Inspector. Open any board and click the extension icon again.
          </p>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-muted rounded-md p-2">
            <ArrowRight className="w-3 h-3 shrink-0" />
            <span>Look for boards in your workspace sidebar</span>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card p-3 mb-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-slate-400" />
            <span className="text-xs font-medium text-muted-foreground">
              Not on monday.com
            </span>
          </div>
          <p className="text-xs text-muted-foreground mb-2">
            This extension works on monday.com board pages. Open your monday.com workspace to get started.
          </p>
          <Button className="w-full" onClick={openMonday}>
            <Globe className="w-4 h-4" />
            Open monday.com
          </Button>
        </div>
      )}

      {/* Importer launcher — full-page CSV/XLSX import with multi-level support */}
      <button
        onClick={openImporter}
        className="w-full mb-2 rounded-lg border border-border bg-card hover:bg-accent hover:border-primary/40 transition-all p-3 text-left group"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
            <Download className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-foreground flex items-center gap-1">
              Importer
              <span className="text-[9px] font-medium px-1.5 py-px rounded-full bg-emerald-100 text-emerald-700">
                MULTI-LEVEL
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
              CSV / Excel into classic or multi-level boards · auto-detected
            </p>
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform shrink-0" />
        </div>
      </button>

      {/* Query Inspector launcher — full-page tool for power users */}
      <button
        onClick={openQueryInspector}
        className="w-full mb-3 rounded-lg border border-border bg-card hover:bg-accent hover:border-primary/40 transition-all p-3 text-left group"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
            <Code2 className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-foreground flex items-center gap-1">
              Query Inspector
              <span className="text-[9px] font-medium px-1.5 py-px rounded-full bg-primary/15 text-primary">
                GraphQL
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
              Full-page GraphQL editor with templates &amp; saved queries
            </p>
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform shrink-0" />
        </div>
      </button>

      {/* Token card */}
      <TokenCard />

      {/* Footer */}
      <div className="mt-3 pt-3 border-t border-border text-center">
        <div className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
          <span>
            by{" "}
            <a
              href={BRAND.authorUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline font-medium"
            >
              {BRAND.author}
            </a>
          </span>
          <span className="opacity-40">&middot;</span>
          <a
            href={BRAND.consultationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Book a Consultation
          </a>
        </div>
        <Button
          asChild
          variant="outline"
          size="sm"
          className="mt-2 w-full bg-[#ffdd00] border-[#ffdd00] text-[#1a1a2e] hover:bg-[#ffe94a] hover:border-[#ffe94a] hover:text-[#1a1a2e] font-semibold text-xs"
        >
          <a
            href={BRAND.buyMeACoffeeUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Coffee className="w-3.5 h-3.5" />
            Buy me a coffee
          </a>
        </Button>
      </div>
    </div>
  );
};
