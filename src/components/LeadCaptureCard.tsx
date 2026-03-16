import React from "react";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { BRAND } from "../utils/brandConfig";
import { Calendar } from "lucide-react";

export const LeadCaptureCard: React.FC = () => (
  <Card className="mt-4 border-primary/10 bg-accent/50 animate-fade-in">
    <CardContent className="p-4 space-y-2">
      <p className="text-sm font-semibold text-foreground">
        Need help with Monday.com workflows?
      </p>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Platinum monday.com partner with 500+ implementations. Get a
        30-minute consultation.
      </p>
      <Button asChild size="sm" className="w-full">
        <a
          href={BRAND.consultationUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Calendar className="w-3.5 h-3.5" />
          Book a Consultation
        </a>
      </Button>
    </CardContent>
  </Card>
);
