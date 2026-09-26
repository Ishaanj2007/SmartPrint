"""
API Client for Xerox Shop Print Agent.
Communicates with the backend REST endpoints to authenticate, poll, claim,
and update printing statuses.
"""

from typing import Any, Dict, List, Optional
import json
import requests
from config import AgentConfig


class AgentAPIError(Exception):
    """Raised when API returns an error or unexpected response."""
    pass


class AgentAPIClient:
    def __init__(self, config: AgentConfig):
        self.config = config
        self.base_url = config.server_url.rstrip("/")
        self.agent_id = config.agent_id
        self.agent_token = config.agent_token
        self.session_cookie = config.session_cookie

    @property
    def _headers(self) -> Dict[str, str]:
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-Agent-ID": self.agent_id,
            "X-Agent-Token": self.agent_token,
            "Authorization": f"Bearer {self.agent_token}",
            "User-Agent": "XeroxPrintAgent/1.0",
        }
        if self.session_cookie:
            headers["Cookie"] = self.session_cookie
        return headers

    def _parse_json_or_raise(self, res: requests.Response, context: str) -> Dict[str, Any]:
        """
        Parses JSON response or raises a formatted AgentAPIError with useful diagnostics.
        Never reveals the actual agent_token.
        """
        content_type = res.headers.get("Content-Type", "")
        raw_text = res.text or ""
        snippet = raw_text[:500].strip()

        # Handle empty response
        if not raw_text.strip():
            raise AgentAPIError(
                f"\n[ERROR] {context} failed\n"
                f"HTTP status: {res.status_code}\n"
                f"URL: {res.url}\n"
                f"Content-Type: {content_type}\n"
                f"Response: <EMPTY RESPONSE (0 bytes)>"
            )

        # Handle HTML or non-JSON responses
        if "application/json" not in content_type.lower():
            is_cookie_check = "Cookie check" in raw_text or "__cookie_check" in raw_text or "aistudio_auth_flow" in raw_text
            is_google_signin = "accounts.google.com" in raw_text or "Sign in - Google Accounts" in raw_text

            diagnostic_hint = ""
            if is_cookie_check or is_google_signin:
                diagnostic_hint = (
                    "\nDIAGNOSIS: Google AI Studio development URL (ais-dev-...) requires Google session authentication.\n"
                    "Requests from outside a signed-in browser receive the Google 'Cookie check' or login page.\n"
                    "Resolution options:\n"
                    "  1. Set 'session_cookie' in config.json with your browser session cookies.\n"
                    "  2. Or if running on the counter PC with local server: use 'http://localhost:3000'."
                )

            raise AgentAPIError(
                f"\n[ERROR] {context} failed: Non-JSON response received\n"
                f"HTTP status: {res.status_code}\n"
                f"URL: {res.url}\n"
                f"Content-Type: {content_type}\n"
                f"Response: {snippet}{diagnostic_hint}"
            )

        try:
            return res.json()
        except Exception as e:
            raise AgentAPIError(
                f"\n[ERROR] {context} failed: Invalid JSON payload\n"
                f"HTTP status: {res.status_code}\n"
                f"URL: {res.url}\n"
                f"Content-Type: {content_type}\n"
                f"Response: {snippet}\n"
                f"JSON Error: {e}"
            )

    def authenticate(self) -> Dict[str, Any]:
        """
        Verifies agent credentials with backend.
        Sends: POST /api/agent/auth
        Headers: X-Agent-ID, X-Agent-Token, Authorization: Bearer <token>
        Payload: {"agent_id": self.agent_id, "agent_token": self.agent_token}
        """
        url = f"{self.base_url}/api/agent/auth"
        payload = {
            "agent_id": self.agent_id,
            "agent_token": self.agent_token,
        }

        try:
            res = requests.post(url, json=payload, headers=self._headers, timeout=10)
        except requests.exceptions.Timeout:
            raise AgentAPIError(
                f"Authentication failed: Connection timed out after 10s connecting to {url}.\n"
                f"Check that the server is online and reachable from this network."
            )
        except requests.exceptions.SSLError as e:
            raise AgentAPIError(
                f"Authentication failed: TLS/HTTPS handshake error connecting to {url}: {e}"
            )
        except requests.exceptions.ConnectionError as e:
            raise AgentAPIError(
                f"Authentication failed: Connection refused or network unreachable for {url}.\n"
                f"Details: {e}"
            )
        except requests.RequestException as e:
            raise AgentAPIError(f"Authentication failed: Network request error for {url}: {e}")

        # Check HTTP status codes
        if res.status_code == 401:
            raise AgentAPIError(
                f"Authentication failed (HTTP 401 Unauthorized)\n"
                f"URL: {url}\n"
                f"Reason: Invalid Agent ID ('{self.agent_id}') or Agent Token."
            )
        elif res.status_code == 403:
            raise AgentAPIError(
                f"Authentication failed (HTTP 403 Forbidden)\n"
                f"URL: {url}\n"
                f"Reason: Agent '{self.agent_id}' is deactivated in the shop system."
            )
        elif res.status_code == 404:
            raise AgentAPIError(
                f"Authentication failed (HTTP 404 Not Found)\n"
                f"URL: {url}\n"
                f"Reason: The endpoint /api/agent/auth was not found on this server. Check server URL."
            )
        elif res.status_code == 405:
            raise AgentAPIError(
                f"Authentication failed (HTTP 405 Method Not Allowed)\n"
                f"URL: {url}\n"
                f"Reason: Endpoint rejected POST method."
            )
        elif res.status_code in (500, 502, 503, 504):
            snippet = (res.text or "")[:300]
            raise AgentAPIError(
                f"Authentication failed (HTTP {res.status_code} Server Error)\n"
                f"URL: {url}\n"
                f"Server Response: {snippet}"
            )

        data = self._parse_json_or_raise(res, context="Authentication")
        return data

    def send_heartbeat(self, status: str = "IDLE", system_info: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Sends periodic heartbeat to maintain online status on admin dashboard."""
        url = f"{self.base_url}/api/agent/heartbeat"
        payload = {
            "status": status,
            "printer_name": self.config.printer_name,
            "print_mode": self.config.print_mode,
            "system_info": system_info or {},
        }
        try:
            res = requests.post(url, json=payload, headers=self._headers, timeout=10)
            if res.status_code == 200:
                return self._parse_json_or_raise(res, context="Heartbeat")
            else:
                print(f"[WARN] Heartbeat returned status {res.status_code}")
                return {"success": False, "status_code": res.status_code}
        except Exception as e:
            # Heartbeats log warning without terminating agent loop
            print(f"[WARN] Heartbeat failed: {e}")
            return {"success": False, "error": str(e)}

    def get_approved_jobs(self) -> List[Dict[str, Any]]:
        """Queries for orders in APPROVED state ready for printing."""
        url = f"{self.base_url}/api/agent/jobs"
        try:
            res = requests.get(url, headers=self._headers, timeout=15)
            if res.status_code == 200:
                data = self._parse_json_or_raise(res, context="Poll Approved Jobs")
                return data.get("jobs", [])
            else:
                print(f"[WARN] Polling jobs returned status {res.status_code}")
                return []
        except Exception as e:
            print(f"[WARN] Failed to poll approved jobs: {e}")
            return []

    def claim_job(self, job_id: str) -> bool:
        """
        Atomically claims an approved job (APPROVED -> CLAIMED).
        Returns True if claim succeeded, False if already claimed by another agent.
        """
        url = f"{self.base_url}/api/agent/jobs/{job_id}/claim"
        try:
            res = requests.post(url, json={"agent_id": self.agent_id}, headers=self._headers, timeout=10)
            if res.status_code == 409:
                print(f"[INFO] Job {job_id} was already claimed by another agent.")
                return False
            if res.status_code == 200:
                data = self._parse_json_or_raise(res, context=f"Claim Job {job_id}")
                return data.get("success", False)
            print(f"[WARN] Claiming job {job_id} returned status {res.status_code}")
            return False
        except Exception as e:
            print(f"[ERROR] Failed to claim job {job_id}: {e}")
            return False

    def mark_printing(self, job_id: str) -> bool:
        """Notifies backend that file is currently in Windows spooler/printer."""
        url = f"{self.base_url}/api/agent/jobs/{job_id}/printing"
        try:
            res = requests.post(url, json={}, headers=self._headers, timeout=10)
            return res.status_code == 200
        except Exception as e:
            print(f"[ERROR] Failed to set status to PRINTING for {job_id}: {e}")
            return False

    def mark_completed(self, job_id: str, details: Optional[Dict[str, Any]] = None) -> bool:
        """Notifies backend that job has successfully finished printing."""
        url = f"{self.base_url}/api/agent/jobs/{job_id}/completed"
        payload = {"details": details or {}}
        try:
            res = requests.post(url, json=payload, headers=self._headers, timeout=10)
            return res.status_code == 200
        except Exception as e:
            print(f"[ERROR] Failed to mark job {job_id} completed: {e}")
            return False

    def mark_failed(self, job_id: str, error_message: str) -> bool:
        """Notifies backend of failure reason for manual admin retry."""
        url = f"{self.base_url}/api/agent/jobs/{job_id}/failed"
        payload = {"error_message": error_message}
        try:
            res = requests.post(url, json=payload, headers=self._headers, timeout=10)
            return res.status_code == 200
        except Exception as e:
            print(f"[ERROR] Failed to report job failure for {job_id}: {e}")
            return False

