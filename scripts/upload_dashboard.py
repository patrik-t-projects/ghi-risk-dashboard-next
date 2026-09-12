#!/usr/bin/env python3
"""Upload finished HTML dashboards or daily GHI CSVs via signed Storage URLs."""

from __future__ import annotations

import argparse
import csv
from datetime import date, datetime, timedelta, timezone
import io
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


DEFAULT_ENDPOINT = (
    "https://ghi-risk-dashboard-next.vercel.app/api/dashboard-upload"
)


def load_upload_token() -> str:
    """Prefer the environment, otherwise read the token beside this script."""
    token = os.environ.get("PI_UPLOAD_TOKEN", "").strip()
    if not token:
        token_file = Path(__file__).resolve().parent / "upload-token.txt"
        try:
            token = token_file.read_text(encoding="utf-8-sig").strip()
        except OSError:
            raise ValueError(
                f"Set PI_UPLOAD_TOKEN or create a readable token file at {token_file}."
            ) from None
    if not token or any(character.isspace() for character in token):
        raise ValueError("The upload token must be a single non-empty value.")
    return token


def request_upload_url(
    endpoint: str, dashboard: str, upload_token: str, data_date: str | None = None
) -> dict:
    params = {"dashboard": dashboard}
    if data_date is not None:
        params["date"] = data_date
    url = f"{endpoint}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(
        url,
        method="POST",
        headers={
            "Authorization": f"Bearer {upload_token}",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def read_snapshot(file_path: Path) -> bytes:
    """Read once, checking that the exporter did not change the file mid-read."""
    before = file_path.stat()
    payload = file_path.read_bytes()
    after = file_path.stat()
    if (before.st_ino, before.st_size, before.st_mtime_ns) != (
        after.st_ino, after.st_size, after.st_mtime_ns
    ) or len(payload) != after.st_size:
        raise ValueError("The file changed while reading. Retry after export completes.")
    if not payload:
        raise ValueError("The upload file is empty.")
    return payload


def validate_file(dashboard: str, file_path: Path, payload: bytes, data_date: str | None) -> None:
    if dashboard != "forecast-daily":
        if dashboard not in ("icon-forecast", "imbalance-ch"):
            raise ValueError("Unknown upload target.")
        if data_date is not None or file_path.suffix.lower() != ".html":
            raise ValueError("HTML uploads require an .html file and no --date option.")
        return
    try:
        day = date.fromisoformat(data_date or "")
    except ValueError:
        raise ValueError("Daily CSV uploads require --date YYYY-MM-DD.") from None
    if day.isoformat() != data_date:
        raise ValueError("Use the date format YYYY-MM-DD.")
    if file_path.name != f"icon_ghi_all_stations_{data_date}.csv":
        raise ValueError("The CSV filename must be icon_ghi_all_stations_YYYY-MM-DD.csv and match --date.")
    start = datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc)
    end = start + timedelta(days=1)
    reader = csv.DictReader(io.StringIO(payload.decode("utf-8-sig")), strict=True)
    required = {"datetime", "station_abbr", "grid_coordinates", "Model", "Runtime", "measured_ghi", "control"}
    if not reader.fieldnames or not required.issubset(reader.fieldnames):
        raise ValueError("CSV is missing required daily GHI columns.")
    if len(reader.fieldnames) != len(set(reader.fieldnames)):
        raise ValueError("CSV contains duplicate column names.")
    rows = 0
    for row in reader:
        if None in row or any(value is None for value in row.values()):
            raise ValueError("CSV row has an unexpected number of columns.")
        raw = row["datetime"]
        try:
            instant = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            raise ValueError("CSV contains an invalid UTC timestamp.") from None
        if not raw.endswith("Z") or not start < instant <= end:
            raise ValueError("CSV timestamps must be interval ends within the specified UTC day (including following midnight).")
        if not row["station_abbr"] or row["Model"] not in ("ICON1", "ICON2"):
            raise ValueError("CSV contains an invalid station or model.")
        rows += 1
    if not rows:
        raise ValueError("The CSV has no data rows.")


def upload_file(
    upload_url: str, dashboard_file: Path, content_type: str,
    *, payload: bytes | None = None, method: str = "PUT"
) -> None:
    if method != "PUT":
        raise ValueError("Unexpected upload method from authorization endpoint.")
    request = urllib.request.Request(
        upload_url,
        data=read_snapshot(dashboard_file) if payload is None else payload,
        method=method,
        headers={"Content-Type": content_type, "Cache-Control": "max-age=0"},
    )
    with urllib.request.urlopen(request, timeout=180) as response:
        if response.status not in (200, 201):
            raise RuntimeError(f"Storage returned HTTP {response.status}.")


def upload_snapshot(
    endpoint: str, dashboard: str, file_path: Path, upload_token: str,
    data_date: str | None = None, attempts: int = 3
) -> tuple[dict, int]:
    """Retry network failures using the same completed snapshot and fresh signed URLs."""
    payload = read_snapshot(file_path)
    validate_file(dashboard, file_path, payload, data_date)
    expected_path = (f"daily/icon_ghi_all_stations_{data_date}.csv" if dashboard == "forecast-daily"
                     else "icon_forecast.html" if dashboard == "icon-forecast" else "imbalance_dashboard.html")
    for attempt in range(attempts):
        try:
            authorization = request_upload_url(endpoint, dashboard, upload_token, data_date)
            if authorization.get("path") != expected_path:
                raise ValueError("Unexpected upload destination from authorization endpoint.")
            expected_type = "text/csv" if dashboard == "forecast-daily" else "text/html"
            content_type = authorization["contentType"]
            if not isinstance(content_type, str) or content_type.split(";")[0].strip() != expected_type:
                raise ValueError("Unexpected content type from authorization endpoint.")
            upload_file(authorization["uploadUrl"], file_path, content_type,
                        payload=payload, method=authorization.get("method", "PUT"))
            return authorization, len(payload)
        except urllib.error.HTTPError as error:
            retryable = error.code in (408, 429) or 500 <= error.code <= 599
            error.close()
            if not retryable or attempt == attempts - 1:
                raise RuntimeError(f"Upload failed with HTTP {error.code}.") from None
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            if attempt == attempts - 1:
                raise RuntimeError("Upload failed because the server could not be reached.") from None
        print(f"Temporary upload failure; retry {attempt + 2}/{attempts}.", file=sys.stderr)
        time.sleep(2 ** attempt)
    raise RuntimeError("No upload attempts were made.")


def main() -> int:
    parser = argparse.ArgumentParser(description="Upload HTML dashboards or daily GHI CSVs to Supabase Storage.")
    parser.add_argument("dashboard", choices=("imbalance-ch", "icon-forecast", "forecast-daily"), help="Upload target.")
    parser.add_argument("file", type=Path, help="Path to a completed HTML or daily CSV file.")
    parser.add_argument("--date", help="CSV data day in YYYY-MM-DD format; required for forecast-daily.")
    parser.add_argument("--attempts", type=int, choices=range(1, 6), default=3, help="Upload attempts, including retries (default: 3).")
    parser.add_argument("--endpoint", default=os.environ.get("DASHBOARD_UPLOAD_URL", DEFAULT_ENDPOINT), help="Upload authorization endpoint.")
    args = parser.parse_args()
    file_path = args.file.expanduser().resolve()
    if not file_path.is_file():
        parser.error(f"File not found: {file_path}")
    try:
        upload_token = load_upload_token()
        authorization, size = upload_snapshot(
            args.endpoint.rstrip("/"), args.dashboard, file_path, upload_token, args.date, args.attempts
        )
    except (ValueError, csv.Error, OSError, KeyError, TypeError, RuntimeError):
        # Network exceptions can contain signed URLs. Do not print their raw text.
        print("Upload failed. Check the file, date, token, bucket and endpoint; no success was recorded.", file=sys.stderr)
        return 1
    print(f"Uploaded {file_path.name} to {authorization['path']} ({size:,} bytes).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
