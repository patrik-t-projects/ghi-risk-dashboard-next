#!/usr/bin/env python3
"""Upload a generated dashboard through the protected production endpoint."""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


DEFAULT_ENDPOINT = (
    "https://ghi-risk-dashboard-next.vercel.app/api/dashboard-upload"
)


def request_upload_url(endpoint: str, dashboard: str, upload_token: str) -> dict:
    url = f"{endpoint}?{urllib.parse.urlencode({'dashboard': dashboard})}"
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


def upload_file(upload_url: str, dashboard_file: Path, content_type: str) -> None:
    request = urllib.request.Request(
        upload_url,
        data=dashboard_file.read_bytes(),
        method="PUT",
        headers={
            "Content-Type": content_type,
            "Cache-Control": "max-age=0",
        },
    )

    with urllib.request.urlopen(request, timeout=180) as response:
        if response.status not in (200, 201):
            raise RuntimeError(f"Storage returned HTTP {response.status}.")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Upload a finished HTML dashboard to Supabase Storage."
    )
    parser.add_argument(
        "dashboard",
        choices=("imbalance-ch", "icon-forecast"),
        help="The dashboard slot to replace.",
    )
    parser.add_argument("file", type=Path, help="Path to the generated HTML file.")
    parser.add_argument(
        "--endpoint",
        default=os.environ.get("DASHBOARD_UPLOAD_URL", DEFAULT_ENDPOINT),
        help="Dashboard upload authorization endpoint.",
    )
    args = parser.parse_args()

    upload_token = os.environ.get("PI_UPLOAD_TOKEN")
    if not upload_token:
        parser.error("Set the PI_UPLOAD_TOKEN environment variable first.")

    dashboard_file = args.file.expanduser().resolve()
    if not dashboard_file.is_file():
        parser.error(f"File not found: {dashboard_file}")
    if dashboard_file.suffix.lower() != ".html":
        parser.error("The dashboard file must have an .html extension.")
    if dashboard_file.stat().st_size == 0:
        parser.error("The dashboard file is empty.")

    try:
        authorization = request_upload_url(
            args.endpoint.rstrip("/"), args.dashboard, upload_token
        )
        upload_url = authorization["uploadUrl"]
        content_type = authorization.get("contentType", "text/html; charset=utf-8")
        upload_file(upload_url, dashboard_file, content_type)
    except (urllib.error.HTTPError, urllib.error.URLError, KeyError, RuntimeError) as error:
        print(f"Upload failed: {error}", file=sys.stderr)
        return 1

    print(
        f"Uploaded {dashboard_file.name} to {authorization['path']} "
        f"({dashboard_file.stat().st_size:,} bytes)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
