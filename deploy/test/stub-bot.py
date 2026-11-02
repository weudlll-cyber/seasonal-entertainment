# ============================================================
# File:        stub-bot.py
# Path:        deploy/test/stub-bot.py
# Project:     Seasonal Entertainment
# Description: A stand-in for the event bot's admin page in embedded mode, for the installer
#              tests (deploy/test/run.sh, nginx scenario): listens on 127.0.0.1:8090 inside the
#              test server, answers /bot-admin/ (a small page), /bot-admin/health and
#              /bot-admin/api/... (GET and POST), and records every request it gets (method,
#              path, every header with all its values) as one JSON line in
#              /var/log/stub-bot/requests.jsonl, which checks-bot-admin.sh reads. Python
#              because the test server has it anyway (ufw is written in it).
# ============================================================

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

LOG = '/var/log/stub-bot/requests.jsonl'
PAGE = b'<!doctype html><title>stub bot admin</title><p>stub bot admin page</p>\n'


class Handler(BaseHTTPRequestHandler):
    def answer(self):
        length = int(self.headers.get('Content-Length') or 0)
        if length:
            self.rfile.read(length)
        # All values per name: a header nginx failed to replace would show up twice.
        headers = {}
        for name in self.headers.keys():
            headers[name.lower()] = self.headers.get_all(name)
        with open(LOG, 'a', encoding='utf-8') as log:
            log.write(json.dumps({'method': self.command, 'path': self.path, 'headers': headers}) + '\n')
        if self.path == '/bot-admin/health':
            status, kind, body = 200, 'application/json', b'{"ok":true}\n'
        elif self.path.startswith('/bot-admin/api/'):
            status, kind, body = 200, 'application/json', b'{"ok":true,"stub":"api"}\n'
        elif self.path.startswith('/bot-admin/'):
            status, kind, body = 200, 'text/html; charset=utf-8', PAGE
        else:
            status, kind, body = 404, 'text/plain', b'not found\n'
        self.send_response(status)
        self.send_header('Content-Type', kind)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    do_GET = answer
    do_POST = answer

    def log_message(self, *args):
        pass  # the JSON lines are the log


os.makedirs(os.path.dirname(LOG), exist_ok=True)
ThreadingHTTPServer(('127.0.0.1', 8090), Handler).serve_forever()
