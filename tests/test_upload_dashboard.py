import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.error
import urllib.parse

spec = importlib.util.spec_from_file_location("uploader", Path(__file__).resolve().parents[1] / "scripts/upload_dashboard.py")
uploader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(uploader)


class Response:
    def __init__(self, data=b"", status=200):
        self.data = data
        self.status = status

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def read(self):
        return self.data


class UploadTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.file = Path(self.temp.name) / "icon_ghi_all_stations_2026-09-12.csv"
        self.file.write_text('datetime,station_abbr,grid_coordinates,Model,Runtime,measured_ghi,control,member_1\n'
                             '2026-09-12T00:15:00Z,CHZ,"47.18,8.46",ICON1,12.09.2026 06 UTC,0,0,1\n'
                             '2026-09-13T00:00:00Z,CHZ,"47.18,8.46",ICON1,12.09.2026 06 UTC,,2,3\n', encoding="utf-8")
        self.authorization = {"uploadUrl": "https://storage.example/signed?token=secret", "path": "daily/" + self.file.name,
                              "contentType": "text/csv; charset=utf-8", "method": "PUT"}

    def test_daily_protocol_and_direct_upload(self):
        calls = []
        def request(req, **kwargs):
            calls.append(req)
            return Response(json.dumps(self.authorization).encode()) if req.method == "POST" else Response(status=201)
        with patch.object(uploader.urllib.request, "urlopen", side_effect=request):
            result, size = uploader.upload_snapshot("https://website.example/api/dashboard-upload", "forecast-daily", self.file, "pi-token", "2026-09-12")
        self.assertEqual(result["path"], "daily/" + self.file.name)
        self.assertEqual(urllib.parse.parse_qs(urllib.parse.urlsplit(calls[0].full_url).query), {"dashboard": ["forecast-daily"], "date": ["2026-09-12"]})
        self.assertEqual(calls[0].get_header("Authorization"), "Bearer pi-token")
        self.assertIsNone(calls[0].data)
        self.assertEqual(calls[1].data, self.file.read_bytes())
        self.assertIsNone(calls[1].get_header("Authorization"))
        self.assertEqual(calls[1].get_header("Content-type"), "text/csv; charset=utf-8")
        self.assertEqual(size, self.file.stat().st_size)

    def test_html_compatibility(self):
        for target, filename in [("icon-forecast", "icon_forecast.html"), ("imbalance-ch", "imbalance_dashboard.html")]:
            file = Path(self.temp.name) / filename
            file.write_text("<html>dashboard</html>")
            auth = {**self.authorization, "path": filename, "contentType": "text/html; charset=utf-8"}
            with patch.object(uploader, "request_upload_url", return_value=auth) as signing, patch.object(uploader, "upload_file") as upload:
                uploader.upload_snapshot("https://website.example/api/dashboard-upload", target, file, "token")
                signing.assert_called_once_with("https://website.example/api/dashboard-upload", target, "token", None)
                self.assertEqual(upload.call_args.kwargs["payload"], file.read_bytes())

    def test_retry_reuses_snapshot_and_gets_fresh_url(self):
        original = self.file.read_bytes()
        sent = []
        def upload(*args, **kwargs):
            sent.append(kwargs["payload"])
            if len(sent) == 1:
                self.file.write_text("new export")
                raise urllib.error.HTTPError("https://storage.example/?secret", 503, "Unavailable", {}, None)
        with patch.object(uploader, "request_upload_url", return_value=self.authorization) as signing, patch.object(uploader, "upload_file", side_effect=upload), patch.object(uploader.time, "sleep"):
            uploader.upload_snapshot("https://website.example", "forecast-daily", self.file, "token", "2026-09-12")
        self.assertEqual(sent, [original, original])
        self.assertEqual(signing.call_count, 2)

    def test_nonretryable_failure_and_retry_limit(self):
        for code, attempts in [(401, 1), (503, 3)]:
            with patch.object(uploader, "request_upload_url", side_effect=urllib.error.HTTPError("https://secret-url", code, "Error", {}, None)) as signing, patch.object(uploader.time, "sleep"):
                with self.assertRaisesRegex(RuntimeError, f"HTTP {code}"):
                    uploader.upload_snapshot("https://website.example", "forecast-daily", self.file, "token", "2026-09-12")
                self.assertEqual(signing.call_count, attempts)

    def test_date_and_content_validation(self):
        for day in [None, "2026-09-31", "2026-09-11", "../2026-09-12"]:
            with self.assertRaises(ValueError):
                uploader.validate_file("forecast-daily", self.file, self.file.read_bytes(), day)
        with self.assertRaises(ValueError):
            uploader.validate_file("forecast-daily", self.file, self.file.read_bytes().replace(b"2026-09-13T00:00:00Z", b"2026-09-13T00:15:00Z"), "2026-09-12")
        uploader.validate_file("forecast-daily", self.file, self.file.read_bytes(), "2026-09-12")

    def test_actual_daily_fixture(self):
        file = Path(__file__).resolve().parents[1] / "test_data/icon_ghi_all_stations_2026-09-12.csv"
        uploader.validate_file("forecast-daily", file, uploader.read_snapshot(file), "2026-09-12")

    def test_environment_token_priority(self):
        with patch.dict(uploader.os.environ, {"PI_UPLOAD_TOKEN": " env-token "}):
            self.assertEqual(uploader.load_upload_token(), "env-token")


if __name__ == "__main__":
    unittest.main()
