# ============================================================
# File:        fake-smtp.py
# Path:        deploy/test/fake-smtp.py
# Project:     Seasonal Entertainment
# Description: A stand-in mail server for the outage watchdog's test (watchdog.test.sh): plain
#              SMTP on 127.0.0.1 with AUTH PLAIN and LOGIN, no TLS. Every mail it receives goes
#              into <folder>/mail-<n>.eml (envelope recipient first), the decoded login into
#              <folder>/auth.log, and the port it listens on into <folder>/port. Run:
#              python3 fake-smtp.py <folder>; stopped by the test.
# ============================================================

import base64
import os
import socketserver
import sys

FOLDER = sys.argv[1]
# A restarted server goes on counting: mails of an earlier run stay as they are.
count = len([name for name in os.listdir(FOLDER) if name.startswith("mail-")])


class Session(socketserver.StreamRequestHandler):
    def send(self, line):
        self.wfile.write((line + "\r\n").encode())

    def handle(self):
        global count
        recipients = []
        self.send("220 fake.smtp ready")
        while True:
            raw = self.rfile.readline()
            if not raw:
                return
            line = raw.decode(errors="replace").rstrip("\r\n")
            verb = line.split(" ")[0].upper()
            if verb in ("EHLO", "HELO"):
                self.send("250-fake.smtp")
                self.send("250 AUTH PLAIN LOGIN")
            elif verb == "AUTH":
                parts = line.split(" ")
                if parts[1].upper() == "PLAIN":
                    token = parts[2] if len(parts) > 2 else None
                    if token is None:
                        self.send("334 ")
                        token = self.rfile.readline().decode().strip()
                    login = base64.b64decode(token).decode(errors="replace").split("\0")
                    self.log_auth(login[1], login[2])
                else:
                    self.send("334 VXNlcm5hbWU6")
                    user = base64.b64decode(self.rfile.readline().strip()).decode()
                    self.send("334 UGFzc3dvcmQ6")
                    password = base64.b64decode(self.rfile.readline().strip()).decode()
                    self.log_auth(user, password)
                self.send("235 accepted")
            elif verb == "MAIL":
                recipients = []
                self.send("250 ok")
            elif verb == "RCPT":
                recipients.append(line.split(":", 1)[1].strip(" <>"))
                self.send("250 ok")
            elif verb == "DATA":
                self.send("354 go on")
                body = []
                while True:
                    data = self.rfile.readline().decode(errors="replace")
                    if data in (".\r\n", ".\n", ""):
                        break
                    body.append(data)
                count += 1
                path = os.path.join(FOLDER, f"mail-{count}.eml")
                with open(path, "w", encoding="utf-8") as mail:
                    mail.write("RCPT " + ",".join(recipients) + "\n" + "".join(body))
                self.send("250 queued")
            elif verb == "QUIT":
                self.send("221 bye")
                return
            else:
                self.send("250 ok")

    def log_auth(self, user, password):
        with open(os.path.join(FOLDER, "auth.log"), "a", encoding="utf-8") as log:
            log.write(f"{user} {password}\n")


socketserver.TCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(("127.0.0.1", 0), Session) as server:
    with open(os.path.join(FOLDER, "port"), "w", encoding="utf-8") as port:
        port.write(str(server.server_address[1]))
    server.serve_forever()
