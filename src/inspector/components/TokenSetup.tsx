import { useState } from "react";
import { verifyToken } from "../../services/mondayApi";

interface TokenSetupProps {
  onSave: (token: string) => void;
}

export function TokenSetup({ onSave }: TokenSetupProps) {
  const [inputToken, setInputToken] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    const cleaned = inputToken.trim().replace(/[\r\n]/g, "");
    if (!cleaned) return;

    setVerifying(true);
    setError(null);

    try {
      const valid = await verifyToken(cleaned);
      if (valid) {
        setSuccess(true);
        setTimeout(() => onSave(cleaned), 600);
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
    <div style={{ padding: "24px 8px" }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{
          fontSize: 38,
          marginBottom: 10,
          filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.1))",
        }}>
          🔑
        </div>
        <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 6, letterSpacing: "-0.02em" }}>
          Connect to Monday.com
        </h3>
        <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", lineHeight: 1.5 }}>
          Enter your API token to start inspecting boards.
        </p>
      </div>

      <div style={{ marginBottom: 14 }}>
        <input
          className="editor-input"
          type="password"
          placeholder="Paste your API token here..."
          value={inputToken}
          onChange={(e) => { setInputToken(e.target.value); setError(null); }}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          style={{ fontSize: 12, padding: "10px 14px" }}
        />
      </div>

      {error && (
        <div className="status-message error" style={{ marginBottom: 10, fontSize: 11 }}>
          {error}
        </div>
      )}

      {success && (
        <div className="status-message success" style={{ marginBottom: 10, fontSize: 11, textAlign: "center" }}>
          ✓ Connected successfully!
        </div>
      )}

      <button
        className="btn-primary"
        style={{ width: "100%", padding: "10px 16px", fontSize: 12 }}
        onClick={handleSubmit}
        disabled={verifying || !inputToken.trim() || success}
      >
        {verifying ? (
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className="spinner" style={{ width: 12, height: 12, borderColor: "hsl(0 0% 100% / 0.3)", borderTopColor: "white" }} />
            Verifying...
          </span>
        ) : success ? (
          "✓ Connected"
        ) : (
          "Connect"
        )}
      </button>

      <div style={{
        marginTop: 16,
        padding: "10px 12px",
        background: "hsl(var(--muted) / 0.5)",
        borderRadius: 10,
        fontSize: 11,
        color: "hsl(var(--muted-foreground))",
        lineHeight: 1.5,
      }}>
        <strong style={{ color: "hsl(var(--foreground))" }}>How to get your token:</strong>
        <br />
        monday.com → Profile picture → Admin → API
      </div>
    </div>
  );
}
