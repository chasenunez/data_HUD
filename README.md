```
▗▄▄▄  ▗▄▖▗▄▄▄▖▗▄▖     ▗▄▄▄▖▗▖  ▗▖▗▄▄▖ ▗▖    ▗▄▖ ▗▄▄▖ ▗▄▄▄▖▗▄▄▖  
▐▌  █▐▌ ▐▌ █ ▐▌ ▐▌    ▐▌    ▝▚▞▘ ▐▌ ▐▌▐▌   ▐▌ ▐▌▐▌ ▐▌▐▌   ▐▌ ▐▌ 
▐▌  █▐▛▀▜▌ █ ▐▛▀▜▌    ▐▛▀▀▘  ▐▌  ▐▛▀▘ ▐▌   ▐▌ ▐▌▐▛▀▚▖▐▛▀▀▘▐▛▀▚▖ 
▐▙▄▄▀▐▌ ▐▌ █ ▐▌ ▐▌    ▐▙▄▄▖▗▞▘▝▚▖▐▌   ▐▙▄▄▖▝▚▄▞▘▐▌ ▐▌▐▙▄▄▖▐▌ ▐▌
```  

                                           
 ```                                          
                 █████████      ███████   
                  █ ███████████████████   
                  █ ███████████████████   
                  █  █████████████████    
                   █ █████████████████    
      █            █  ████████████████    
    ███ ██         █  ███████████████     
    ███████████       ███████████████     
   █████████████   ████ ██ █████  ██      
      ██████████    ██ █ █ ████ █ █ █     
       ████████    ██ ████   █    ████    
       ██   ███       █  █        █  █    
      ██ █  ██         ████      ████     
                                      ████
``` 
     

A simple, **fork-and-customize** GitHub Pages template that turns a CSV dataset into a small interactive data-explorer: sortable/filterable table, basic plotting (scatter / histogram), and an export of whatever subset of the table a visitor has curated.
This README explains how to use the template, how to customize it (logo, header, colors, data source), and includes a practical example for exporting curated data with provenance/license metadata.

[Here is an example of a hosted page using the Iris dataset](https://chasenunez.github.io/data_HUD/)
## Quick overview

* Fork this repository.
* Put your CSV file(s) into the `data/` folder (or point the app to a public URL such as an S3 object).
* Edit the single configuration value in `app.js` to point at your CSV.
* Commit & push. Enable GitHub Pages for the repo (Settings → Pages) if not already enabled.
* Your site will be published and visitors can explore, plot, filter, sort, and download filtered subsets.

This template is intentionally lightweight and **static** (no server-side code) so it works with GitHub Pages. Everything runs in the browser.

## File structure (what you’ll see)

```
/
├─ index.html        # Main page (UI skeleton)
├─ style.css         # Styling and simple theme variables
├─ app.js            # Main behavior: load CSV, create table & plots
├─ data/
│   └─ mydata.csv    # Example dataset (replace with yours)
├─ README.md         # <-- this file
└─ LICENSE.md        # Template license (e.g. MIT)
```

## Quick start — make a working page in 3 steps

1. **Fork** this repo to your GitHub account.
2. **Replace** `data/mydata.csv` with your CSV (or add another CSV and edit `app.js`’s `dataURL` — example below).
3. **Enable GitHub Pages** (Repository → Settings → Pages → select `main` branch / `/` or `/docs` folder). Your site will appear at `https://<your-username>.github.io/<repo>/`.

### Set the data source

Open `app.js` and locate:

```javascript
// Configuration: set your data source here.
const dataURL = "data/mydata.csv"; // or "https://yourbucket.s3.amazonaws.com/yourfile.csv"
```

Change `dataURL` to the relative path of the CSV in your repo (e.g. `./data/yourfile.csv`) or to a public URL.

## CSV format rules & best practices

To avoid surprises when the table loads and when visitors plot data:

* **Header row is required.** The first row must contain column names.
* **Comma-separated** values (`,`). If you use other delimiters, convert to CSV.
* **Missing values:** common markers are `NA`, `NaN`, `-999`, or empty cells. The app will attempt to handle these — numeric conversions skip `NaN`/non-numeric entries and leave the table cell blank for display.
* **Numeric columns:** numeric data should be parseable by JavaScript `parseFloat`. If a column contains mixed text and numbers, the plotting tools will skip non-numeric rows and show an informative message if nothing can be plotted.
* **Date columns:** if you intend to plot or filter by date, best to store dates in ISO format `YYYY-MM-DD` (or supply a consistently-parseable format). If you want date-specific helpers added, we can extend the script.

## How visitors use the site

* **Sort:** click any table header to sort ascending/descending.
* **Filter:** use the dropdown + operator + value controls above the table to filter rows (e.g. `year > 2019`).
* **Plot:** choose X and Y columns from the two dropdowns on the right and click “Scatter”; choose “Histogram (X)” for distribution of a single column.
* **Export:** click **Download CSV** to download the current *view* (filtered subset / current sort). The exported file will include the curated rows.

## Exporting curated data *with* provenance & license information

Researchers should make provenance and license information explicit for every shared dataset. The template's default `table.download("csv", "exported-data.csv")` exports the visible rows, but it does not include metadata. Below is a practical, non-invasive pattern to include metadata at the top of the downloaded file.

> **Tradeoff:** CSV doesn’t have an official metadata standard. We prepend human-readable comment lines (starting with `#`) before the CSV table body. Many tools will show these lines; some importers (e.g. Excel) may treat them as data rows. If you require strict machine-readability, consider exporting a companion `metadata.json` or packaging both files into a ZIP. The snippet below uses the `#` comment approach for clarity.

**Example JavaScript snippet (add to `app.js`)**

```javascript
// Build a CSV string for the currently visible table rows, with metadata prepended.
// Assumes `table` is your Tabulator instance.
function downloadFilteredCSVWithMetadata(table, filename, metadataObj) {
  // 1) Get current table data (filtered view)
  const rows = table.getData(); // returns array of row objects

  // 2) Convert rows to CSV body
  if (!rows || rows.length === 0) {
    alert("No rows to export.");
    return;
  }
  const fields = Object.keys(rows[0]);
  const csvBody = [
    fields.join(","), // header row
    ...rows.map(r => fields.map(f => {
      // escape quotes and commas
      const val = (r[f] === undefined || r[f] === null) ? "" : String(r[f]);
      return `"${val.replace(/"/g, '""')}"`;
    }).join(","))
  ].join("\n");

  // 3) Build metadata text (human readable)
  const metaLines = [
    `# Data export generated: ${new Date().toISOString()}`,
    `# Source: ${metadataObj.source || "Unknown"}`,
    `# Citation: ${metadataObj.citation || "Author et al., Year"}`,
    `# License: ${metadataObj.license || "CC BY 4.0"}`,
    `# Contact: ${metadataObj.contact || ""}`,
    `# Notes: ${metadataObj.notes || ""}`,
    ""
  ].join("\n");

  // 4) Concatenate metadata + csv
  const finalText = metaLines + csvBody;

  // 5) Trigger client-side download
  const blob = new Blob([finalText], {type: "text/csv;charset=utf-8;"});
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename || "exported-data.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Usage example:
const metadata = {
  source: "Dataset Title — https://doi.org/xxxx",
  citation: "Dufour, A., & Spitz, B. (2023). Dataset Title. Zenodo. https://doi.org/xxxx",
  license: "CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)",
  contact: "lead.author@institution.edu",
  notes: "Filtered to year >= 2020 by site visitor"
};

// bind to button
document.getElementById("download-csv").addEventListener("click", function(){
  downloadFilteredCSVWithMetadata(table, "my-data-with-metadata.csv", metadata);
});
```

You can edit `metadata` in the UI or set it programmatically from repository-level config so it's always correct.

---

## Customization notes (what researchers typically change)

* **Logo / header / title** — edit `index.html`:

  * Replace `logo.png` (or point `<img>` to another path).
  * Change the site title `<h1 id="site-title">`.
* **Colors & fonts** — edit `style.css`:

  * Colors live near the top of `style.css`. We use simple variables and selectors to make them easy to find.
* **Default data file** — edit `app.js` `dataURL` constant (see above).
* **Plot and table behavior** — edit `app.js`:

  * Change pagination size, initial sort, number of histogram bins, or add new Chart.js options.
* **Add extra CSVs** — drop them into `/data/` and add an option in the UI or a small index JSON describing available datasets. (If you want, we can add a simple dataset switcher later.)

All important customization points are commented in `index.html`, `style.css`, and `app.js` to make them discoverable.

---

## Troubleshooting / FAQ

**Q: My CSV won’t load — blank table.**

* Check the `dataURL` path. For a local file in repo use `./data/yourfile.csv` or `data/yourfile.csv`.
* If using an external URL (S3, other host) and the table is empty or the browser console shows a CORS error, make sure the hosting server sends `Access-Control-Allow-Origin: *` (or an appropriate origin). If you control the S3 bucket, make the object public and enable the correct CORS policy.

**Q: Filtering/parsing errors / plot shows “no numeric data”.**

* Confirm the column contains numeric values parseable by JS `parseFloat`. Remove thousand separators (commas in numbers) or store them as plain numbers.
* Missing value markers like `NA` or `-999` will be skipped when plotting, but they will remain visible in the table.

**Q: I want more complex filters (e.g. combine multiple conditions).**

* Tabulator supports multiple filter statements and custom filter functions. See comments in `app.js` for where to add multiple filters. If you want, I can add a pre-built “add another filter row” UI.

**Q: I need a downloadable ZIP containing CSV + metadata JSON.**

* That requires an extra client-side library (e.g., JSZip). We can add it if you want packaging instead of single-file CSV-with-metadata.

---

## Reproducibility & good practices

* Commit the CSV and the `app.js` configuration with a clear commit message; this preserves the state of the published page.
* Include a `CITATION.txt` or add recommended citation information into `README.md` in the repo root. That makes it discoverable for others who want to re-use the data.
* When publishing a dataset, choose and declare a license (e.g., **CC BY 4.0**) and keep license text or link in repository root.
