import { useMemo, useState } from "react";
import { CATEGORIES, TEMPLATES, type TemplateCategory } from "../templates";

interface Props {
  activeId: string | null;
  onSelect: (id: string) => void;
}

/**
 * Browseable, searchable list of curated GraphQL templates grouped by
 * category. Categories are intentionally short so the user can scan them
 * vertically without scrolling on a typical screen.
 */
export function TemplateGallery({ activeId, onSelect }: Props) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return TEMPLATES.filter(
      (t) =>
        !q ||
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q),
    );
  }, [search]);

  const grouped = useMemo(() => {
    const map = new Map<TemplateCategory, typeof TEMPLATES>();
    for (const cat of CATEGORIES) map.set(cat, []);
    for (const t of filtered) {
      const arr = map.get(t.category);
      if (arr) arr.push(t);
    }
    return map;
  }, [filtered]);

  return (
    <div>
      <div className="qi-search" style={{ marginBottom: 12 }}>
        <input
          className="qi-input"
          placeholder="Search templates"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 && (
        <div className="qi-saved-empty">
          No templates match <strong>{search}</strong>
        </div>
      )}

      {CATEGORIES.map((cat) => {
        const items = grouped.get(cat) ?? [];
        if (items.length === 0) return null;
        return (
          <div key={cat} className="qi-cat-section">
            <div className="qi-cat-section-header">{cat}</div>
            <div className="qi-template-list">
              {items.map((t) => (
                <button
                  key={t.id}
                  className={`qi-template-card ${activeId === t.id ? "active" : ""}`}
                  onClick={() => onSelect(t.id)}
                  title={t.description}
                >
                  <div className="qi-template-card-title">
                    {t.title}
                    {t.complexity === "high" && (
                      <span
                        className="qi-cat-tag"
                        style={{
                          background: "hsl(38 92% 92%)",
                          color: "hsl(38 80% 35%)",
                        }}
                      >
                        heavy
                      </span>
                    )}
                  </div>
                  <div className="qi-template-card-desc">{t.description}</div>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
