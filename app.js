/**
 * app.js — CSV-driven data explorer (updated: explicit Tabulator columns)
 *
 * Key change: instead of autoColumns, we explicitly build Tabulator `columns`
 * from the parsed objects so fields and formatting are guaranteed to match.
 */

/* ---------- CONFIG ---------- */
const dataURL = "data/iris.csv";
const MISSING_TOKENS = new Set(["", "na", "n/a", "nan", "-999", "-999.0", "null"]);
const DEFAULT_HIST_BINS = 10;

/* ---------- Helpers (CSV parser etc.) ---------- */
function removeBOM(text) { if (typeof text === "string" && text.charCodeAt(0) === 0xFEFF) return text.slice(1); return text; }

function parseCSVToRows(csvText) {
  csvText = csvText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  csvText = removeBOM(csvText);
  const rows = [];
  let cur = "";
  let row = [];
  let inQuotes = false;
  let i = 0;
  while (i < csvText.length) {
    const ch = csvText[i];
    if (inQuotes) {
      if (ch === '"') {
        const next = csvText[i + 1];
        if (next === '"') { cur += '"'; i += 2; continue; } else { inQuotes = false; i++; continue; }
      } else { cur += ch; i++; continue; }
    } else {
      if (ch === '"') { inQuotes = true; i++; continue; }
      if (ch === ",") { row.push(cur); cur = ""; i++; continue; }
      if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; i++; continue; }
      cur += ch; i++; continue;
    }
  }
  // finalize
  row.push(cur);
  // If last row is empty because file ended with newline and previous line was pushed, avoid duplicate empty row
  if (!(row.length === 1 && row[0] === "" && rows.length > 0 && rows[rows.length - 1].length === 0)) rows.push(row);
  return rows;
}

function rowsToObjects(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const headers = rows[0].map(h => String(h).trim());
  const headerCount = headers.length;
  const objects = [];
  for (let r = 1; r < rows.length; r++) {
    const rawRow = rows[r];
    // skip fully empty rows
    const allEmpty = rawRow.every(cell => (cell === undefined || String(cell).trim() === ""));
    if (allEmpty) continue;
    const fields = [];
    for (let c = 0; c < headerCount; c++) fields.push(rawRow[c] !== undefined ? String(rawRow[c]).trim() : "");
    const obj = {};
    for (let c = 0; c < headerCount; c++) {
      const rawVal = fields[c];
      const norm = rawVal.trim().toLowerCase();
      if (MISSING_TOKENS.has(norm)) { obj[headers[c]] = null; continue; }
      const numericLike = /^[+-]?(?:\d+|\d*\.\d+)(?:[eE][+-]?\d+)?$/.test(rawVal);
      if (numericLike) {
        const num = Number(rawVal);
        obj[headers[c]] = Number.isFinite(num) ? num : rawVal;
      } else {
        obj[headers[c]] = rawVal === "" ? null : rawVal;
      }
    }
    objects.push(obj);
  }
  return objects;
}

/* ---------- DOM helper ---------- */
const $ = id => document.getElementById(id) || null;

/* ---------- CSV download with metadata helper ---------- */
function downloadCSVWithMetadata(rowsArray, filename = "exported-data.csv", metadata = {}) {
  if (!Array.isArray(rowsArray) || rowsArray.length === 0) { alert("No rows to export."); return; }
  const fields = Object.keys(rowsArray[0]);
  const csvLines = [];
  csvLines.push(fields.map(f => `"${String(f).replace(/"/g, '""')}"`).join(","));
  rowsArray.forEach(row => {
    csvLines.push(fields.map(f => {
      const v = row[f] === null || row[f] === undefined ? "" : String(row[f]);
      return `"${v.replace(/"/g, '""')}"`;
    }).join(","));
  });
  const meta = [];
  meta.push(`# Export generated: ${new Date().toISOString()}`);
  if (metadata.source) meta.push(`# Source: ${metadata.source}`);
  if (metadata.citation) meta.push(`# Citation: ${metadata.citation}`);
  if (metadata.license) meta.push(`# License: ${metadata.license}`);
  meta.push("");
  const blob = new Blob([meta.join("\n") + csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/* ---------- Main ---------- */
document.addEventListener("DOMContentLoaded", () => {
  let table = null;
  let currentChart = null;

  const tableHolder = $("data-table");
  const filterColumnEl = $("filter-column");
  const filterOpEl = $("filter-op");
  const filterValEl = $("filter-val");
  const applyFilterBtn = $("apply-filter");
  const clearFilterBtn = $("clear-filter");
  const downloadBtn = $("download-csv");
  const xSelect = $("x-col");
  const ySelect = $("y-col");
  const plotScatterBtn = $("plot-scatter");
  const plotHistBtn = $("plot-histogram");
  const chartCanvas = $("chart-area");

  // Fetch CSV
  fetch(dataURL, { cache: "no-store" })
    .then(resp => {
      if (!resp.ok) throw new Error(`Failed to fetch CSV '${dataURL}': ${resp.status} ${resp.statusText}`);
      return resp.text();
    })
    .then(text => {
      const rows = parseCSVToRows(text);
      if (!rows || rows.length === 0) throw new Error("CSV parsed to zero rows.");
      const objects = rowsToObjects(rows);
      if (!objects || objects.length === 0) throw new Error("No data rows after cleaning.");

      // --- DIAGNOSTIC: show structure in console (helps debug missing cells) ---
      console.group("CSV Diagnostics");
      console.log("Headers:", Object.keys(objects[0]));
      console.table(objects.slice(0, 8)); // shows types & values for first rows
      console.groupEnd();

      // Ensure keys are trimmed and consistent
      const headers = Object.keys(objects[0]).map(h => h.trim());

      // Force numeric conversion for any column that looks numeric in most rows
      const isNumericColumn = {};
      const sampleSize = Math.min(objects.length, 20);
      headers.forEach(h => {
        let numericCount = 0;
        for (let i = 0; i < sampleSize; i++) {
          if (objects[i] && typeof objects[i][h] === "number") numericCount++;
        }
        isNumericColumn[h] = (numericCount / sampleSize) >= 0.6; // majority numeric -> treat as numeric
      });

      // Build explicit Tabulator columns
      const columns = headers.map(h => {
        const numeric = !!isNumericColumn[h];
        return {
          title: h,
          field: h,
          hozAlign: numeric ? "right" : "left",
          headerFilter: "input",
          sorter: numeric ? "number" : "string",
          // Use plaintext formatter to avoid surprises
          formatter: "plaintext",
          // widthGrow for flexible layout (optional)
          widthGrow: numeric ? 1 : 2,
        };
      });

      // Initialize Tabulator with explicit columns (no autoColumns)
      if (tableHolder) {
        // Clear existing content if any
        tableHolder.innerHTML = "";
        table = new Tabulator("#data-table", {
          data: objects,
          columns: columns,
          layout: "fitDataTable",
          height: "600px",
          pagination: "local",
          paginationSize: 50,
        });
      } else {
        console.warn("No #data-table element found; skipping Tabulator init.");
      }

      // Populate selectors
      if (filterColumnEl) {
        filterColumnEl.innerHTML = `<option value="">-- select column --</option>`;
        headers.forEach(h => filterColumnEl.appendChild(new Option(h, h)));
      }
      if (xSelect) { xSelect.innerHTML = `<option value="">-- select X --</option>`; headers.forEach(h => xSelect.appendChild(new Option(h, h))); }
      if (ySelect) { ySelect.innerHTML = `<option value="">-- select Y --</option>`; headers.forEach(h => ySelect.appendChild(new Option(h, h))); }

    })
    .catch(err => {
      console.error("Error loading/parsing CSV:", err);
      if (tableHolder) tableHolder.innerHTML = `<p style="color:red;">Error loading data: ${err.message}</p>`;
    });

  /* ---------- UI handlers ---------- */

  if (applyFilterBtn) {
    applyFilterBtn.addEventListener("click", () => {
      if (!table) { alert("Table not ready."); return; }
      const col = filterColumnEl ? filterColumnEl.value : null;
      const op = filterOpEl ? filterOpEl.value : null;
      const raw = filterValEl ? filterValEl.value : "";
      if (!col || !op) { alert("Select a column and operator."); return; }
      const numericLike = /^[+-]?(?:\d+|\d*\.\d+)(?:[eE][+-]?\d+)?$/.test(raw.trim());
      const val = numericLike ? Number(raw) : raw;
      try {
        if (op === "like") table.setFilter(col, "like", String(raw));
        else table.setFilter(col, op, val);
      } catch (e) { console.error("Filter error:", e); alert("Failed to apply filter (see console)."); }
    });
  }

  if (clearFilterBtn) {
    clearFilterBtn.addEventListener("click", () => { if (!table) return; table.clearFilter(); if (filterColumnEl) filterColumnEl.value = ""; if (filterValEl) filterValEl.value = ""; });
  }

  if (downloadBtn) {
    downloadBtn.addEventListener("click", () => {
      if (!table) { alert("Table not ready."); return; }
      const visible = table.getData();
      downloadCSVWithMetadata(visible, "exported-data.csv", { source: dataURL, license: "See README" });
    });
  }

  function destroyChart() { if (currentChart) { try { currentChart.destroy(); } catch (e) {} currentChart = null; } }

  if (plotScatterBtn) {
    plotScatterBtn.addEventListener("click", () => {
      if (!table) { alert("Table not ready."); return; }
      if (!xSelect || !ySelect) { alert("Plot selectors missing."); return; }
      const xCol = xSelect.value; const yCol = ySelect.value;
      if (!xCol || !yCol) { alert("Select X and Y columns."); return; }
      const rows = table.getData();
      const pts = rows.map(r => ({ x: Number(r[xCol]), y: Number(r[yCol]) })).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
      if (!pts.length) { alert("No numeric pairs found."); return; }
      if (!chartCanvas) { alert("Chart canvas missing."); return; }
      destroyChart();
      const ctx = chartCanvas.getContext("2d");
      currentChart = new Chart(ctx, { type: "scatter", data: { datasets: [{ label: `${yCol} vs ${xCol}`, data: pts, pointRadius: 4 }] }, options: { responsive: true, scales: { x: { title: { display: true, text: xCol } }, y: { title: { display: true, text: yCol } } } } });
    });
  }

  if (plotHistBtn) {
    plotHistBtn.addEventListener("click", () => {
      if (!table) { alert("Table not ready."); return; }
      if (!xSelect) { alert("X selector missing."); return; }
      const col = xSelect.value;
      if (!col) { alert("Select column (X) for histogram."); return; }
      const rows = table.getData();
      const vals = rows.map(r => Number(r[col])).filter(v => Number.isFinite(v));
      if (!vals.length) { alert("No numeric values found."); return; }
      if (!chartCanvas) { alert("Chart canvas missing."); return; }
      const bins = DEFAULT_HIST_BINS;
      const min = Math.min(...vals); const max = Math.max(...vals); const range = max - min || 1;
      const counts = new Array(bins).fill(0);
      vals.forEach(v => { let i = Math.floor(((v - min) / range) * bins); if (i >= bins) i = bins - 1; if (i < 0) i = 0; counts[i]++; });
      const labels = counts.map((_, i) => { const left = min + (i * range / bins); const right = min + ((i + 1) * range / bins); return `${left.toFixed(2)}–${right.toFixed(2)}`; });
      destroyChart();
      const ctx = chartCanvas.getContext("2.0") || chartCanvas.getContext("2d");
      currentChart = new Chart(ctx, { type: "bar", data: { labels, datasets: [{ label: `${col} (count)`, data: counts }] }, options: { responsive: true, scales: { x: { title: { display: true, text: col } }, y: { title: { display: true, text: "Count" } } } } });
    });
  }

}); // DOMContentLoaded end
