"""
API Client for Xerox Shop Print Agent.
Communicates with the backend REST endpoints to authenticate, poll, claim,
and update printing statuses.
"""

from typing import Any, Dict, List, Optional
import requests
from config import AgentConfig


class AgentAPIError(Exception):
    """Raised when API returns an error status code."""
    pass


class AgentAPIClient:
    def __init__(self, config: AgentConfig):
        self.config = config
        self.base_url = config.server_url
        self.agent_id = config.agent_id
        self.agent_token = config.agent_token

    @property
    def _headers(self) -> Dict[str, str]:
        return {
            "Content-Type": "application/json",
            "X-Agent-ID": self.agent_id,
            "X-Agent-Token": self.agent_token,
            "User-Agent": "XeroxPrintAgent/1.0",
        }

    def authenticate(self) -> Dict[str, Any]:
        """Verifies agent credentials with backend."""
        url = f"{self.base_url}/api/agent/auth"
        payload = {
            "agent_id": self.agent_id,
            "agent_token": self.agent_token,
        }
        try:
            res = requests.post(url, json=payload, headers=self._headers, timeout=10)
            if res.status_code == 401 or res.status_code == 403:
                raise AgentAPIError("Authentication failed: Invalid Agent ID or Token.")
            res.raise_for_status()
            return res.json()
        except requests.RequestException as e:
            raise AgentAPIError(f"Backend connection error during auth: {e}")

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
            res.raise_for_status()
            return res.json()
        except requests.RequestException as e:
            # Heartbeats should log warning without terminating agent loop
            print(f"[WARN] Heartbeat failed: {e}")
            return {"success": False, "error": str(e)}

    def get_approved_jobs(self) -> List[Dict[str, Any]]:
        """Queries for orders in APPROVED state ready for printing."""
        url = f"{self.base_url}/api/agent/jobs"
        try:
            res = requests.get(url, headers=self._headers, timeout=15)
            res.raise_for_status()
            data = res.json()
            return data.get("jobs", [])
        except requests.RequestException as e:
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
            res.raise_for_status()
            data = res.json()
            return data.get("success", False)
        except requests.RequestException as e:
            print(f"[ERROR] Failed to claim job {job_id}: {e}")
            return False

    def mark_printing(self, job_id: str) -> bool:
        """Notifies backend that file is currently in Windows spooler/printer."""
        url = f"{self.base_url}/api/agent/jobs/{job_id}/printing"
        try:
            res = requests.post(url, json={}, headers=self._headers, timeout=10)
            res.raise_for_status()
            return True
        except requests.RequestException as e:
            print(f"[ERROR] Failed to set status to PRINTING for {job_id}: {e}")
            return False

    def mark_completed(self, job_id: str, details: Optional[Dict[str, Any]] = None) -> bool:
        """Notifies backend that job has successfully finished printing."""
        url = f"{self.base_url}/api/agent/jobs/{job_id}/completed"
        payload = {"details": details or {}}
        try:
            res = requests.post(url, json=payload, headers=self._headers, timeout=10)
            res.raise_for_status()
            return True
        except requests.RequestException as e:
            print(f"[ERROR] Failed to mark job {job_id} completed: {e}")
            return False

    def mark_failed(self, job_id: str, error_message: str) -> bool:
        """Notifies backend of failure reason for manual admin retry."""
        url = f"{self.base_url}/api/agent/jobs/{job_id}/failed"
        payload = {"error_message": error_message}
        try:
            res = requests.post(url, json=payload, headers=self._headers, timeout=10)
            res.raise_for_status()
            return True
        except requests.RequestException as e:
            print(f"[ERROR] Failed to report job failure for {job_id}: {e}")
            return False
