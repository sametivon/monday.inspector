import React from "react";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { BRAND } from "../utils/brandConfig";
import { Star } from "lucide-react";

export const LeadCaptureCard: React.FC = () => (
  <Card className="mt-4 border-primary/10 bg-accent/50 animate-fade-in">
    <CardContent className="p-4 space-y-2">
      <p className="text-sm font-semibold text-foreground">
        Find this tool useful?
      </p>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Star the project on GitHub to help others discover it and stay updated
        with new features.
      </p>
      <Button asChild size="sm" className="w-full">
        <a
          href={BRAND.website}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Star className="w-3.5 h-3.5" />
          Star on GitHub
        </a>
      </Button>
    </CardContent>
  </Card>
);
