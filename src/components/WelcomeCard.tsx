import React, { useEffect, useState } from "react";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { BRAND } from "../utils/brandConfig";
import { isWelcomeDismissed, dismissWelcome } from "../services/leadCapture";
import { Sparkles, X } from "lucide-react";

export const WelcomeCard: React.FC = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    isWelcomeDismissed().then((dismissed) => {
      if (!dismissed) setVisible(true);
    });
  }, []);

  if (!visible) return null;

  const handleDismiss = () => {
    dismissWelcome();
    setVisible(false);
  };

  return (
    <Card className="relative border-primary/15 bg-accent/50 animate-fade-in mb-4">
      <CardContent className="p-5">
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-3 right-3 h-6 w-6 rounded-full text-muted-foreground hover:text-foreground"
          onClick={handleDismiss}
          title="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </Button>
        <div className="flex gap-4">
          <div className="flex items-start pt-0.5">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 text-primary">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="space-y-1.5 pr-6">
            <h3 className="text-sm font-semibold text-primary">
              Welcome to {BRAND.name}!
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              This tool lets you bulk import parent items and subitems into
              Monday.com from CSV or Excel files — no limits, no account
              required.
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Open source and free to use.{" "}
              <a
                href={BRAND.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline font-medium"
              >
                View on GitHub
              </a>
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
