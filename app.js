/**
 * app.js — CSV-driven data explorer bootstrap (proof-read)
 *
 * - Loads a CSV (local relative path or remote URL)
 * - Robustly parses quoted CSV fields and common missing-value tokens
 * - Initializes a Tabulator table with the parsed rows
 * - Wires up filtering, plotting (Chart.js) and CSV export (with optional metadata)
 *
 * Requirements (HTML must include):
 *  - <div id="data-table"></div>
 *  - <select id="filter-column"></select>
 *  - <select id="filter-op"></select> (operators: =, >, <, >=, <=, !=, like)
 *  - <input id="filter-val" />
 *  - <button id="apply-filter"></button>
 *  - <button id="clear-filter"></button>
 *  - <button id="download-csv"></button>
 *  - <select id="x-col"></select>
 *  - <select id="y-col"></select>
 *  - <button id="plot-scatter"></button>
 *  - <button id="plot-histogram"></button>
 *  - <canvas id="chart-area"></canvas>
 *
 * Also requires Tabulator and Chart.js to be loaded in the page (CDN or local).
 *
 * Notes:
 *  - If testing locally, serve the repo via a local web server (e.g., `python3 -m http.server`)
 *    to avoid CORS / file:// AJAX issues.
 *  - This file is written to be readable and easy to adapt.
 */

/* ---------- Configuration (customize this) ---------- */
// relative path within repo (e.g. "data/iris.csv") OR an external URL
const dataURL = "data/iris.csv";

/* Missing value tokens (case-insensitive) that should be treated as "no value" (null) */
const MISSING_TOKENS = new Set(["", "na", "n/a", "nan", "-999", "-999.0", "null"]);

/* ---------- Lightweight CSV parser that handles quoted fields ---------- */
/**
 * parseCSV
 * - Accepts CSV text and returns an array of objects (rows).
 * - Handles:
 *    - quoted fields (with doubled quotes "" for literal ")
 *    - empty fields
 *    - common missing tokens mapped to null
 *    - numeric conversion where appropriate
 *
 * This parser is intentionally small and easy to read. It is not a full RFC4180 parser,
 * but it covers the common formats used for scientific CSVs.
 */
function parseCSV(csvText) {
  if (typeof csvText !== "string") return [];

  // Normalize line endings and remove leading/trailing whitespace
  const lines = csvText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim().split("\n");
  if (lines.length === 0) return [];

  // Regex to capture fields:
  //  - "quoted""value""..."  (double double-quotes become a single quote when unescaped)
  //  - or unquoted fields that contain any characters except comma
  const fieldRegex = /(?:"((?:[^"]|"")*)"|([^,]*))(?:,|$)/g;

  // Helper to extract fields from one CSV line
  function extractFields(line) {
    const fields = [];
    let match;
    fieldRegex.lastIndex = 0;
    while ((match = fieldRegex.exec(line)) !== null) {
      let value = match[1] !== undefined ? match[1] : match[2] !== undefined ? match[2] : "";
      // If this was matched as a quoted field, it may contain doubled quotes ("")
      if (match[1] !== undefined) {
        value = value.replace(/""/g, '"'); // unescape doubled quotes
      }
      fields.push(value);
    }
    // If the line ends with a trailing comma, last field may be missing; ensure correct length
    return fields;
  }

  // Parse header
  const headerLine = lines[0];
  const rawHeaders = extractFields(headerLine);
  const headers = rawHeaders.map(h => h.trim());

  // Parse rows
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    // Skip empty lines (safe-guard)
    if (lines[i].trim() === "") continue;

    const rawFields = extractFields(lines[i]);
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      const key = headers[j] || `col_${j + 1}`; // fallback if header missing
      let rawVal = rawFields[j] !== undefined ? rawFields[j].trim() : "";

      // Normalize common missing tokens (case-insensitive)
      const norm = rawVal.trim().toLowerCase();
      if (MISSING_TOKENS.has(norm)) {
        row[key] = null;
        continue;
      }

      // Try numeric conversion:
      // - Use Number() and check for NaN. Will accept values like ".2", "1e3", "-3.5".
      // - But protect against values like "1,000" which Number("1,000") => NaN (left as string).
      const num = Number(rawVal);
      if (!Number.isNaN(num) && /[0-9]/.test(rawVal)) {
        row[key] = num;
      } else {
        // Non-numeric: keep as string; preserve empty string as null
        row[key] = rawVal === "" ? null : rawVal;
      }
    }
    rows.push(row);
  }

  return rows;
}

/* ---------- Utility: Populate select controls with column names ---------- */
function populateSelectors(headers) {
  // Helpers to safely get elements (they may not exist depending on UI)
  function safeEl(id) {
    return document.getElementById(id) || null;
  }

  const filterCol = safeEl("filter-column");
  const xSel = safeEl("x-col");
  const ySel = safeEl("y-col");

  if (!headers || headers.length === 0) return;

  const addOptions = (sel) => {
    if (!sel) return;
    // Clear existing
    sel.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.text = "-- select --";
    sel.appendChild(placeholder);
    headers.forEach(h => {
      const opt = document.createElement("option");
      opt.value = h;
      opt.text = h;
      sel.appendChild(opt);
    });
  };

  addOptions(filterCol);
  addOptions(xSel);
  addOptions(ySel);
}

/* ---------- CSV download helper (with optional metadata) ---------- */
function downloadFilteredCSVWithMetadata(tableInstance, filename = "exported-data.csv", metadata = {}) {
  if (!tableInstance || typeof tableInstance.getRows !== "function") {
    alert("Table is not initialized.");
    return;
  }

  const visibleRows = tableInstance.getData(); // Tabulator method returns visible (filtered) rows
  if (!visibleRows || visibleRows.length === 0) {
    alert("No rows available to export (filtered view is empty).");
    return;
  }

  const fields = Object.keys(visibleRows[0]);
  // Build CSV body
  const csvRows = [
    fields.map(f => `"${String(f).replace(/"/g, '""')}"`).join(","),
    ...visibleRows.map(row =>
      fields.map(f => {
        const val = row[f] === null || row[f] === undefined ? "" : String(row[f]);
        return `"${val.replace(/"/g, '""')}"`;
      }).join(",")
    )
  ].join("\n");

  // Build metadata header
  const metaLines = [];
  metaLines.push(`# Export generated: ${new Date().toISOString()}`);
  if (metadata.source) metaLines.push(`# Source: ${metadata.source}`);
  if (metadata.citation) metaLines.push(`# Citation: ${metadata.citation}`);
  if (metadata.license) metaLines.push(`# License: ${metadata.license}`);
  if (metadata.contact) metaLines.push(`# Contact: ${metadata.contact}`);
  if (metadata.notes) metaLines.push(`# Notes: ${metadata.notes}`);
  metaLines.push(""); // blank line between metadata and CSV

  const finalText = metaLines.join("\n") + csvRows;

  const blob = new Blob([finalText], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/* ---------- Main initialization wrapped in DOMContentLoaded ---------- */
document.addEventListener("DOMContentLoaded", () => {
  // Keep table variable in higher scope for other handlers
  let table = null;
  let currentChart = null;

  // Attempt to load CSV via fetch, parse it, then initialize Tabulator
  fetch(dataURL, { cache: "no-store" })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Failed to fetch CSV at "${dataURL}" (status ${response.status}).` +
          `\nIf this is a relative path, ensure the file exists in the repository and that you're serving via HTTP (not file://).`);
      }
      return response.text();
    })
    .then(text => {
      const data = parseCSV(text);
      if (!data || data.length === 0) {
        throw new Error("CSV parsed but contains no rows.");
      }

      // Initialize Tabulator with empty data first to ensure the table object exists.
      // We set autoColumns:true so columns are created automatically from the first row.
      table = new Tabulator("#data-table", {
        data: data,
        autoColumns: true,
        layout: "fitDataTable",
        height: "600px",
        pagination: "local",
        paginationSize: 50,
        initialSort: [], // no sort by default; adjust if desired
      });

      // Populate selectors using keys from first row (headers)
      const headers = Object.keys(data[0]);
      populateSelectors(headers);

      // Optional: log preview for debugging
      console.log("Loaded CSV — first 5 rows:", data.slice(0, 5));
      return data;
    })
    .catch(err => {
      console.error("Error loading/parsing CSV:", err);
      const holder = document.getElementById("data-table");
      if (holder) holder.innerHTML = `<p style="color:red;">Error loading data: ${err.message}</p>`;
      return null;
    })
    .finally(() => {
      /* ---------- Wire up UI event handlers (only once) ---------- */

      // Safe getters for controls (no-op if missing)
      const get = id => document.getElementById(id) || null;

      // Filter apply
      const applyBtn = get("apply-filter");
      if (applyBtn) {
        applyBtn.addEventListener("click", () => {
          if (!table) { alert("Table not ready."); return; }
          const col = (get("filter-column") || {}).value || null;
          const op = (get("filter-op") || {}).value || null;
          let val = (get("filter-val") || {}).value || "";

          if (!col || !op) {
            alert("Please select a column and operator for filtering.");
            return;
          }

          // Convert numeric-looking filter values to numbers when possible
          const numVal = Number(val);
          const useVal = (!Number.isNaN(numVal) && val.trim() !== "") ? numVal : val;

          // Tabulator supports operators like "=", ">", "<", "!=", "like"
          // For textual 'like', we use "like" operator; for others we pass through.
          try {
            if (op === "like") {
              table.setFilter(col, "like", val);
            } else {
              table.setFilter(col, op, useVal);
            }
          } catch (e) {
            console.error("Error applying filter:", e);
            alert("Failed to apply filter — check console for details.");
          }
        });
      }

      // Clear filter
      const clearBtn = get("clear-filter");
      if (clearBtn) {
        clearBtn.addEventListener("click", () => {
          if (!table) return;
          table.clearFilter();
          const fc = get("filter-column"); if (fc) fc.value = "";
          const fv = get("filter-val"); if (fv) fv.value = "";
        });
      }

      // Download CSV (with basic metadata demonstration)
      const downloadBtn = get("download-csv");
      if (downloadBtn) {
        downloadBtn.addEventListener("click", () => {
          if (!table) { alert("Table not ready."); return; }
          const metadata = {
            source: dataURL,
            citation: "",    // repository owner should fill this in or load from a config
            license: "Specify license in README (e.g. CC BY 4.0)",
            contact: "",
            notes: "Exported subset from the web UI"
          };
          downloadFilteredCSVWithMetadata(table, "exported-data.csv", metadata);
        });
      }

      // Plotting helpers
      const plotScatterBtn = get("plot-scatter");
      const plotHistBtn = get("plot-histogram");
      const chartCanvas = get("chart-area");

      function destroyChart() {
        if (currentChart) {
          try { currentChart.destroy(); } catch (e) { /* ignore */ }
          currentChart = null;
        }
      }

      if (plotScatterBtn && chartCanvas) {
        plotScatterBtn.addEventListener("click", () => {
          if (!table) { alert("Table not ready."); return; }
          const xCol = (get("x-col") || {}).value || null;
          const yCol = (get("y-col") || {}).value || null;
          if (!xCol || !yCol) { alert("Please select X and Y columns."); return; }

          const rows = table.getData(); // current filtered/sorted data
          const points = [];
          rows.forEach(r => {
            const xv = r[xCol];
            const yv = r[yCol];
            const xn = Number(xv);
            const yn = Number(yv);
            if (!Number.isNaN(xn) && !Number.isNaN(yn)) {
              points.push({ x: xn, y: yn });
            }
          });

          if (points.length === 0) {
            alert("Selected columns do not contain numeric data to plot.");
            return;
          }

          destroyChart();
          const ctx = chartCanvas.getContext("2d");
          currentChart = new Chart(ctx, {
            type: "scatter",
            data: {
              datasets: [{
                label: `${yCol} vs ${xCol}`,
                data: points,
                pointRadius: 4,
                // styling is optional; users can change in CSS or here
              }]
            },
            options: {
              responsive: true,
              scales: {
                x: { title: { display: true, text: xCol } },
                y: { title: { display: true, text: yCol } }
              }
            }
          });
        });
      }

      if (plotHistBtn && chartCanvas) {
        plotHistBtn.addEventListener("click", () => {
          if (!table) { alert("Table not ready."); return; }
          const col = (get("x-col") || {}).value || null; // use X selector for histogram
          if (!col) { alert("Please select a column (X) for histogram."); return; }

          const rows = table.getData();
          const values = rows.map(r => Number(r[col])).filter(v => !Number.isNaN(v));
          if (!values || values.length === 0) {
            alert("Selected column does not contain numeric data.");
            return;
          }

          // Basic equal-width binning (10 bins by default)
          const binsCount = 10;
          const min = Math.min(...values);
          const max = Math.max(...values);
          const range = max - min || 1; // avoid division by zero
          const bins = Array(binsCount).fill(0);
          values.forEach(v => {
            let idx = Math.floor(((v - min) / range) * binsCount);
            if (idx >= binsCount) idx = binsCount - 1;
            if (idx < 0) idx = 0;
            bins[idx]++;
          });
          const labels = bins.map((_, i) => {
            const left = min + (i * range / binsCount);
            const right = min + ((i + 1) * range / binsCount);
            return `${left.toFixed(2)}–${right.toFixed(2)}`;
          });

          destroyChart();
          const ctx = chartCanvas.getContext("2d");
          currentChart = new Chart(ctx, {
            type: "bar",
            data: {
              labels: labels,
              datasets: [{ label: `${col} (count)`, data: bins }]
            },
            options: {
              responsive: true,
              scales: {
                x: { title: { display: true, text: col } },
                y: { title: { display: true, text: "Count" } }
              }
            }
          });
        });
      }
    }); // end finally
});
