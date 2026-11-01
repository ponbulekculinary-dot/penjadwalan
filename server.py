"""Local development server for the camera-team scheduling app."""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time
from contextlib import contextmanager
from datetime import date, datetime
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("PENJADWALAN_DB", ROOT / ".data" / "app.sqlite3"))
MEMBERS = ("EMEN", "DEDY", "AYU", "BOWO", "ANDRE", "BILLY", "OWEN", "MELVERN", "DAUD", "EVAN", "TIMI", "EVELYN", "AGUS", "DEMAS")
SERVICES = {"Tamsir": {"IR 1", "IR 2", "IR 3"}, "MOI": {"IR 1", "IR 2", "IR 3", "IR 4"}}
SESSIONS: dict[str, str] = {}
SESSION_LOCK = Lock()


def month_now() -> str:
    return datetime.now(ZoneInfo("Asia/Jakarta")).strftime("%Y-%m")


def password_hash(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310_000)
    return salt.hex() + ":" + digest.hex()


def password_matches(password: str, stored: str) -> bool:
    salt, expected = stored.split(":", 1)
    actual = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 310_000)
    return hmac.compare_digest(actual, bytes.fromhex(expected))


@contextmanager
def db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys=ON")
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def initialize():
    with db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS users (name TEXT PRIMARY KEY, password_hash TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS availability (
                id INTEGER PRIMARY KEY AUTOINCREMENT, member TEXT NOT NULL REFERENCES users(name),
                kind TEXT NOT NULL, day TEXT, month TEXT, location TEXT, note TEXT NOT NULL DEFAULT '',
                created INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT, member TEXT NOT NULL REFERENCES users(name),
                day TEXT NOT NULL, location TEXT NOT NULL, service TEXT NOT NULL,
                note TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS cash (
                month TEXT NOT NULL, member TEXT NOT NULL REFERENCES users(name),
                status TEXT NOT NULL, updated_by TEXT NOT NULL REFERENCES users(name),
                PRIMARY KEY (month, member)
            );
        """)
        existing = {row[0] for row in conn.execute("SELECT name FROM users")}
        for name in MEMBERS:
            if name not in existing:
                conn.execute("INSERT INTO users VALUES (?, ?)", (name, password_hash("Password123")))


def valid_day(value):
    try:
        return isinstance(value, str) and date.fromisoformat(value).isoformat() == value
    except ValueError:
        return False


def valid_month(value):
    try:
        return isinstance(value, str) and len(value) == 7 and date.fromisoformat(value + "-01").strftime("%Y-%m") == value
    except ValueError:
        return False


def blocked(rows, day, location, service):
    for row in rows:
        if row["kind"] == "day" and row["day"] == day:
            return True
        if row["month"] == day[:7]:
            if row["kind"] == "month_off":
                return True
            if row["kind"] == "month_morning" and (service not in {"IR 1", "IR 2"} or row["location"] not in {"Kedua lokasi", location}):
                return True
    return False


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        print("%s - %s" % (self.address_string(), format % args))

    def send(self, status, payload, cookie=None):
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(body)

    def fail(self, status, message):
        self.send(status, {"error": message})

    def body(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 16384 or self.headers.get("Content-Type", "").split(";")[0] != "application/json":
                raise ValueError
            result = json.loads(self.rfile.read(length))
            if not isinstance(result, dict):
                raise ValueError
            return result
        except (ValueError, json.JSONDecodeError):
            self.fail(HTTPStatus.BAD_REQUEST, "Data permintaan tidak valid.")
            return None

    def member(self):
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get("Cookie", ""))
            token = cookie.get("session")
            if token:
                with SESSION_LOCK:
                    return SESSIONS.get(token.value)
        except Exception:
            pass
        return None

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/state":
            member = self.member()
            if not member:
                return self.fail(HTTPStatus.UNAUTHORIZED, "Silakan login.")
            with db() as conn:
                leaves = [dict(row) for row in conn.execute("SELECT * FROM availability WHERE member=? ORDER BY created DESC", (member,))]
                requests = [dict(row) for row in conn.execute("SELECT * FROM requests WHERE member=? ORDER BY created DESC", (member,))]
                if member == "BOWO":
                    cash = {row["member"]: row["status"] for row in conn.execute("SELECT member,status FROM cash WHERE month=?", (month_now(),))}
                else:
                    cash = {row["member"]: row["status"] for row in conn.execute("SELECT member,status FROM cash WHERE month=? AND member=?", (month_now(), member))}
            return self.send(HTTPStatus.OK, {"user": member, "leaves": leaves, "requests": requests, "cash": cash, "month": month_now()})
        if path in {"/", "/index.html"}:
            body = (ROOT / "index.html").read_bytes()
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            return self.wfile.write(body)
        return self.fail(HTTPStatus.NOT_FOUND, "Halaman tidak ditemukan.")

    def do_POST(self):
        path = urlparse(self.path).path
        data = self.body()
        if data is None:
            return
        if path == "/api/login":
            name = str(data.get("username", "")).strip().upper()
            password = str(data.get("password", ""))
            with db() as conn:
                row = conn.execute("SELECT password_hash FROM users WHERE name=?", (name,)).fetchone()
            if not row or not password_matches(password, row["password_hash"]):
                return self.fail(HTTPStatus.UNAUTHORIZED, "Username atau password belum sesuai.")
            token = secrets.token_urlsafe(32)
            with SESSION_LOCK:
                SESSIONS[token] = name
            return self.send(HTTPStatus.OK, {"user": name}, f"session={token}; HttpOnly; SameSite=Strict; Path=/")
        member = self.member()
        if not member:
            return self.fail(HTTPStatus.UNAUTHORIZED, "Silakan login.")
        if path == "/api/logout":
            cookie = SimpleCookie()
            cookie.load(self.headers.get("Cookie", ""))
            token = cookie.get("session")
            if token:
                with SESSION_LOCK:
                    SESSIONS.pop(token.value, None)
            return self.send(HTTPStatus.OK, {"ok": True}, "session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0")
        if path == "/api/password":
            current, new = str(data.get("current", "")), str(data.get("next", ""))
            with db() as conn:
                row = conn.execute("SELECT password_hash FROM users WHERE name=?", (member,)).fetchone()
                if not password_matches(current, row["password_hash"]):
                    return self.fail(HTTPStatus.BAD_REQUEST, "Password saat ini tidak sesuai.")
                if len(new) < 8 or new == current:
                    return self.fail(HTTPStatus.BAD_REQUEST, "Password baru harus berbeda dan minimal 8 karakter.")
                conn.execute("UPDATE users SET password_hash=? WHERE name=?", (password_hash(new), member))
            return self.send(HTTPStatus.OK, {"ok": True})
        if path == "/api/cash":
            if member != "BOWO":
                return self.fail(HTTPStatus.FORBIDDEN, "Hanya Bowo yang bisa mengubah status kas.")
            target, status = data.get("member"), data.get("status")
            if target not in MEMBERS or status not in {"paid", "unpaid"}:
                return self.fail(HTTPStatus.BAD_REQUEST, "Status kas tidak valid.")
            with db() as conn:
                conn.execute("INSERT INTO cash VALUES (?,?,?,?) ON CONFLICT(month,member) DO UPDATE SET status=excluded.status,updated_by=excluded.updated_by", (month_now(), target, status, member))
            return self.send(HTTPStatus.OK, {"ok": True})
        if path == "/api/availability":
            kind = data.get("kind")
            day, month, location = data.get("date", ""), data.get("month", ""), data.get("location", "")
            if kind not in {"day", "month_off", "month_morning"} or (kind == "day" and not valid_day(day)) or (kind != "day" and not valid_month(month)) or (kind == "month_morning" and location not in {"Kedua lokasi", "Tamsir", "MOI"}):
                return self.fail(HTTPStatus.BAD_REQUEST, "Ketersediaan tidak valid.")
            note = str(data.get("note", ""))[:500]
            with db() as conn:
                rows = conn.execute("SELECT * FROM availability WHERE member=?", (member,)).fetchall()
                if any(r["kind"] == kind and (r["day"] == day if kind == "day" else r["month"] == month and r["location"] == (location if kind == "month_morning" else "")) for r in rows):
                    return self.fail(HTTPStatus.CONFLICT, "Aturan ini sudah dicatat.")
                requests = conn.execute("SELECT * FROM requests WHERE member=?", (member,)).fetchall()
                entry = {"kind": kind, "day": day if kind == "day" else "", "month": month if kind != "day" else "", "location": location if kind == "month_morning" else ""}
                if any(blocked([entry], r["day"], r["location"], r["service"]) for r in requests):
                    return self.fail(HTTPStatus.CONFLICT, "Ada special request yang bertentangan. Hapus request itu terlebih dahulu.")
                conn.execute("INSERT INTO availability(member,kind,day,month,location,note,created) VALUES (?,?,?,?,?,?,?)", (member, kind, entry["day"], entry["month"], entry["location"], note, int(time.time()*1000)))
            return self.send(HTTPStatus.CREATED, {"ok": True})
        if path == "/api/request":
            day, location, service = data.get("date", ""), data.get("location", ""), data.get("service", "")
            if not valid_day(day) or location not in SERVICES or service not in SERVICES[location]:
                return self.fail(HTTPStatus.BAD_REQUEST, "Tanggal atau ibadah tidak valid.")
            with db() as conn:
                rows = conn.execute("SELECT * FROM availability WHERE member=?", (member,)).fetchall()
                if blocked(rows, day, location, service):
                    return self.fail(HTTPStatus.CONFLICT, "Pilihan ini bertentangan dengan ketersediaan yang kamu catat.")
                if conn.execute("SELECT 1 FROM requests WHERE member=? AND day=? AND location=? AND service=?", (member, day, location, service)).fetchone():
                    return self.fail(HTTPStatus.CONFLICT, "Request yang sama sudah diajukan.")
                conn.execute("INSERT INTO requests(member,day,location,service,note,created) VALUES (?,?,?,?,?,?)", (member, day, location, service, str(data.get("note", ""))[:500], int(time.time()*1000)))
            return self.send(HTTPStatus.CREATED, {"ok": True})
        if path == "/api/delete":
            kind, item_id = data.get("kind"), data.get("id")
            if kind not in {"availability", "request"} or not isinstance(item_id, int):
                return self.fail(HTTPStatus.BAD_REQUEST, "Data hapus tidak valid.")
            table = "availability" if kind == "availability" else "requests"
            with db() as conn:
                result = conn.execute(f"DELETE FROM {table} WHERE id=? AND member=?", (item_id, member))
            if not result.rowcount:
                return self.fail(HTTPStatus.NOT_FOUND, "Data tidak ditemukan.")
            return self.send(HTTPStatus.OK, {"ok": True})
        return self.fail(HTTPStatus.NOT_FOUND, "Endpoint tidak ditemukan.")


def main():
    initialize()
    port = int(os.environ.get("PORT", "8000"))
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"Penjadwalan listening on port {port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
