import React, { useCallback, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Upload } from "lucide-react";
import { cn } from "../lib/utils";
import type { ParsedFile } from "../utils/types";
import { parseFile } from "../services/fileParser";

interface UploadCardProps {
  onFileParsed: (file: ParsedFile) => void;
}

export const UploadCard: React.FC<UploadCardProps> = ({ onFileParsed }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setLoading(true);
      try {
        const parsed = await parseFile(file);
        onFileParsed(parsed);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [onFileParsed],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  return (
    <Card className="animate-fade-in animate-delay-2">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-primary/10 text-primary text-xs font-bold">
            3
          </div>
          Upload CSV or Excel
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Supports flat CSV files <strong>or</strong> monday.com board exports
          (.xlsx)
        </p>
        <div
          className={cn(
            "relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-10 cursor-pointer transition-all duration-200",
            dragOver
              ? "border-primary bg-accent shadow-[0_0_0_4px_hsl(var(--accent))]"
              : "border-border bg-muted/30 hover:border-primary/50 hover:bg-accent/50",
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.tsv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              // Reset so re-uploading the same file triggers onChange again
              e.target.value = "";
            }}
          />
          {loading ? (
            <p className="text-sm text-muted-foreground">Parsing file...</p>
          ) : (
            <>
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 text-primary">
                <Upload className="w-5 h-5" />
              </div>
              <p className="text-sm font-medium text-foreground">
                Drag and drop your CSV or Excel file here
              </p>
              <p className="text-xs text-muted-foreground">
                or click to browse
              </p>
            </>
          )}
        </div>
        {error && (
          <p className="text-xs text-destructive font-medium">{error}</p>
        )}
      </CardContent>
    </Card>
  );
};
