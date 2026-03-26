import { useState } from "react";
import { verifyToken } from "../../services/mondayApi";

interface TokenSetupProps {
  onSave: (token: string) => void;
}

export function TokenSetup({ onSave }: TokenSetupProps) {
  const [inputToken, setInputToken] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const cleaned = inputToken.trim().replace(/[\r\n]/g, "");
    if (!cleaned) return;

    setVerifying(true);
    setError(null);

    try {
      const valid = await verifyToken(cleaned);
      if (valid) {
        onSave(cleaned);
      } else {
        setError("Invalid token. Please check and try again.");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div style={{ padding: "20px 0" }}>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🔑</div>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Connect to Monday.com</h3>
        <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
          Enter your Monday.com API token to get started.
        </p>
      </div>

      <div style={{ marginBottom: 12 }}>
        <input
          className="editor-input"
          type="password"
          placeholder="Paste your API token here..."
          value={inputToken}
          onChange={(e) => setInputToken(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        />
      </div>

      {error && (
        <div
          style={{
            fontSize: 12,
            color: "hsl(var(--destructive))",
            marginBottom: 8,
            padding: "6px 8px",
            background: "hsl(var(--destructive) / 0.1)",
            borderRadius: 6,
          }}
        >
          {error}
        </div>
      )}

      <button
        className="btn-primary"
        style={{ width: "100%" }}
        onClick={handleSubmit}
        disabled={verifying || !inputToken.trim()}
      >
        {verifying ? "Verifying..." : "Connect"}
      </button>

      <p style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginTop: 12, textAlign: "center" }}>
        Find your token at monday.com → Profile → Admin → API
      </p>
    </div>
  );
}
