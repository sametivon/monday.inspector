import { useComplexity } from "../services/complexityStore";

export function ComplexityBadge() {
  const { remaining, budget, used } = useComplexity();

  if (used === 0) return null;

  const pct = remaining / budget;
  const color =
    pct > 0.7 ? "hsl(150 60% 46%)" :
    pct > 0.3 ? "hsl(38 92% 50%)" :
    "hsl(0 72% 56%)";

  const bgColor =
    pct > 0.7 ? "hsl(150 60% 46% / 0.12)" :
    pct > 0.3 ? "hsl(38 92% 50% / 0.12)" :
    "hsl(0 72% 56% / 0.12)";

  const formatted = remaining >= 1_000_000
    ? `${(remaining / 1_000_000).toFixed(1)}M`
    : remaining >= 1_000
    ? `${(remaining / 1_000).toFixed(0)}K`
    : `${remaining}`;

  return (
    <div
      title={`API Budget: ${remaining.toLocaleString()} / ${budget.toLocaleString()} points remaining this minute\nUsed: ${used.toLocaleString()} points`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        fontSize: 9,
        color: "hsl(var(--muted-foreground))",
        cursor: "default",
        padding: "3px 8px",
        borderRadius: 8,
        background: bgColor,
        transition: "all 0.3s ease",
      }}
    >
      <div style={{
        width: 44,
        height: 5,
        borderRadius: 3,
        background: "hsl(var(--muted))",
        overflow: "hidden",
      }}>
        <div style={{
          width: `${Math.max(3, pct * 100)}%`,
          height: "100%",
          background: color,
          borderRadius: 3,
          transition: "width 0.5s cubic-bezier(0.4, 0, 0.2, 1), background 0.3s",
          boxShadow: `0 0 6px ${color}`,
        }} />
      </div>
      <span style={{ fontFamily: "monospace", fontSize: 9, fontWeight: 700, color }}>{formatted}</span>
    </div>
  );
}
