#!/usr/bin/env python3
"""
ingest.py

- Reads CSV(s) from local path or from an online location (S3/http)
- Validates column presence (optionally types)
- Produces docs/data.json (array of objects), docs/columns.json (Tabulator columns),
  and docs/metadata.json containing citation/license info.

Usage:
  python3 scripts/ingest.py --input data/my_study_data.csv --out docs/

This script is intentionally simple and well-commented so researchers can extend it.
"""
import argparse
import os
import json
import pandas as pd
from datetime import datetime
from typing import List, Dict

# Optional: import boto3 if you want direct s3 reading
# import boto3
# from botocore.exceptions import NoCredentialsError

# -------------------------
# Helper utilities
# -------------------------
def read_csv(path_or_url: str) -> pd.DataFrame:
    """
    Read CSV from a local path or an HTTP(S) URL. For S3 you can either pass
    a presigned URL or extend this function to use boto3.
    """
    if path_or_url.startswith("http://") or path_or_url.startswith("https://"):
        # Use pandas to read from URL (works for publicly accessible URLs)
        return pd.read_csv(path_or_url)
    else:
        return pd.read_csv(path_or_url)

def infer_tabulator_columns(df: pd.DataFrame, max_width=200) -> List[Dict]:
    """
    Turn pandas DataFrame columns into Tabulator column definitions.
    We'll set a reasonable default headerFilter and column title = column name.
    """
    columns = []
    for col in df.columns:
        # Try to map pandas dtype to Tabulator sorter/editor types
        dtype = str(df[col].dtype)
        if 'int' in dtype or 'float' in dtype:
            sorter = "number"
        elif 'datetime' in dtype or 'date' in dtype:
            sorter = "date"
        else:
            sorter = "string"

        col_def = {
            "title": col.replace("_", " ").title(),
            "field": col,
            "headerFilter": True,            # enables filtering in each column
            "hozAlign": "left",
            "sorter": sorter,
            "download": True,
            "width": None
        }
        columns.append(col_def)
    return columns

def make_metadata(args, df: pd.DataFrame) -> Dict:
    """
    Build a metadata dictionary to store provenance, license and citation.
    Users should customize this; the script will not invent citations.
    """
    metadata = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "source_filename": os.path.basename(args.input),
        "n_rows": int(df.shape[0]),
        "n_columns": int(df.shape[1]),
        "citation": args.citation or "",
        "license": args.license or "",
        "doi": args.doi or "",
        "contact": args.contact or "",
        "notes": args.notes or "",
    }
    return metadata

def write_json(obj, outpath):
    with open(outpath, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, indent=2, ensure_ascii=False)
    print(f"Wrote {outpath}")

# -------------------------
# Main
# -------------------------
def main():
    parser = argparse.ArgumentParser(description="Ingest CSV => JSON + Tabulator columns + metadata")
    parser.add_argument("--input", "-i", required=True, help="Path or URL to CSV file")
    parser.add_argument("--out", "-o", default="docs", help="Output folder (e.g. docs/ for GitHub Pages)")
    parser.add_argument("--required-columns", "-r", nargs="*", help="List of columns required", default=[])
    parser.add_argument("--citation", help="Citation string to include in downloads", default="")
    parser.add_argument("--license", help="License (e.g., CC-BY 4.0)", default="")
    parser.add_argument("--doi", help="DOI for dataset", default="")
    parser.add_argument("--contact", help="Contact email for data queries", default="")
    parser.add_argument("--notes", help="Free-text notes about dataset", default="")
    args = parser.parse_args()

    df = read_csv(args.input)
    print(f"Read CSV with {df.shape[0]} rows and {df.shape[1]} columns")

    # Validate required columns
    missing = [c for c in args.required_columns if c not in df.columns]
    if missing:
        raise SystemExit(f"ERROR: Missing required columns: {missing}")

    # Optional: type checks / NA checks can go here
    # Example: ensure no duplicate column names
    if df.columns.duplicated().any():
        raise SystemExit("ERROR: duplicated column names detected in CSV")

    # Convert pandas types that are not JSON-serializable
    # If there are datetime columns, convert to ISO strings
    for c in df.columns:
        if pd.api.types.is_datetime64_any_dtype(df[c]):
            df[c] = df[c].dt.strftime("%Y-%m-%dT%H:%M:%SZ")

    # Prepare outputs
    os.makedirs(args.out, exist_ok=True)
    data_records = df.where(pd.notnull(df), None).to_dict(orient="records")
    data_out = os.path.join(args.out, "data.json")
    write_json(data_records, data_out)

    columns_def = infer_tabulator_columns(df)
    columns_out = os.path.join(args.out, "columns.json")
    write_json(columns_def, columns_out)

    metadata = make_metadata(args, df)
    meta_out = os.path.join(args.out, "metadata.json")
    write_json(metadata, meta_out)

    print("Ingestion complete. Place index.html and app.js in the docs/ folder to serve with GitHub Pages.")

if __name__ == "__main__":
    main()
