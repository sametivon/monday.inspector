import { useState, useCallback, useMemo } from "react";
import type { MondayGroup, MondayItem } from "../../utils/types";
import { fetchSubitems } from "../services/inspectorApi";
import type { Action } from "../hooks/useInspectorStore";

interface HierarchyTabProps {
  token: string;
  groups: MondayGroup[];
  items: MondayItem[];
  loading: boolean;
  selectedItemId: string | null;
  selectedItemIds: Set<string>;
  dispatch: React.Dispatch<Action>;
  onSelectItem: (item: MondayItem) => void;
}

interface SubitemCache {
  [parentId: string]: { loading: boolean; items: MondayItem[] };
}

export function HierarchyTab({
  token,
  groups,
  items,
  loading,
  selectedItemId,
  selectedItemIds,
  dispatch,
  onSelectItem,
}: HierarchyTabProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [subitemCache, setSubitemCache] = useState<SubitemCache>({});
  const [searchQuery, setSearchQuery] = useState("");

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const toggleItem = useCallback(
    async (itemId: string) => {
      const wasExpanded = expandedItems.has(itemId);
      setExpandedItems((prev) => {
        const next = new Set(prev);
        if (wasExpanded) next.delete(itemId);
        else next.add(itemId);
        return next;
      });

      if (!wasExpanded && !subitemCache[itemId] && token) {
        setSubitemCache((prev) => ({
          ...prev,
          [itemId]: { loading: true, items: [] },
        }));
        try {
          const subs = await fetchSubitems(token, itemId);
          setSubitemCache((prev) => ({
            ...prev,
            [itemId]: { loading: false, items: subs },
          }));
        } catch {
          setSubitemCache((prev) => ({
            ...prev,
            [itemId]: { loading: false, items: [] },
          }));
        }
      }
    },
    [expandedItems, subitemCache, token],
  );

  const handleCheckbox = (e: React.MouseEvent, itemId: string) => {
    e.stopPropagation();
    dispatch({ type: "TOGGLE_ITEM", id: itemId });
  };

  const handleSelectAll = () => {
    const allIds = filteredItems().map((i) => i.id);
    dispatch({ type: "SELECT_ALL", ids: allIds });
  };

  const handleClearSelection = () => {
    dispatch({ type: "CLEAR_SELECTION" });
  };

  const query = searchQuery.toLowerCase().trim();

  // Memoize the expensive shape — rebuilding a Map of 5000 items on every
  // keystroke / selection change was the main render-time cost on big boards.
  const { itemsByGroup, filtered } = useMemo(() => {
    const matches = (item: MondayItem) =>
      !query ||
      item.name.toLowerCase().includes(query) ||
      item.id.includes(query);

    const byGroup = new Map<string, MondayItem[]>();
    const filteredList: MondayItem[] = [];
    for (const item of items) {
      if (matches(item)) filteredList.push(item);
      const groupId = item.group?.id ?? "__ungrouped__";
      const arr = byGroup.get(groupId);
      if (arr) arr.push(item);
      else byGroup.set(groupId, [item]);
    }
    return { itemsByGroup: byGroup, filtered: filteredList };
  }, [items, query]);

  const matchesSearch = useCallback(
    (item: MondayItem) =>
      !query ||
      item.name.toLowerCase().includes(query) ||
      item.id.includes(query),
    [query],
  );

  const filteredItems = () => filtered;

  if (loading && items.length === 0) {
    return (
      <div className="empty-state">
        <div className="spinner" />
        <span>Loading items...</span>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📁</div>
        <span>No items found</span>
      </div>
    );
  }

  const checkboxStyle: React.CSSProperties = {
    width: 14, height: 14, cursor: "pointer", flexShrink: 0, accentColor: "hsl(262 83% 58%)",
  };

  return (
    <div>
      {/* Search */}
      <input
        className="editor-input"
        style={{ marginBottom: 6, fontSize: 11 }}
        placeholder="Search items by name or ID..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      {/* Selection bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, fontSize: 10, color: "hsl(var(--muted-foreground))" }}>
        <span>
          {items.length} items
          {loading && (
            <span style={{ marginLeft: 4, color: "hsl(262 83% 58%)" }}>
              · loading more…
            </span>
          )}
        </span>
        <span>·</span>
        <button
          className="btn-ghost"
          style={{ fontSize: 10, padding: "1px 4px" }}
          onClick={handleSelectAll}
        >
          Select all
        </button>
        {selectedItemIds.size > 0 && (
          <>
            <button
              className="btn-ghost"
              style={{ fontSize: 10, padding: "1px 4px" }}
              onClick={handleClearSelection}
            >
              Clear
            </button>
            <span className="type-badge" style={{ fontSize: 9, padding: "1px 5px" }}>
              {selectedItemIds.size} selected
            </span>
          </>
        )}
      </div>

      {/* Tree */}
      {groups.map((group) => {
        const groupItems = (itemsByGroup.get(group.id) ?? []).filter(matchesSearch);
        if (query && groupItems.length === 0) return null;

        const isExpanded = expandedGroups.has(group.id);
        return (
          <div key={group.id} style={{ marginBottom: 4 }}>
            <div
              className="tree-item"
              style={{ fontWeight: 600 }}
              onClick={() => toggleGroup(group.id)}
            >
              <span className={`tree-toggle ${isExpanded ? "expanded" : ""}`}>▶</span>
              <span>📁 {group.title}</span>
              <span className="type-badge" style={{ marginLeft: "auto" }}>
                {groupItems.length}
              </span>
            </div>

            {isExpanded && (
              <div className="tree-children">
                {groupItems.map((item) => {
                  const itemExpanded = expandedItems.has(item.id);
                  const cached = subitemCache[item.id];
                  const isChecked = selectedItemIds.has(item.id);
                  return (
                    <div key={item.id}>
                      <div
                        className={`tree-item ${selectedItemId === item.id ? "selected" : ""}`}
                        onClick={() => onSelectItem(item)}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onClick={(e) => handleCheckbox(e, item.id)}
                          onChange={() => {}}
                          style={checkboxStyle}
                        />
                        <span
                          className={`tree-toggle ${itemExpanded ? "expanded" : ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleItem(item.id);
                          }}
                        >
                          ▶
                        </span>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                          {item.name}
                        </span>
                        <code style={{ marginLeft: "auto", fontSize: 9, opacity: 0.5, flexShrink: 0 }}>
                          {item.id}
                        </code>
                      </div>

                      {itemExpanded && (
                        <div className="tree-children">
                          {cached?.loading ? (
                            <div style={{ padding: "4px 8px", display: "flex", alignItems: "center", gap: 6 }}>
                              <div className="spinner" />
                              <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>Loading subitems...</span>
                            </div>
                          ) : cached?.items.length ? (
                            cached.items.map((sub) => (
                              <div
                                key={sub.id}
                                className={`tree-item ${selectedItemId === sub.id ? "selected" : ""}`}
                                onClick={() => onSelectItem(sub)}
                              >
                                <span style={{ width: 14 }} />
                                <span style={{ width: 16 }} />
                                <span>📎 {sub.name}</span>
                                <code style={{ marginLeft: "auto", fontSize: 9, opacity: 0.5 }}>
                                  {sub.id}
                                </code>
                              </div>
                            ))
                          ) : (
                            <div style={{ padding: "4px 8px", fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
                              No subitems
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
