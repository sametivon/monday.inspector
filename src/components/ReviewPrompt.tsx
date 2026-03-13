import React, { useEffect, useState } from "react";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { BRAND, REVIEW_PROMPT_THRESHOLD } from "../utils/brandConfig";
import {
  getImportCount,
  isReviewPromptDismissed,
  dismissReviewPrompt,
} from "../services/leadCapture";
import { Star, X } from "lucide-react";

export const ReviewPrompt: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [count, setCount] = useState(0);

  useEffect(() => {
    Promise.all([getImportCount(), isReviewPromptDismissed()]).then(
      ([importCount, dismissed]) => {
        setCount(importCount);
        if (importCount >= REVIEW_PROMPT_THRESHOLD && !dismissed) {
          setVisible(true);
        }
      },
    );
  }, []);

  if (!visible) return null;

  const handleDismiss = () => {
    dismissReviewPrompt();
    setVisible(false);
  };

  return (
    <Card className="relative mt-4 border-primary/10 bg-accent/50 animate-fade-in">
      <CardContent className="p-4 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 h-6 w-6 rounded-full text-muted-foreground hover:text-foreground"
          onClick={handleDismiss}
          title="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </Button>
        <p className="text-xs text-muted-foreground leading-relaxed flex-1 pr-6">
          You've completed <strong className="text-foreground">{count}</strong>{" "}
          {count === 1 ? "import" : "imports"} with {BRAND.name}! If you find this tool useful, a quick
          review helps others discover it.
        </p>
        <Button asChild size="sm" className="shrink-0">
          <a
            href={BRAND.chromeStoreUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Star className="w-3.5 h-3.5" />
            Leave a Review
          </a>
        </Button>
      </CardContent>
    </Card>
  );
};
