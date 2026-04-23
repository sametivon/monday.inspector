import React, { useCallback, useEffect, useState } from "react";
import { Header } from "../components/Header";
import { WelcomeCard } from "../components/WelcomeCard";
import { TokenCard } from "../components/TokenCard";
import { BoardCard } from "../components/BoardCard";
import { UploadCard } from "../components/UploadCard";
import { Footer } from "../components/Footer";
import { DataPreview } from "../components/DataPreview";
import { ColumnMapper } from "../components/ColumnMapper";
import { ImportProgress } from "../components/ImportProgress";
import { ErrorHelpCTA } from "../components/ErrorHelpCTA";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { getApiToken } from "../utils/storage";
import { incrementImportCount } from "../services/leadCapture";
import {
  fetchBoardColumns,
  fetchSubitemBoardId,
  fetchSubitemColumns,
  runImport,
  runMondayExportImport,
  runFullMondayExportImport,
} from "../services/mondayApi";
import {
  clearImportProgress,
  loadImportProgress,
  saveImportProgress,
} from "../services/importProgressStorage";
import { SUBITEM_NAME_SENTINEL } from "../utils/constants";
import type {
  ParsedFile,
  ColumnMapping,
  MondayColumn,
  ParentIdentifier,
  ImportProgress as ImportProgressType,
} from "../utils/types";

type Step = "setup" | "upload" | "map" | "importing" | "done";

export const Panel: React.FC = () => {
  const [step, setStep] = useState<Step>("setup");
  const [token, setToken] = useState("");
  const [boardId, setBoardId] = useState("");
  const [file, setFile] = useState<ParsedFile | null>(null);
  const [boardColumns, setBoardColumns] = useState<MondayColumn[]>([]);
  const [subitemColumns, setSubitemColumns] = useState<MondayColumn[]>([]);
  const [parentIdentifier, setParentIdentifier] = useState<ParentIdentifier>({
    type: "item_name",
    fileColumn: "",
  });
  const [subitemNameColumn, setSubitemNameColumn] = useState("");
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [parentMappings, setParentMappings] = useState<ColumnMapping[]>([]);
  const [includeParents, setIncludeParents] = useState(true);
  const [progress, setProgress] = useState<ImportProgressType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastImportBanner, setLastImportBanner] = useState<{
    fileName: string;
    succeeded: number;
    failed: number;
    total: number;
    updatedAt: number;
    finished: boolean;
  } | null>(null);

  useEffect(() => {
    getApiToken().then((t) => {
      setToken(t);
      if (t) setStep("upload");
    });
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.local.get("current_board_id", (res) => {
        if (res.current_board_id) setBoardId(res.current_board_id);
      });
    }
    // Restore last import banner so a reload/return doesn't lose what just happened.
    loadImportProgress().then((saved) => {
      if (!saved) return;
      setLastImportBanner({
        fileName: saved.fileName,
        succeeded: saved.progress.succeeded,
        failed: saved.progress.failed,
        total: saved.progress.total,
        updatedAt: saved.updatedAt,
        finished: saved.finished,
      });
    });
  }, []);

  const dismissLastImportBanner = useCallback(() => {
    setLastImportBanner(null);
    void clearImportProgress();
  }, []);

  const handleFileParsed = useCallback(
    async (parsed: ParsedFile) => {
      setFile(parsed);
      setError(null);

      if (parsed.kind === "monday_export") {
        const subHeaders = parsed.subitemHeaders.filter((h) => h !== "Name");
        setMappings(subHeaders.map((h) => ({ fileColumn: h, mondayColumnId: "" })));
        const pHeaders = parsed.parentHeaders.filter(
          (h) => h !== "Name" && h !== "Subitems",
        );
        setParentMappings(pHeaders.map((h) => ({ fileColumn: h, mondayColumnId: "" })));
        setParentIdentifier({ type: "item_name", fileColumn: "__auto__" });
        setSubitemNameColumn("__auto__");
      } else {
        setMappings(parsed.headers.map((h) => ({ fileColumn: h, mondayColumnId: "" })));
        setParentMappings([]);
      }

      if (boardId && token) {
        setLoading(true);
        try {
          // Fetch board columns and subitem board ID in parallel
          const [bCols, sbId] = await Promise.all([
            fetchBoardColumns(token, boardId),
            fetchSubitemBoardId(token, boardId),
          ]);
          setBoardColumns(bCols);
          if (sbId) {
            const cols = await fetchSubitemColumns(token, sbId);
            setSubitemColumns(cols);
          } else {
            setSubitemColumns([]);
          }

          // Filter out parent export columns that correspond to read-only board
          // column types (mirror, formula, auto_number, etc.) — they can't be
          // set via the API, so showing them in the mapper is misleading.
          if (parsed.kind === "monday_export") {
            const READ_ONLY_TYPES = new Set([
              "mirror", "board_relation", "dependency", "creation_log",
              "formula", "auto_number", "item_id", "last_updated",
              "lookup", "color_picker", "button", "file",
            ]);
            const readOnlyTitles = new Set(
              bCols
                .filter((c) => READ_ONLY_TYPES.has(c.type))
                .map((c) => c.title.toLowerCase()),
            );
            setParentMappings((prev) =>
              prev.filter((m) => !readOnlyTitles.has(m.fileColumn.toLowerCase())),
            );
          }

          setStep("map");
        } catch (err) {
          setError(`Failed to fetch board data: ${(err as Error).message}`);
          setStep("map");
        } finally {
          setLoading(false);
        }
      } else {
        setStep("map");
      }
    },
    [boardId, token],
  );

  const getImportCounts = () => {
    if (!file) return { parents: 0, subitems: 0, total: 0 };
    if (file.kind === "monday_export") {
      const parentCount = includeParents
        ? file.groups.reduce((s, g) => s + g.items.length, 0)
        : 0;
      const subitemCount = file.flatSubitems.length;
      return { parents: parentCount, subitems: subitemCount, total: parentCount + subitemCount };
    }
    return { parents: 0, subitems: file.rowCount, total: file.rowCount };
  };

  const canStartImport = (): boolean => {
    if (!file || !token || !boardId) return false;
    if (file.kind === "monday_export") {
      const counts = getImportCounts();
      return counts.total > 0;
    }
    return !!parentIdentifier.fileColumn && !!subitemNameColumn;
  };

  const handleStartImport = useCallback(async () => {
    if (!file || !token || !boardId) return;

    if (file.kind === "flat") {
      if (!parentIdentifier.fileColumn) {
        setError("Please select the file column that identifies parent items.");
        return;
      }
      if (!subitemNameColumn) {
        setError("Please select the file column for subitem names.");
        return;
      }
    }

    setError(null);
    setStep("importing");
    setLastImportBanner(null);

    const activeSubitemMappings = mappings.filter(
      (m) => m.mondayColumnId && m.mondayColumnId !== SUBITEM_NAME_SENTINEL,
    );
    const activeParentMappings = parentMappings.filter(
      (m) => m.mondayColumnId,
    );

    // Seed progress with pending rows so the UI renders immediately and
    // onRowUpdate has something to mutate (the underlying runXXXImport
    // functions create their own internal progress, but we need a React
    // state copy to drive re-renders).
    const totalRows =
      file.kind === "monday_export"
        ? (includeParents
            ? file.groups.reduce((s, g) => s + g.items.length, 0)
            : 0) + file.flatSubitems.length
        : file.rows.length;

    const initialProgress: ImportProgressType = {
      total: totalRows,
      completed: 0,
      succeeded: 0,
      failed: 0,
      rows: Array.from({ length: totalRows }, (_, i) => ({
        rowIndex: i,
        kind: "subitem" as const,
        itemName: "",
        parentItemId: "",
        subitemName: "",
        status: "pending" as const,
      })),
    };
    setProgress(initialProgress);

    // Local live copy so onBatchComplete can persist the current snapshot
    // without racing React's setState cycle.
    const liveProgress: ImportProgressType = {
      ...initialProgress,
      rows: initialProgress.rows.map((r) => ({ ...r })),
    };

    const progressCallbacks = {
      onRowUpdate: (rowIndex: number, update: Partial<ImportProgressType["rows"][0]>) => {
        if (rowIndex >= 0 && rowIndex < liveProgress.rows.length) {
          liveProgress.rows[rowIndex] = {
            ...liveProgress.rows[rowIndex],
            ...update,
          };
        }
        setProgress((prev) => {
          if (!prev) return prev;
          const rows = [...prev.rows];
          if (rowIndex < 0 || rowIndex >= rows.length) return prev;
          rows[rowIndex] = { ...rows[rowIndex], ...update };
          const succeeded = rows.filter((r) => r.status === "success").length;
          const failed = rows.filter((r) => r.status === "error").length;
          return { ...prev, rows, completed: succeeded + failed, succeeded, failed };
        });
      },
      onBatchComplete: () => {
        const succeeded = liveProgress.rows.filter((r) => r.status === "success").length;
        const failed = liveProgress.rows.filter((r) => r.status === "error").length;
        liveProgress.succeeded = succeeded;
        liveProgress.failed = failed;
        liveProgress.completed = succeeded + failed;
        void saveImportProgress({
          progress: liveProgress,
          finished: false,
          fileName: file.fileName,
          boardId,
        });
      },
    };

    try {
      let result: ImportProgressType;

      if (file.kind === "monday_export" && includeParents) {
        result = await runFullMondayExportImport(
          token,
          file,
          activeParentMappings,
          activeSubitemMappings,
          boardId,
          boardColumns,
          subitemColumns,
          progressCallbacks,
        );
      } else if (file.kind === "monday_export") {
        result = await runMondayExportImport(
          token,
          file,
          activeSubitemMappings,
          boardId,
          subitemColumns,
          progressCallbacks,
        );
      } else {
        result = await runImport(
          token,
          file,
          parentIdentifier,
          subitemNameColumn,
          activeSubitemMappings,
          boardId,
          subitemColumns,
          progressCallbacks,
        );
      }

      setProgress(result);
      setStep("done");
      incrementImportCount();
      void saveImportProgress({
        progress: result,
        finished: true,
        fileName: file.fileName,
        boardId,
      });
    } catch (err) {
      setError(`Import failed: ${(err as Error).message}`);
      setStep("done");
      void saveImportProgress({
        progress: liveProgress,
        finished: true,
        fileName: file.fileName,
        boardId,
      });
    }
  }, [file, token, boardId, parentIdentifier, subitemNameColumn, mappings, parentMappings, includeParents, boardColumns, subitemColumns]);

  const counts = getImportCounts();

  return (
    <div className="max-w-[840px] mx-auto px-6 py-8">
      <Header />
      <WelcomeCard />

      {error && (
        <Card className="border-destructive/50 bg-destructive/5 mb-4 animate-fade-in">
          <CardContent className="p-4">
            <p className="text-sm text-destructive font-medium mb-2">
              {error}
            </p>
            <ErrorHelpCTA />
          </CardContent>
        </Card>
      )}

      {lastImportBanner && step !== "importing" && step !== "done" && (
        <Card className="border-primary/30 bg-primary/5 mb-4 animate-fade-in">
          <CardContent className="p-4 flex items-start gap-3">
            <div className="flex-1 text-sm">
              <p className="font-medium mb-1">
                {lastImportBanner.finished ? "Last import" : "Previous import interrupted"}
                {" — "}
                <span className="text-muted-foreground font-normal">
                  {lastImportBanner.fileName}
                </span>
              </p>
              <p className="text-muted-foreground">
                {lastImportBanner.succeeded} succeeded
                {lastImportBanner.failed > 0 && `, ${lastImportBanner.failed} failed`}
                {" of "}
                {lastImportBanner.total} rows
                {" · "}
                {new Date(lastImportBanner.updatedAt).toLocaleString()}
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={dismissLastImportBanner}>
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        <TokenCard
          onTokenSaved={(t) => {
            setToken(t);
            if (t && step === "setup") setStep("upload");
          }}
        />

        <BoardCard boardId={boardId} onBoardIdChange={setBoardId} />

        {step !== "setup" && (
          <UploadCard onFileParsed={handleFileParsed} />
        )}

        {loading && (
          <Card className="animate-fade-in">
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground">
                Loading board columns...
              </p>
            </CardContent>
          </Card>
        )}

        {file && (step === "map" || step === "importing" || step === "done") && (
          <Card className="animate-fade-in animate-delay-3">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <div className="flex items-center justify-center w-6 h-6 rounded-md bg-primary/10 text-primary text-xs font-bold">
                  4
                </div>
                Preview & Map Columns
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <DataPreview file={file} />
              <ColumnMapper
                file={file}
                boardColumns={boardColumns}
                subitemColumns={subitemColumns}
                parentIdentifier={parentIdentifier}
                onParentIdentifierChange={setParentIdentifier}
                subitemNameColumn={subitemNameColumn}
                onSubitemNameColumnChange={setSubitemNameColumn}
                mappings={mappings}
                onMappingsChange={setMappings}
                parentMappings={parentMappings}
                onParentMappingsChange={setParentMappings}
                includeParents={includeParents}
                onIncludeParentsChange={setIncludeParents}
              />
              {step === "map" && (
                <Button
                  className="mt-2"
                  onClick={handleStartImport}
                  disabled={!canStartImport()}
                >
                  {counts.total === 0
                    ? "Nothing to Import"
                    : counts.parents > 0
                      ? `Start Import (${counts.parents} parent${counts.parents !== 1 ? "s" : ""} + ${counts.subitems} subitem${counts.subitems !== 1 ? "s" : ""})`
                      : `Start Import (${counts.subitems} subitem${counts.subitems !== 1 ? "s" : ""})`}
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {progress && (step === "importing" || step === "done") && (
          <Card className="animate-fade-in animate-delay-4">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <div className="flex items-center justify-center w-6 h-6 rounded-md bg-primary/10 text-primary text-xs font-bold">
                  5
                </div>
                Import Progress
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ImportProgress progress={progress} isRunning={step === "importing"} />
              {step === "done" && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setFile(null);
                    setProgress(null);
                    setMappings([]);
                    setParentMappings([]);
                    setStep("upload");
                  }}
                >
                  Import Another File
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <Footer />
    </div>
  );
};
