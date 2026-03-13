import React from "react";
import { BRAND } from "../utils/brandConfig";

export const Footer: React.FC = () => (
  <footer className="mt-10 pt-6 border-t border-border">
    <div className="flex flex-col items-center gap-3 text-center">
      <p className="text-xs text-muted-foreground">
        {BRAND.name} — Open source tool for Monday.com bulk imports
      </p>
      <nav className="flex items-center gap-1 text-xs">
        <a
          href={BRAND.website}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline px-1.5 py-0.5 rounded transition-colors hover:bg-accent"
        >
          GitHub
        </a>
        <span className="text-muted-foreground/40">·</span>
        <a
          href={BRAND.consultationUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline px-1.5 py-0.5 rounded transition-colors hover:bg-accent"
        >
          Report an Issue
        </a>
      </nav>
    </div>
  </footer>
);
