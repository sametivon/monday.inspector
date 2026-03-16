import React from "react";
import { Button } from "../components/ui/button";
import { BRAND } from "../utils/brandConfig";
import { TokenCard } from "../components/TokenCard";
import { Coffee, ExternalLink } from "lucide-react";

export const Popup: React.FC = () => {
  const openPanel = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("src/panel/index.html") });
  };

  return (
    <div className="p-4 w-[340px]">
      <div className="mb-3 text-center">
        <h2 className="text-base font-bold tracking-tight text-foreground">
          Monday.com Inspector
        </h2>
      </div>

      <TokenCard />

      <div className="my-3 border-t border-border" />

      <Button className="w-full" onClick={openPanel}>
        Open Import Panel
        <ExternalLink className="w-3.5 h-3.5" />
      </Button>

      <div className="mt-3 pt-3 border-t border-border text-center">
        <div className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
          <span>
            by{" "}
            <a
              href={BRAND.authorUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline font-medium"
            >
              {BRAND.author}
            </a>
          </span>
          <span className="opacity-40">·</span>
          <a
            href={BRAND.consultationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Book a Consultation
          </a>
        </div>
        <Button
          asChild
          variant="outline"
          size="sm"
          className="mt-2 w-full bg-[#ffdd00] border-[#ffdd00] text-[#1a1a2e] hover:bg-[#ffe94a] hover:border-[#ffe94a] hover:text-[#1a1a2e] font-semibold text-xs"
        >
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
    </div>
  );
};
