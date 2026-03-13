import React from "react";
import { Button } from "./ui/button";
import { BRAND } from "../utils/brandConfig";
import { LifeBuoy } from "lucide-react";

export const ErrorHelpCTA: React.FC = () => (
  <div className="mt-3 p-3 bg-destructive/5 border border-destructive/20 rounded-lg flex items-center justify-between gap-3 animate-fade-in">
    <p className="text-xs text-muted-foreground leading-relaxed flex-1">
      Having trouble? Open a GitHub issue with your error details and we'll help
      you get it working.
    </p>
    <Button asChild size="sm" variant="destructive" className="shrink-0">
      <a
        href={BRAND.consultationUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        <LifeBuoy className="w-3.5 h-3.5" />
        Report Issue
      </a>
    </Button>
  </div>
);
