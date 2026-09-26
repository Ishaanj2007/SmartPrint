"""
Configuration module for the Xerox Shop Python Print Agent.
Reads settings from config.json or environment variables.
"""

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


@dataclass
class AgentConfig:
    server_url: str
    agent_id: str
    agent_token: str
    printer_name: str
    poll_interval: int
    heartbeat_interval: int
    print_mode: str
    temp_dir: str
    session_cookie: Optional[str] = None

    @classmethod
    def load(cls, config_path: str = "config.json") -> "AgentConfig":
        """
        Loads configuration from a JSON file, falling back to environment
        variables or standard default values.
        """
        data = {}
        cfg_file = Path(config_path)

        if cfg_file.exists():
            try:
                with open(cfg_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except Exception as e:
                print(f"[WARN] Could not parse {config_path}: {e}. Using defaults.")

        # Environment variables take precedence over config.json
        server_url = os.getenv("SERVER_URL", data.get("server_url", "http://localhost:3000"))
        agent_id = os.getenv("AGENT_ID", data.get("agent_id", "SHOP_001"))
        agent_token = os.getenv("AGENT_TOKEN", data.get("agent_token", "agent_secret_token_123"))
        printer_name = os.getenv("PRINTER_NAME", data.get("printer_name", "DEFAULT"))
        poll_interval = int(os.getenv("POLL_INTERVAL", data.get("poll_interval", 3)))
        heartbeat_interval = int(os.getenv("HEARTBEAT_INTERVAL", data.get("heartbeat_interval", 10)))
        print_mode = os.getenv("PRINT_MODE", data.get("print_mode", "mock" if os.name != "nt" else "windows"))
        temp_dir = os.getenv("TEMP_DIR", data.get("temp_dir", "./spool"))
        session_cookie = os.getenv("SESSION_COOKIE", data.get("session_cookie"))

        # Ensure trailing slash removed from server_url
        server_url = server_url.rstrip("/")

        # Ensure temp directory exists
        Path(temp_dir).mkdir(parents=True, exist_ok=True)

        return cls(
            server_url=server_url,
            agent_id=agent_id,
            agent_token=agent_token,
            printer_name=printer_name,
            poll_interval=poll_interval,
            heartbeat_interval=heartbeat_interval,
            print_mode=print_mode,
            temp_dir=temp_dir,
            session_cookie=session_cookie,
        )
