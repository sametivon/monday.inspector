import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Eye, EyeOff, Key, CheckCircle } from "lucide-react";
import { getApiToken, setApiToken } from "../utils/storage";
import { verifyToken } from "../services/mondayApi";

interface TokenCardProps {
  onTokenSaved?: (token: string) => void;
}

export const TokenCard: React.FC<TokenCardProps> = ({ onTokenSaved }) => {
  const [token, setToken] = useState("");
  const [masked, setMasked] = useState(true);
  const [saved, setSaved] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState<boolean | null>(null);

  useEffect(() => {
    getApiToken().then((t) => setToken(t));
  }, []);

  const handleSave = async () => {
    // Sanitize: trim whitespace and strip newlines/carriage returns to prevent header injection
    const sanitized = token.trim().replace(/[\r\n]/g, "");
    await setApiToken(sanitized);
    setToken(sanitized);
    setSaved(true);
    setVerified(null);
    onTokenSaved?.(sanitized);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleVerify = async () => {
    if (!token.trim()) return;
    setVerifying(true);
    setVerified(null);
    const ok = await verifyToken(token.trim());
    setVerified(ok);
    setVerifying(false);
  };

  return (
    <Card className="animate-fade-in">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-primary/10 text-primary text-xs font-bold">
            1
          </div>
          Connect Monday.com
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label
            htmlFor="api-token"
            className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"
          >
            <Key className="w-3 h-3" />
            API Token
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                id="api-token"
                type={masked ? "password" : "text"}
                value={token}
                onChange={(e) => {
                  setToken(e.target.value);
                  setVerified(null);
                }}
                placeholder="Paste your monday.com API token"
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setMasked(!masked)}
              title={masked ? "Show token" : "Hide token"}
              className="shrink-0"
            >
              {masked ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </Button>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={handleSave} disabled={!token.trim()} size="sm">
            {saved ? "Saved!" : "Save Token"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleVerify}
            disabled={!token.trim() || verifying}
          >
            {verifying ? "Verifying…" : verified === true ? "Connected" : "Verify Connection"}
          </Button>
          {verified === true && (
            <span className="flex items-center gap-1 text-xs text-emerald-600">
              <CheckCircle className="w-3.5 h-3.5" />
              Token verified
            </span>
          )}
          {verified === false && (
            <span className="text-xs text-destructive">Invalid token. Check your API token.</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Get your token: Monday.com → Profile → Developers → API token. Or{" "}
          <a
            href="https://monday.com/developers/apps"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline font-medium"
          >
            Monday.com Developer Center
          </a>
        </p>
      </CardContent>
    </Card>
  );
};
