import React from "react";
import { Button } from "./ui/button";
import { BRAND } from "../utils/brandConfig";
import { Coffee } from "lucide-react";

export const Footer: React.FC = () => (
  <footer className="mt-10 pt-6 border-t border-border">
    <div className="flex flex-col items-center gap-3 text-center">
      <p className="text-xs text-muted-foreground">
        Built by{" "}
        <a
          href={BRAND.authorUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-foreground/70 hover:text-primary transition-colors"
        >
          {BRAND.author}
        </a>
        {" @ "}
        <a
          href={BRAND.website}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-foreground/70 hover:text-primary transition-colors"
        >
          {BRAND.company}
        </a>
      </p>
      <nav className="flex items-center gap-1 text-xs">
        <a
          href={BRAND.website}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline px-1.5 py-0.5 rounded transition-colors hover:bg-accent"
        >
          Fruition Services
        </a>
        <span className="text-muted-foreground/40">·</span>
        <a
          href={BRAND.consultationUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline px-1.5 py-0.5 rounded transition-colors hover:bg-accent"
        >
          Book a Consultation
        </a>
        <span className="text-muted-foreground/40">·</span>
        <a
          href={BRAND.servicesUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline px-1.5 py-0.5 rounded transition-colors hover:bg-accent"
        >
          Our Services
        </a>
      </nav>
      <Button asChild variant="outline" size="sm" className="bg-[#ffdd00] border-[#ffdd00] text-[#1a1a2e] hover:bg-[#ffe94a] hover:border-[#ffe94a] hover:text-[#1a1a2e] font-semibold shadow-sm">
        <a
          href={BRAND.buyMeACoffeeUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Coffee className="w-3.5 h-3.5" />
          Buy me a coffee
        </a>
      </Button>
    </div>
  </footer>
);
