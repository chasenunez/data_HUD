/**
 * app.js — working, proof-read version (fixed "Invalid array length")
 */

const dataURL = "data/iris.csv"; // local or remote CSV path
const MISSING_TOKENS = new Set(["", "na", "n/a", "nan", "-999", "-999.0", "null"]);

// Fixed CSV parser
function parseCSV(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length === 0) return [];

  // Clean header
  const headers = lines[0]
    .split(",")
    .map(h => h.replace(/^"|"$/g, "").trim());

  const data = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    // Use regex to correctly split quoted or unquoted fields
    const values = [];
    let match;
    const re = /("([^"]*(?:""[^"]*)*)"|[^,]*)(,|$)/g;
    while ((match = re.exec(line)) !== null) {
      let value = match[2] !== undefined ? match[2] : match[1];
      value = value.replace(/""/g, '"').trim();
      values.push(value);
    }

    // Skip malformed rows
    if (values.length === 0) continue;

    const row = {};
    headers.forEach((h, idx) => {
      let v = values[idx] ?? "";
      const norm = v.toLowerCase();
      if (MISSING_TOKENS.has(norm)) {
        row[h] = null;
      } else {
        const num = Number(v);
        row[h] = !isNaN(num) && v !== "" ? num : v;
      }
    });
    data.push(row);
  }

  return data;
}

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  let table = null;
  let currentChart = null;

  fetch(dataURL)
    .then(resp => {
      if (!resp.ok) throw new Error(`Cannot fetch ${dataURL}`);
      return resp.text();
    })
    .then(csvText => {
      const data = parseCSV(csvText);
      console.log("Parsed rows:", data.slice(0, 5));

      if (data.length === 0) throw new Error("CSV file appears empty");

      // Initialize Tabulator
      table = new Tabulator("#data-table", {
        data: data,
        autoColumns: true,
        layout: "fitDataTable",
        height: "600px",
        pagination: "local",
        paginationSize: 50,
      });

      // Populate selectors
      const cols = Object.keys(data[0]);
      const selIds = ["filter-column", "x-col", "y-col"];
      selIds.forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        sel.innerHTML = `<option value="">--select--</option>`;
        cols.forEach(c => {
          const opt = document.createElement("option");
          opt.value = c;
          opt.text = c;
          sel.appendChild(opt);
        });
      });
    })
    .catch(err => {
      console.error(err);
      document.querySelector("#data-table").innerHTML =
        `<p style="color:red;">Error loading data: ${err.message}</p>`;
    });

  // Filter logic
  document.getElementById("apply-filter").onclick = () => {
    if (!table) return;
    const col = document.getElementById("filter-column").value;
    const op = document.getElementById("filter-op").value;
    const val = document.getElementById("filter-val").value;
    if (col && op) table.setFilter(col, op, val);
  };
  document.getElementById("clear-filter").onclick = () => {
    if (!table) return;
    table.clearFilter();
  };

  // CSV download
  document.getElementById("download-csv").onclick = () => {
    if (table) table.download("csv", "exported-data.csv");
  };

  // Plot scatter
  document.getElementById("plot-scatter").onclick = () => {
    if (!table) return;
    const xCol = document.getElementById("x-col").value;
    const yCol = document.getElementById("y-col").value;
    if (!xCol || !yCol) return alert("Select X and Y columns first");

    const rows = table.getData();
    const points = rows
      .map(r => ({ x: +r[xCol], y: +r[yCol] }))
      .filter(p => !isNaN(p.x) && !isNaN(p.y));

    if (points.length === 0) return alert("No numeric data to plot");

    if (currentChart) currentChart.destroy();
    const ctx = document.getElementById("chart-area").getContext("2d");
    currentChart = new Chart(ctx, {
      type: "scatter",
      data: {
        datasets: [{
          label: `${yCol} vs ${xCol}`,
          data: points,
          backgroundColor: "rgba(50, 100, 150, 0.7)"
        }]
      },
      options: {
        scales: {
          x: { title: { display: true, text: xCol } },
          y: { title: { display: true, text: yCol } }
        }
      }
    });
  };

  // Plot histogram
  document.getElementById("plot-histogram").onclick = () => {
    if (!table) return;
    const col = document.getElementById("x-col").value;
    const values = table.getData()
      .map(r => +r[col])
      .filter(v => !isNaN(v));

    if (values.length === 0) return alert("Column must be numeric");

    const bins = 10;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const counts = Array(bins).fill(0);
    values.forEach(v => {
      let i = Math.floor(((v - min) / range) * bins);
      if (i >= bins) i = bins - 1;
      counts[i]++;
    });
    const labels = counts.map((_, i) =>
      (min + (i + 0.5) * range / bins).toFixed(1)
    );

    if (currentChart) currentChart.destroy();
    const ctx = document.getElementById("chart-area").getContext("2d");
    currentChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [{ label: col, data: counts }]
      },
      options: {
        scales: {
          x: { title: { display: true, text: col } },
          y: { title: { display: true, text: "Count" } }
        }
      }
    });
  };
});
