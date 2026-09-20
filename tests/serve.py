"""Local, credential-free UI harness: python3 tests/serve.py"""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        if self.path.split('?')[0] == '/tabs/batches':
            self.path = '/tests/demo.html'
        return super().do_GET()

if __name__ == '__main__':
    print('Label preview: http://127.0.0.1:8874/options.html', flush=True)
    print('Card integration: http://127.0.0.1:8874/tabs/batches', flush=True)
    ThreadingHTTPServer(('127.0.0.1', 8874), Handler).serve_forever()
