// Configuration: set your data source here.
// If using local file, ensure data/mydata.csv exists in the repo.
// Alternatively, set dataURL to an external CSV link.
// Configuration: set your data source here
const dataURL = "data/iris.csv"; // relative path or external URL

// Helper: parse CSV text into array of objects
function parseCSV(csvText) {
    const [headerLine, ...lines] = csvText.trim().split("\n");
    const headers = headerLine.split(",");
    return lines.map(line => {
        const values = line.split(",");
        let obj = {};
        headers.forEach((h, i) => obj[h.trim()] = values[i]?.trim());
        return obj;
    });
}

// Fetch and load CSV
fetch(dataURL)
    .then(response => {
        if (!response.ok) throw new Error("Failed to load CSV file.");
        return response.text();
    })
    .then(csvText => {
        const data = parseCSV(csvText);
        console.log("Loaded data:", data);

        // Initialize Tabulator with parsed data
        let table = new Tabulator("#data-table", {
            data: data,
            autoColumns: true,
            layout: "fitDataTable",
            height: "600px",
            pagination: "local",
            paginationSize: 50,
        });
    })
    .catch(err => {
        console.error("Error loading CSV:", err);
        document.querySelector("#data-table").innerHTML =
            `<p style="color:red;">Error loading data: ${err.message}</p>`;
    });

// Initialize the Tabulator table
let table = new Tabulator("#data-table", {
    ajaxURL: dataURL,
    ajaxConfig: { method: "GET", cache: false },
    autoColumns: true,      // use header row for columns
    layout: "fitDataTable",
    height: "600px",
    pagination: "local",
    paginationSize: 50,
    // Optionally, handle download to add license row (not shown here)
});

// After table is built, fill the filter and plot dropdowns
table.on("dataLoaded", function(){
    const columns = table.getColumns().map(col => col.getField());
    // Populate filter column selector
    let filterCol = document.getElementById("filter-column");
    let xSel = document.getElementById("x-col");
    let ySel = document.getElementById("y-col");
    columns.forEach(field => {
        let opt = document.createElement("option");
        opt.value = field; opt.text = field;
        filterCol.add(opt.cloneNode(true));
        xSel.add(opt.cloneNode(true));
        ySel.add(opt.cloneNode(true));
    });
});

// Filter button behavior
document.getElementById("apply-filter").onclick = () => {
    let col = document.getElementById("filter-column").value;
    let op  = document.getElementById("filter-op").value;
    let val = document.getElementById("filter-val").value;
    if(col && op) {
        table.setFilter(col, op, val);
    }
};
document.getElementById("clear-filter").onclick = () => {
    table.clearFilter();
    document.getElementById("filter-column").value = "";
    document.getElementById("filter-val").value = "";
};

// Download button - exports currently visible rows
document.getElementById("download-csv").onclick = () => {
    table.download("csv", "exported-data.csv");
    // In a full implementation, prepend license/citation info here if desired.
};

// Chart plotting
let currentChart = null;

// Scatter plot button
document.getElementById("plot-scatter").onclick = () => {
    let xCol = document.getElementById("x-col").value;
    let yCol = document.getElementById("y-col").value;
    let data = table.getData();
    let points = [];
    data.forEach(row => {
        let x = parseFloat(row[xCol]);
        let y = parseFloat(row[yCol]);
        if(!isNaN(x) && !isNaN(y)){
            points.push({x: x, y: y});
        }
    });
    if(points.length === 0) {
        alert("Please select numeric columns for X and Y.");
        return;
    }
    // Draw scatter chart
    if(currentChart) currentChart.destroy();
    const ctx = document.getElementById("chart-area").getContext("2d");
    currentChart = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: `${yCol} vs ${xCol}`,
                data: points,
                backgroundColor: 'rgba(50, 100, 150, 0.7)'
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

// Histogram button (for X column)
document.getElementById("plot-histogram").onclick = () => {
    let col = document.getElementById("x-col").value;
    let data = table.getData().map(r => parseFloat(r[col])).filter(v => !isNaN(v));
    if(data.length === 0) {
        alert("Selected column for histogram must be numeric.");
        return;
    }
    // Create 10 bins
    let min = Math.min(...data), max = Math.max(...data);
    let bins = Array(10).fill(0);
    let range = max - min;
    data.forEach(v => {
        let idx = Math.floor((v - min) / range * bins.length);
        if(idx >= bins.length) idx = bins.length - 1;
        bins[idx]++;
    });
    let labels = bins.map((_, i) => (min + ((i + 0.5) * range / bins.length)).toFixed(1));
    // Draw bar chart
    if(currentChart) currentChart.destroy();
    const ctx2 = document.getElementById("chart-area").getContext("2d");
    currentChart = new Chart(ctx2, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{label: col, data: bins, backgroundColor: 'rgba(100, 150, 200, 0.7)'}]
        },
        options: {
            scales: {
                x: { title: { display: true, text: col } },
                y: { title: { display: true, text: 'Count' } }
            }
        }
    });
};
