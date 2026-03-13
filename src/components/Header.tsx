import React from "react";

export const Header: React.FC = () => (
  <div className="mb-8 text-center">
    <h1 className="text-2xl font-bold tracking-tight text-foreground mb-2">
      Monday.com Inspector
    </h1>
    <p className="text-sm text-muted-foreground leading-relaxed">
      Bulk import parent items and subitems to Monday.com from CSV or Excel
    </p>
  </div>
);
