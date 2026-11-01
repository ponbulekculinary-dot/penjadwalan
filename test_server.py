import http.client
import json
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path

import server


class AppFlowTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        server.DB_PATH = Path(cls.temp.name) / "app.sqlite3"
        server.initialize()
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join()
        cls.temp.cleanup()

    def call(self, method, path, payload=None, cookie=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.httpd.server_port)
        headers = {"Content-Type": "application/json"}
        if cookie:
            headers["Cookie"] = cookie
        conn.request(method, path, json.dumps(payload).encode() if payload is not None else None, headers)
        response = conn.getresponse()
        body = json.loads(response.read())
        result = response.status, body, response.getheader("Set-Cookie")
        conn.close()
        return result

    def login(self, member):
        status, _, cookie = self.call("POST", "/api/login", {"username": member, "password": "Password123"})
        self.assertEqual(status, 200)
        return cookie.split(";", 1)[0]

    def test_permissions_and_availability_survive_new_session(self):
        bowo = self.login("bowo")
        emen = self.login("emen")
        self.assertEqual(self.call("POST", "/api/cash", {"member": "EMEN", "status": "unpaid"}, emen)[0], 403)
        self.assertEqual(self.call("POST", "/api/cash", {"member": "EMEN", "status": "unpaid"}, bowo)[0], 200)
        self.assertEqual(self.call("GET", "/api/state", cookie=emen)[1]["cash"], {"EMEN": "unpaid"})
        self.assertEqual(self.call("POST", "/api/availability", {"kind": "month_morning", "month": "2026-12", "location": "MOI", "note": ""}, emen)[0], 201)
        self.assertEqual(self.call("POST", "/api/request", {"date": "2026-12-06", "location": "MOI", "service": "IR 3"}, emen)[0], 409)
        self.assertEqual(self.call("POST", "/api/request", {"date": "2026-12-06", "location": "MOI", "service": "IR 1"}, emen)[0], 201)
        self.call("POST", "/api/logout", {}, emen)
        emen_again = self.login("emen")
        state = self.call("GET", "/api/state", cookie=emen_again)[1]
        self.assertEqual(len(state["leaves"]), 1)
        self.assertEqual(len(state["requests"]), 1)
        self.assertNotIn("BOWO", state["cash"])


if __name__ == "__main__":
    unittest.main()
