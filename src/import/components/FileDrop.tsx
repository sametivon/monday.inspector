import { useRef, useState } from "react";
import type { ParsedFile } from "../../utils/types";

interface Props {
  file: ParsedFile | null;
  onFile: (f: File) => void;
  error: string | null;
}

/**
 * Drag-and-drop zone with file picker fallback. Becomes a green confirmation
 * chip once a file has been parsed; clicking it lets the user pick another.
 */
export function FileDrop({ file, onFile, error }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = (files: FileList | null) => {
    const f = files?.[0];
    if (f) onFile(f);
  };

  if (file) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="imp-file-chip">
          <div className="imp-file-icon">✓</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="imp-file-name">{file.fileName}</div>
            <div className="imp-file-meta">
              {file.kind === "monday_export" ? (
                <>
                  Monday board export · {file.groups.length} groups ·{" "}
                  {file.flatSubitems.length} subitems
                </>
              ) : (
                <>
                  Flat CSV · {file.headers.length} columns · {file.rowCount} rows
                </>
              )}
            </div>
          </div>
          <button
            className="qi-btn qi-btn-sm qi-btn-ghost"
            onClick={() => inputRef.current?.click()}
          >
            Choose different file
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.tsv,.xlsx,.xls"
          style={{ display: "none" }}
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
    );
  }

  return (
    <>
      <div
        className={`imp-drop ${dragging ? "dragging" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
      >
        <div className="imp-drop-icon">📥</div>
        <div className="imp-drop-title">Drop your file here</div>
        <div className="imp-drop-sub">
          CSV, TSV, or XLSX · click to browse
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.tsv,.xlsx,.xls"
        style={{ display: "none" }}
        onChange={(e) => handleFiles(e.target.files)}
      />
      {error && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 12px",
            background: "hsl(0 84% 97%)",
            border: "1px solid hsl(0 84% 88%)",
            borderRadius: "var(--qi-radius)",
            color: "hsl(0 70% 35%)",
            fontSize: 12.5,
          }}
        >
          ⚠ {error}
        </div>
      )}
    </>
  );
}
