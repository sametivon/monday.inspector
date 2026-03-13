import React from "react";
import { Button } from "../components/ui/button";
import { TokenCard } from "../components/TokenCard";
import { ExternalLink } from "lucide-react";

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
    </div>
  );
};
