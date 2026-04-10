import { useState, useEffect, useCallback } from "react";
import { InspectorShell } from "./components/InspectorShell";
import { SchemaTab } from "./components/SchemaTab";
import { HierarchyTab } from "./components/HierarchyTab";
import { DetailTab } from "./components/DetailTab";
import { LogsTab } from "./components/LogsTab";
import { ImportTab } from "./components/ImportTab";
import { ActionsTab } from "./components/ActionsTab";
import { ExportMenu } from "./components/ExportMenu";
import { ComplexityBadge } from "./components/ComplexityBadge";
import { QueryTab } from "./components/QueryTab";
import { TokenSetup } from "./components/TokenSetup";
import { useBoard } from "./hooks/useBoard";
import { useInspectorStore } from "./hooks/useInspectorStore";
import type { MondayItem } from "../utils/types";

export type InspectorTab = "schema" | "hierarchy" | "detail" | "query" | "import" | "actions" | "logs";

interface InspectorProps {
  boardId: string | null;
  onClose: () => void;
  hidden?: boolean;
}

export function Inspector({ boardId, onClose, hidden }: InspectorProps) {
  const [activeTab, setActiveTab] = useState<InspectorTab>("schema");
  const [token, setToken] = useState<string>("");
  const [selectedItem, setSelectedItem] = useState<MondayItem | null>(null);
  const { state, dispatch } = useInspectorStore();

  // Load token from storage
  useEffect(() => {
    const loadToken = () => {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        chrome.storage.local.get("monday_api_token", (result) => {
          const t = result.monday_api_token as string;
          if (t) setToken(t);
        });
      }
    };
    loadToken();
    if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
      const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
        if (changes.monday_api_token?.newValue) {
          setToken(changes.monday_api_token.newValue);
        }
      };
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    }
  }, []);

  const board = useBoard(token, boardId);

  // Tabs that need items: load them lazily on first visit
  const ITEM_TABS = new Set(["hierarchy", "detail", "actions"]);
  const handleTabChange = useCallback((tab: typeof activeTab) => {
    setActiveTab(tab);
    if (ITEM_TABS.has(tab)) board.loadItems();
  }, [board]);

  const handleSelectItem = useCallback((item: MondayItem) => {
    setSelectedItem(item);
    board.loadItems();
    setActiveTab("detail");
  }, [board]);

  const handleRefresh = useCallback(() => {
    board.refresh();
  }, [board]);

  const handleTokenSave = useCallback((newToken: string) => {
    setToken(newToken);
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.local.set({ monday_api_token: newToken });
    }
  }, []);

  if (hidden) return null;

  if (!token) {
    return (
      <InspectorShell
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onClose={onClose}
        boardId={boardId}
        connected={false}
        loading={false}
        onRefresh={handleRefresh}
      >
        <TokenSetup onSave={handleTokenSave} />
      </InspectorShell>
    );
  }

  return (
    <InspectorShell
      activeTab={activeTab}
      onTabChange={handleTabChange}
      onClose={onClose}
      boardId={boardId}
      connected={!!token && !board.error}
      loading={board.loading || board.itemsLoading}
      onRefresh={handleRefresh}
      headerActions={
        <ComplexityBadge />
      }
      exportMenu={
        <ExportMenu
          items={board.items}
          columns={board.columns}
          subitemColumns={board.subitemColumns}
          boardName={board.boardName}
          selectedItemIds={state.selectedItemIds}
        />
      }
    >
      {activeTab === "schema" && (
        <SchemaTab
          columns={board.columns}
          groups={board.groups}
          subitemColumns={board.subitemColumns}
          subitemBoardId={board.subitemBoardId}
          loading={board.loading}
        />
      )}
      {activeTab === "hierarchy" && (
        <HierarchyTab
          token={token}
          groups={board.groups}
          items={board.items}
          loading={board.itemsLoading}
          selectedItemId={selectedItem?.id ?? null}
          selectedItemIds={state.selectedItemIds}
          dispatch={dispatch}
          onSelectItem={handleSelectItem}
        />
      )}
      {activeTab === "detail" && (
        <DetailTab
          token={token}
          boardId={boardId}
          item={selectedItem}
          columns={board.columns}
          subitemColumns={board.subitemColumns}
        />
      )}
      {activeTab === "query" && <QueryTab token={token} boardId={boardId} />}
      {activeTab === "import" && <ImportTab boardId={boardId} token={token} />}
      {activeTab === "actions" && (
        <ActionsTab
          token={token}
          boardId={boardId}
          items={board.items}
          columns={board.columns}
          subitemColumns={board.subitemColumns}
          groups={board.groups}
          selectedItemIds={state.selectedItemIds}
          dispatch={dispatch}
          onRefresh={handleRefresh}
        />
      )}
      {activeTab === "logs" && <LogsTab />}
    </InspectorShell>
  );
}
