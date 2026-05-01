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
  /** classic | multi_level — drives the board-type pill in the header */
  hierarchyType?: "classic" | "multi_level";
  children: React.ReactNode;
  headerActions?: React.ReactNode;
  exportMenu?: React.ReactNode;
}

const TABS: { id: InspectorTab; label: string; icon: string }[] = [
  { id: "schema", label: "Schema", icon: "📐" },
  { id: "hierarchy", label: "Items", icon: "📁" },
  { id: "detail", label: "Detail", icon: "📋" },
  { id: "query", label: "Query", icon: "⚡" },
  { id: "import", label: "Import", icon: "📥" },
  { id: "actions", label: "Actions", icon: "🎯" },
  { id: "logs", label: "Logs", icon: "📝" },
];

const DEFAULT_WIDTH = 400;
const DEFAULT_HEIGHT = 540;
const MIN_WIDTH = 300;
const MIN_HEIGHT = 300;

export function InspectorShell({
  activeTab,
  onTabChange,
  onClose,
  onRefresh,
  boardId,
  connected,
  loading,
  hierarchyType,
  children,
  headerActions,
  exportMenu,
}: InspectorShellProps) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [pos, setPos] = useState({ x: window.innerWidth - DEFAULT_WIDTH - 16, y: 56 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [refreshSpin, setRefreshSpin] = useState(false);
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

  const handleRefresh = () => {
    setRefreshSpin(true);
    onRefresh();
    setTimeout(() => setRefreshSpin(false), 800);
  };

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
        background: "hsl(220 16% 97%)",
        border: "1px solid hsl(220 12% 87%)",
        borderRadius: 14,
        boxShadow: "0 16px 48px rgba(0,0,0,0.12), 0 6px 16px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.03)",
        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: "11px",
        color: "hsl(224 14% 10%)",
        zIndex: 1,
        pointerEvents: "auto",
        userSelect: isDragging || isResizing ? "none" : "auto",
        overflow: "hidden",
      }}
    >
      {/* Header — gradient accent */}
      <div
        onMouseDown={handleDragStart}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 12px",
          borderBottom: "1px solid hsl(220 12% 89%)",
          background: "linear-gradient(135deg, hsl(0 0% 100%) 0%, hsl(256 72% 98%) 100%)",
          flexShrink: 0,
          cursor: isDragging ? "grabbing" : "grab",
          borderRadius: "14px 14px 0 0",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Logo icon */}
          <div style={{
            width: 22,
            height: 22,
            borderRadius: 7,
            background: "linear-gradient(135deg, hsl(256 72% 56%) 0%, hsl(256 72% 46%) 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontSize: 11,
            fontWeight: 800,
            flexShrink: 0,
            boxShadow: "0 2px 6px hsl(256 72% 56% / 0.3)",
          }}>
            M
          </div>
          <span style={{ fontWeight: 800, fontSize: 13, letterSpacing: "-0.03em" }}>Inspector</span>
          {boardId && (
            <span className="type-badge" style={{ fontSize: 9, fontFamily: "monospace", padding: "2px 7px" }}>
              #{boardId}
            </span>
          )}
          {hierarchyType === "multi_level" && (
            <span
              title="Multi-level board: items can have items underneath, up to 5 levels deep. Subitem operations use the same board id."
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.04em",
                padding: "2px 7px",
                borderRadius: 999,
                background: "hsl(256 72% 95%)",
                color: "hsl(256 72% 38%)",
                border: "1px solid hsl(256 72% 86%)",
              }}
            >
              MULTI-LEVEL
            </span>
          )}
          {/* Connection indicator */}
          <div style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: connected ? "hsl(150 60% 46%)" : "hsl(0 72% 56%)",
            flexShrink: 0,
            boxShadow: connected
              ? "0 0 0 3px hsl(150 60% 46% / 0.2), 0 0 8px hsl(150 60% 46% / 0.3)"
              : "0 0 0 3px hsl(0 72% 56% / 0.2)",
            transition: "all 0.3s ease",
            animation: connected ? "none" : undefined,
          }}
            title={connected ? "Connected" : "No connection"}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          {loading && <div className="spinner" style={{ width: 12, height: 12 }} />}
          {headerActions}
          <button
            className="btn-icon"
            onClick={handleRefresh}
            title="Refresh data"
            style={{
              fontSize: 14,
              transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              transform: refreshSpin ? "rotate(360deg)" : "rotate(0deg)",
            }}
          >
            ↻
          </button>
          <button
            className="btn-icon"
            onClick={onClose}
            title="Close inspector"
            style={{ fontSize: 12 }}
          >
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
            title={tab.label}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Export bar */}
      {exportMenu && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "flex-end",
          padding: "4px 10px", borderBottom: "1px solid hsl(220 12% 89%)",
          background: "hsl(0 0% 100%)", flexShrink: 0,
        }}>
          {exportMenu}
        </div>
      )}

      {/* Tab content */}
      <div className="tab-content">{children}</div>

      {/* Resize handle — visible grip */}
      <div
        onMouseDown={handleResizeStart}
        style={{
          position: "absolute",
          right: 2,
          bottom: 2,
          width: 16,
          height: 16,
          cursor: "nwse-resize",
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: 0.3,
          transition: "opacity 0.2s",
          borderRadius: "0 0 12px 0",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.8"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.3"; }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <circle cx="6" cy="4" r="1" fill="hsl(220 12% 60%)" />
          <circle cx="4" cy="6" r="1" fill="hsl(220 12% 60%)" />
          <circle cx="8" cy="6" r="1" fill="hsl(220 12% 60%)" />
          <circle cx="6" cy="8" r="1" fill="hsl(220 12% 60%)" />
          <circle cx="8" cy="8" r="1" fill="hsl(220 12% 60%)" />
          <circle cx="2" cy="8" r="1" fill="hsl(220 12% 60%)" />
        </svg>
      </div>
    </div>
  );
}
