import React, { useState, useCallback, useRef, useEffect } from "react";
import type { InspectorTab } from "../Inspector";

interface InspectorShellProps {
  activeTab: InspectorTab;
  onTabChange: (tab: InspectorTab) => void;
  onClose: () => void;
  onRefresh: () => void;
  boardId: string | null;
  connected: boolean;
  loading: boolean;
  children: React.ReactNode;
  headerActions?: React.ReactNode;
  exportMenu?: React.ReactNode;
}

const TABS: { id: InspectorTab; label: string }[] = [
  { id: "schema", label: "Schema" },
  { id: "hierarchy", label: "Items" },
  { id: "detail", label: "Detail" },
  { id: "query", label: "Query" },
  { id: "import", label: "Import" },
  { id: "actions", label: "Actions" },
  { id: "logs", label: "Logs" },
];

const DEFAULT_WIDTH = 380;
const DEFAULT_HEIGHT = 500;
const MIN_WIDTH = 280;
const MIN_HEIGHT = 300;

export function InspectorShell({
  activeTab,
  onTabChange,
  onClose,
  onRefresh,
  boardId,
  connected,
  loading,
  children,
  headerActions,
  exportMenu,
}: InspectorShellProps) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [pos, setPos] = useState({ x: window.innerWidth - DEFAULT_WIDTH - 16, y: 60 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    setIsDragging(true);
  }, [pos]);

  useEffect(() => {
    if (!isDragging) return;
    const handleMove = (e: MouseEvent) => {
      const newX = Math.max(0, Math.min(window.innerWidth - 100, e.clientX - dragOffset.current.x));
      const newY = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - dragOffset.current.y));
      setPos({ x: newX, y: newY });
    };
    const handleUp = () => setIsDragging(false);
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
    return () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };
  }, [isDragging]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;
    const handleMove = (e: MouseEvent) => {
      const newW = Math.max(MIN_WIDTH, e.clientX - pos.x);
      const newH = Math.max(MIN_HEIGHT, e.clientY - pos.y);
      setWidth(newW);
      setHeight(newH);
    };
    const handleUp = () => setIsResizing(false);
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
    return () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };
  }, [isResizing, pos]);

  return (
    <div
      ref={panelRef}
      className="inspector-panel open"
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        width,
        height,
        display: "flex",
        flexDirection: "column",
        background: "hsl(0 0% 100%)",
        border: "1px solid hsl(240 5.9% 90%)",
        borderRadius: 10,
        boxShadow: "0 8px 30px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)",
        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: "11px",
        color: "hsl(240 10% 3.9%)",
        zIndex: 1,
        pointerEvents: "auto",
        userSelect: isDragging || isResizing ? "none" : "auto",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        onMouseDown={handleDragStart}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 10px",
          borderBottom: "1px solid hsl(240 5.9% 90%)",
          background: "hsl(0 0% 100%)",
          flexShrink: 0,
          cursor: isDragging ? "grabbing" : "grab",
          borderRadius: "10px 10px 0 0",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 12, letterSpacing: "-0.02em" }}>Inspector</span>
          {boardId && (
            <span className="type-badge" style={{ fontSize: 9, fontFamily: "monospace" }}>
              {boardId}
            </span>
          )}
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: connected ? "hsl(142 76% 46%)" : "hsl(0 84% 60%)",
              flexShrink: 0,
              boxShadow: connected ? "0 0 4px hsl(142 76% 46% / 0.4)" : undefined,
            }}
            title={connected ? "Connected" : "No connection"}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          {loading && <div className="spinner" style={{ width: 12, height: 12 }} />}
          {headerActions}
          <button className="btn-icon" onClick={onRefresh} title="Refresh data" style={{ fontSize: 13 }}>
            ↻
          </button>
          <button className="btn-icon" onClick={onClose} title="Close inspector" style={{ fontSize: 12 }}>
            ✕
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="tab-bar" style={{ flexShrink: 0 }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Export bar */}
      {exportMenu && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "flex-end",
          padding: "3px 8px", borderBottom: "1px solid hsl(240 5.9% 90%)",
          background: "hsl(240 4.8% 95.9% / 0.5)", flexShrink: 0,
        }}>
          {exportMenu}
        </div>
      )}

      {/* Tab content */}
      <div className="tab-content">{children}</div>

      {/* Resize handle */}
      <div
        onMouseDown={handleResizeStart}
        style={{
          position: "absolute",
          right: 0,
          bottom: 0,
          width: 18,
          height: 18,
          cursor: "nwse-resize",
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "hsl(240 5.9% 80%)",
          fontSize: 9,
          lineHeight: 1,
        }}
      >
        ◢
      </div>
    </div>
  );
}
