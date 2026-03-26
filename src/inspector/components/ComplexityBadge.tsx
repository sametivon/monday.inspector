import { useComplexity } from "../services/complexityStore";

export function ComplexityBadge() {
  const { remaining, budget, used } = useComplexity();

  if (used === 0) return null; // Don't show until first query

  const pct = remaining / budget;
  const color =
    pct > 0.7 ? "hsl(142 76% 46%)" :
    pct > 0.3 ? "hsl(38 92% 50%)" :
    "hsl(0 84% 60%)";

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
        gap: 4,
        fontSize: 9,
        color: "hsl(var(--muted-foreground))",
        cursor: "default",
      }}
    >
      <div style={{
        width: 40,
        height: 4,
        borderRadius: 2,
        background: "hsl(var(--muted))",
        overflow: "hidden",
      }}>
        <div style={{
          width: `${Math.max(2, pct * 100)}%`,
          height: "100%",
          background: color,
          borderRadius: 2,
          transition: "width 0.3s, background 0.3s",
        }} />
      </div>
      <span style={{ fontFamily: "monospace", fontSize: 8, color }}>{formatted}</span>
    </div>
  );
}
