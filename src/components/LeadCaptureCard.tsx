import React from "react";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { BRAND } from "../utils/brandConfig";
import { Mail } from "lucide-react";

export const LeadCaptureCard: React.FC = () => (
  <Card className="mt-4 border-primary/10 bg-accent/50 animate-fade-in">
    <CardContent className="p-4 space-y-2">
      <p className="text-sm font-semibold text-foreground">
        Need custom monday.com tooling?
      </p>
      <p className="text-xs text-muted-foreground leading-relaxed">
        {BRAND.company} takes on a small number of client builds — custom
        apps, automations and AI workflows.
      </p>
      <Button asChild size="sm" className="w-full">
        <a href={BRAND.contactUrl}>
          <Mail className="w-3.5 h-3.5" />
          Talk to the lab
        </a>
      </Button>
    </CardContent>
  </Card>
);
