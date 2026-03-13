import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { LayoutDashboard } from "lucide-react";

interface BoardCardProps {
  boardId: string;
  onBoardIdChange: (id: string) => void;
}

export const BoardCard: React.FC<BoardCardProps> = ({
  boardId,
  onBoardIdChange,
}) => (
  <Card className="animate-fade-in animate-delay-1">
    <CardHeader className="pb-4">
      <CardTitle className="flex items-center gap-2 text-base">
        <div className="flex items-center justify-center w-6 h-6 rounded-md bg-primary/10 text-primary text-xs font-bold">
          2
        </div>
        Select Board
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-2">
      <label
        htmlFor="board-id"
        className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"
      >
        <LayoutDashboard className="w-3 h-3" />
        Board ID
      </label>
      <Input
        id="board-id"
        type="text"
        value={boardId}
        onChange={(e) => onBoardIdChange(e.target.value.replace(/\D/g, ""))}
        placeholder="e.g. 1234567890"
      />
      <p className="text-xs text-muted-foreground">
        Find your Board ID in the board URL: monday.com/boards/<strong>1234567890</strong>
      </p>
    </CardContent>
  </Card>
);
