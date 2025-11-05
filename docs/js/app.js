/* app.js - front-end for data explorer
   Dependencies: Tabulator (6.x), PapaParse (optional)
*/

async function loadJSON(path){
  const r = await fetch(path);
  if(!r.ok) throw new Error(`Failed to load ${path}: ${r.status}`);
  return r.json();
}

async function main(){
  // Load site config (branding, font, colors) - default fallback if missing
  let config = {
    title: "Data Explorer",
    subtitle: "",
    logo: "",
    font: "",
    primary_color: "#1b3550",
    background_color: "#ffffff",
    table_options: {}
  };
  try {
    const cfg = await loadJSON("config.json");
    config = {...config, ...cfg};
  } catch(e){
    console.warn("No config.json found - using defaults", e);
  }

  // Apply branding (colors/fonts)
  document.getElementById("title").textContent = config.title || "Data Explorer";
  if(config.subtitle) document.getElementById("subtitle").textContent = config.subtitle;
  if(config.logo){
    const logoEl = document.getElementById("logo");
    logoEl.src = config.logo;
    logoEl.style.display = "inline-block";
  }
  if(config.primary_color) document.documentElement.style.setProperty('--brand-fore', config.primary_color);
  if(config.background_color) document.documentElement.style.setProperty('--brand-bg', config.background_color);
  if(config.font) document.body.style.fontFamily = config.font;

  // Load metadata, columns, data
  let metadata = {};
  try { metadata = await loadJSON("metadata.json"); } catch(e) { console.warn("metadata.json not found") }

  let columns = [];
  try { columns = await loadJSON("columns.json"); } catch(e) { console.warn("columns.json not found"); }

  // If columns.json doesn't exist, we will infer from data later.
  // Load data.json (preferred) otherwise fallback to CSV
  let data = [];
  try {
    data = await loadJSON("data.json");
  } catch(e) {
    console.warn("data.json not found, trying to load CSV via data.csv");
    // try CSV
    try {
      const csvResp = await fetch("data.csv");
      const text = await csvResp.text();
      const parsed = Papa.parse(text, {header:true, dynamicTyping:true, skipEmptyLines:true});
      data = parsed.data;
      // infer columns
      if(!columns.length){
        columns = Object.keys(data[0] || {}).map(k => ({title:k, field:k, headerFilter:true}));
      }
    } catch(err){
      console.error("Failed to load any data file:", err);
      return;
    }
  }

  // Insert metadata into UI
  const metaPre = document.getElementById("metadata-pre");
  metaPre.textContent = JSON.stringify(metadata, null, 2);

  // Build Tabulator table
  const table = new Tabulator("#table", {
    data: data,
    layout: "fitColumns",
    responsiveLayout: "hide",
    tooltips: true,
    pagination: true,
    paginationSize: 25,
    columns: columns.length ? columns : (data.length ? Object.keys(data[0]).map(k=>({title:k,field:k,headerFilter:true})) : []),
    // allow copy/paste
    selectable: true,
    // enable column header filters by column definitions above
    ...config.table_options
  });

  // Quick search (global filter)
  const qs = document.getElementById("quick-search");
  qs.addEventListener("input", () => {
    const v = qs.value;
    if(!v) { table.clearFilter(true); return; }
    table.setFilter([
      {field:"", type:"like", value:v} // global search
    ]);
  });

  // Column select for convenience
  const colSelect = document.getElementById("column-select");
  colSelect.innerHTML = "<option value=''>-- Choose column to filter --</option>";
  table.getColumns().forEach(col => {
    const fld = col.getField();
    const opt = document.createElement("option");
    opt.value = fld; opt.textContent = fld;
    colSelect.appendChild(opt);
  });

  document.getElementById("clear-filters").addEventListener("click", () => {
    table.clearFilter(true);
    qs.value = "";
  });

  // Logo upload preview (client-side only)
  const logoUpload = document.getElementById("logo-upload");
  logoUpload.addEventListener("change", (ev) => {
    const f = ev.target.files[0];
    if(!f) return;
    const url = URL.createObjectURL(f);
    const logoEl = document.getElementById("logo");
    logoEl.src = url;
    logoEl.style.display = "inline-block";
    // NOTE: To persist the logo to the site, you must add it to the repository (or host it on S3/remote)
    alert("Logo preview updated locally in your browser. To persist it to the site, add the image to the repo and update config.json.");
  });

  // Download handlers - inject metadata at top of CSV when exporting
  function buildCSVWithMetadata(rows, columnsArr){
    // Build CSV from rows and columns; prepend metadata lines beginning with '#'
    let metaLines = [];
    if(metadata.citation) metaLines.push(`# citation: ${metadata.citation}`);
    if(metadata.license) metaLines.push(`# license: ${metadata.license}`);
    if(metadata.doi) metaLines.push(`# doi: ${metadata.doi}`);
    if(metadata.generated_at) metaLines.push(`# generated_at: ${metadata.generated_at}`);
    metaLines.push(`# exported_at: ${new Date().toISOString()}`);

    // Create header row and data rows
    const header = columnsArr.map(c => c.title || c.field).join(",");
    const dataRows = rows.map(r => columnsArr.map(c => {
      const val = r[c.field];
      if(val === null || val === undefined) return "";
      // escape quote char
      const s = String(val).replace(/"/g,'""');
      return `"${s}"`;
    }).join(",")).join("\n");

    const csv = metaLines.join("\n") + "\n" + header + "\n" + dataRows;
    return csv;
  }

  // Download CSV with metadata
  document.getElementById("download-csv").addEventListener("click", async () => {
    const visibleRows = await table.getData(true); // true => only rows currently visible after filters
    const cols = table.getColumns().map(c => {
      const def = c.getDefinition();
      return {title:def.title||def.field, field:def.field};
    });
    const csv = buildCSVWithMetadata(visibleRows, cols);
    const blob = new Blob([csv], {type: "text/csv;charset=utf-8;"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "exported_table_with_metadata.csv";
    a.click();
    URL.revokeObjectURL(url);
  });

  // Download JSON (visible rows)
  document.getElementById("download-json").addEventListener("click", async () => {
    const visibleRows = await table.getData(true);
    const payload = {
      metadata: metadata,
      exported_at: new Date().toISOString(),
      data: visibleRows
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "exported_table_with_metadata.json";
    a.click();
    URL.revokeObjectURL(url);
  });

}

main().catch(err => {
  console.error("App init failed:", err);
  document.getElementById("table").innerHTML = `<div style="color:red">Failed to load app: ${err.message}</div>`;
});
