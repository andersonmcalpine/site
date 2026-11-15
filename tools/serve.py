"""Serve the site for previewing, like python3 -m http.server, but every response carries
Cache-Control: no-cache. The browser then checks for a newer file on each visit, so a page
rebuilt by build.py shows up at once instead of an old copy from the browser's cache.

    python3 tools/serve.py          http://localhost:8800
    python3 tools/serve.py 8000     another port
"""
import functools
import http.server
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8800
    handler = functools.partial(Handler, directory=str(ROOT))
    with http.server.ThreadingHTTPServer(('127.0.0.1', port), handler) as server:
        print(f'Serving {ROOT} at http://localhost:{port} (Ctrl+C to stop)')
        server.serve_forever()


if __name__ == '__main__':
    main()
