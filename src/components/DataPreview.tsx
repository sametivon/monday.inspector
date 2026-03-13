import React from "react";
import type {
  ParsedFile,
  ParsedFileFlat,
  ParsedFileMondayExport,
} from "../utils/types";

interface DataPreviewProps {
  file: ParsedFile;
}

const MAX_PREVIEW_ROWS = 15;
const MAX_PREVIEW_GROUPS = 5;
const MAX_PREVIEW_ITEMS_PER_GROUP = 10;

export const DataPreview: React.FC<DataPreviewProps> = ({ file }) => {
  if (file.kind === "monday_export") {
    return <MondayExportPreview file={file} />;
  }
  return <FlatPreview file={file} />;
};

// ── Monday.com export: hierarchical tree view ─────────────────────────

const MondayExportPreview: React.FC<{ file: ParsedFileMondayExport }> = ({
  file,
}) => {
  const totalParents = file.groups.reduce((s, g) => s + g.items.length, 0);

  return (
    <div className="data-preview">
      <h3>
        📊 Monday.com Export — <em>{file.boardName}</em>
      </h3>
      <div className="preview-badges">
        <span className="badge">{file.groups.length} group{file.groups.length !== 1 ? "s" : ""}</span>
        <span className="badge">{totalParents} parent item{totalParents !== 1 ? "s" : ""}</span>
        <span className="badge accent">{file.flatSubitems.length} subitem{file.flatSubitems.length !== 1 ? "s" : ""} to import</span>
      </div>

      {/* ── Tree view ──────────────────────────────────────────── */}
      <div className="export-tree">
        {file.groups.slice(0, MAX_PREVIEW_GROUPS).map((group, groupIdx) => (
          <div key={`group-${groupIdx}-${group.groupName}`} className="tree-group">
            <div className="tree-group-name">📁 {group.groupName}</div>
            {group.items.slice(0, MAX_PREVIEW_ITEMS_PER_GROUP).map((item, idx) => (
              <div key={`item-${groupIdx}-${idx}-${item.name}`} className="tree-item">
                <div className="tree-item-name">
                  📋 {item.name}
                  {item.subitems.length > 0 && (
                    <span className="subitem-count">
                      ({item.subitems.length} subitem{item.subitems.length !== 1 ? "s" : ""})
                    </span>
                  )}
                  {item.subitems.length === 0 && (
                    <span className="no-subitems">— no subitems</span>
                  )}
                </div>
                {item.subitems.map((sub, si) => (
                  <div key={`sub-${groupIdx}-${idx}-${si}-${sub.name}`} className="tree-subitem">
                    <span className="tree-connector">└─</span>
                    <span className="tree-subitem-name">{sub.name}</span>
                    {Object.entries(sub.values).map(([k, v]) =>
                      v ? (
                        <span key={k} className="tree-subitem-tag">
                          {k}: {v}
                        </span>
                      ) : null,
                    )}
                  </div>
                ))}
              </div>
            ))}
            {group.items.length > MAX_PREVIEW_ITEMS_PER_GROUP && (
              <p className="preview-note" style={{ marginLeft: 16 }}>
                ...and {group.items.length - MAX_PREVIEW_ITEMS_PER_GROUP} more items in this group
              </p>
            )}
          </div>
        ))}
        {file.groups.length > MAX_PREVIEW_GROUPS && (
          <p className="preview-note">
            ...and {file.groups.length - MAX_PREVIEW_GROUPS} more groups
          </p>
        )}
      </div>

      {/* ── Flat table of subitems that will be imported ──────── */}
      {file.flatSubitems.length > 0 && (
        <>
          <h4 style={{ marginTop: 16 }}>
            Flattened subitems for import ({file.flatSubitems.length} rows)
          </h4>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Group</th>
                  <th>Parent Item</th>
                  <th>Subitem Name</th>
                  {file.subitemHeaders
                    .filter((h) => h !== "Name")
                    .map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {file.flatSubitems.slice(0, MAX_PREVIEW_ROWS).map((row, i) => (
                  <tr key={i}>
                    <td className="row-num">{i + 1}</td>
                    <td>{row.groupName}</td>
                    <td>
                      <strong>{row.parentItemName}</strong>
                    </td>
                    <td>{row.subitemName}</td>
                    {file.subitemHeaders
                      .filter((h) => h !== "Name")
                      .map((h) => (
                        <td key={h}>{row.values[h] ?? ""}</td>
                      ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {file.flatSubitems.length > MAX_PREVIEW_ROWS && (
            <p className="preview-note">
              Showing first {MAX_PREVIEW_ROWS} of {file.flatSubitems.length} rows
            </p>
          )}
        </>
      )}
    </div>
  );
};

// ── Flat file: simple table ───────────────────────────────────────────

const FlatPreview: React.FC<{ file: ParsedFileFlat }> = ({ file }) => {
  const previewRows = file.rows.slice(0, MAX_PREVIEW_ROWS);

  return (
    <div className="data-preview">
      <h3>
        📄 {file.fileName} — {file.rowCount} row{file.rowCount !== 1 ? "s" : ""}
      </h3>
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>#</th>
              {file.headers.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, i) => (
              <tr key={i}>
                <td className="row-num">{i + 1}</td>
                {file.headers.map((h) => (
                  <td key={h}>{row[h] ?? ""}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {file.rowCount > MAX_PREVIEW_ROWS && (
        <p className="preview-note">
          Showing first {MAX_PREVIEW_ROWS} of {file.rowCount} rows
        </p>
      )}
    </div>
  );
};
