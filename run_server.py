#!/usr/bin/env python3
"""Local server and caching terrain proxy. Python standard library only."""
import argparse
import json
import mimetypes
import math
import os
import re
import threading
import urllib.error
import urllib.request
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent
WEB_ROOT = PROJECT_ROOT / "web"
CACHE_ROOT = Path(os.environ.get("TERRAIN_CACHE_DIR", PROJECT_ROOT / "terrain_cache"))
TILE_RE = re.compile(r"^/api/terrain/(\d{1,2})/(\d+)/(\d+)$")
UPSTREAMS = (
    ("mapterhorn", "https://tiles.mapterhorn.com/{z}/{x}/{y}.webp", ".webp", "image/webp"),
    ("aws-terrain", "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png", ".png", "image/png"),
)

def in_study_area(z, x, y):
    """Limit the public proxy to tiles around the study, at viewer resolutions."""
    if z not in (13, 14):
        return False
    def tile(lat, lon):
        n = 2 ** z
        return ((lon + 180) / 360 * n,
                (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
    west, north = tile(48.8, -104.0)
    east, south = tile(48.0, -103.0)
    return int(west) <= x <= int(east) and int(north) <= y <= int(south)

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_ROOT), **kwargs)

    def _send_json(self, status, payload):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _send_bytes(self, data, mime):
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "public, max-age=86400")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/api/health":
            return self._send_json(200, {"ok": True, "message": "Local map server ready", "terrain_sources": [s[0] for s in UPSTREAMS]})
        match = TILE_RE.fullmatch(self.path)
        if match:
            return self._tile(*map(int, match.groups()))
        if self.path.startswith("/api/"):
            return self._send_json(404, {"error": "Unknown API route"})
        return super().do_GET()

    def _tile(self, z, x, y):
        if not in_study_area(z, x, y):
            return self._send_json(400, {"error": "Terrain tile outside the study area or supported resolutions"})
        errors=[]
        for label, tmpl, ext, mime in UPSTREAMS:
            path = CACHE_ROOT / str(z) / str(x) / f"{y}{ext}"
            if path.is_file():
                return self._send_bytes(path.read_bytes(), mime)
            url=tmpl.format(z=z, x=x, y=y)
            try:
                req=urllib.request.Request(url, headers={"User-Agent": "DataCenterVisibilityExplorer/1.1 (terrain research)", "Accept": "image/webp,image/png,*/*"})
                with urllib.request.urlopen(req, timeout=15) as resp:
                    raw=resp.read()
                    content_type=resp.headers.get("Content-Type", "").split(";",1)[0].lower()
                if len(raw)<100 or not content_type.startswith("image/"):
                    raise ValueError(f"unexpected tile payload ({len(raw)} bytes; {content_type})")
                try:
                    path.parent.mkdir(parents=True, exist_ok=True)
                    # Rename a complete file into place so concurrent readers never see a partial tile.
                    import tempfile
                    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as tmp:
                        tmp.write(raw)
                        temp_path = Path(tmp.name)
                    temp_path.replace(path)
                except OSError as cache_error:
                    print(f"Terrain cache unavailable: {cache_error}", flush=True)
                print(f"Terrain: {label} z={z} x={x} y={y} ({len(raw):,} bytes)",flush=True)
                return self._send_bytes(raw, mime)
            except (urllib.error.URLError, TimeoutError, ValueError, OSError) as e:
                errors.append(f"{label}: {e}")
        print("Terrain request failed:", "; ".join(errors), flush=True)
        return self._send_json(502, {"error": "Both public terrain sources failed. " + "; ".join(errors)[:450]})

if __name__ == "__main__":
    parser=argparse.ArgumentParser(description="Local terrain visibility explorer")
    parser.add_argument("--port",type=int,default=int(os.environ.get("PORT", "8765")),help="HTTP port (default: PORT or 8765)")
    parser.add_argument("--host",default=os.environ.get("HOST", "127.0.0.1"),help="Bind address (default: HOST or 127.0.0.1)")
    parser.add_argument("--no-browser",action="store_true",help="Do not automatically open a browser")
    args=parser.parse_args()
    server=ThreadingHTTPServer((args.host,args.port),Handler)
    url=f"http://{args.host}:{args.port}"
    print(f"\nData Center Visibility Explorer: {url}\nPress Ctrl+C to stop.\nElevation tiles will be downloaded and cached on demand.\n",flush=True)
    if not args.no_browser:
        threading.Timer(0.7,lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server.")
    finally:
        server.server_close()
