"""
Secure File Downloader for Xerox Print Agent.
Downloads customer files from backend with agent authorization and validates integrity.
"""

import hashlib
import os
from pathlib import Path
from typing import Optional
import requests


class DownloaderError(Exception):
    """Raised when file download or validation fails."""
    pass


class FileDownloader:
    def __init__(self, temp_dir: str = "./spool"):
        self.temp_dir = Path(temp_dir).resolve()
        self.temp_dir.mkdir(parents=True, exist_ok=True)

    def download_file(
        self,
        download_url: str,
        filename: str,
        agent_token: str,
        expected_size: Optional[int] = None,
        expected_sha256: Optional[str] = None
    ) -> Path:
        """
        Downloads a file from the server, validates its size and SHA-256 (if provided),
        and returns the local file path.
        """
        dest_path = self.temp_dir / filename
        headers = {
            "Authorization": f"Bearer {agent_token}",
            "User-Agent": "XeroxPrintAgent/1.0",
        }

        print(f"[DOWNLOAD] Fetching file from: {download_url}")
        print(f"[DOWNLOAD] Destination: {dest_path}")

        try:
            with requests.get(download_url, headers=headers, stream=True, timeout=30) as r:
                r.raise_for_status()
                hasher = hashlib.sha256()
                downloaded_bytes = 0

                with open(dest_path, "wb") as f:
                    for chunk in r.iter_content(chunk_size=8192):
                        if chunk:
                            f.write(chunk)
                            hasher.update(chunk)
                            downloaded_bytes += len(chunk)

            # Validate file size
            if expected_size is not None and downloaded_bytes != expected_size:
                dest_path.unlink(missing_ok=True)
                raise DownloaderError(
                    f"File size mismatch: expected {expected_size} bytes, got {downloaded_bytes} bytes."
                )

            # Validate SHA-256 hash if provided
            if expected_sha256:
                actual_sha = hasher.hexdigest().lower()
                if actual_sha != expected_sha256.lower():
                    dest_path.unlink(missing_ok=True)
                    raise DownloaderError(
                        f"Checksum mismatch: expected {expected_sha256}, got {actual_sha}."
                    )

            print(f"[DOWNLOAD] Successfully received {downloaded_bytes} bytes -> {dest_path.name}")
            return dest_path

        except requests.RequestException as e:
            dest_path.unlink(missing_ok=True)
            raise DownloaderError(f"HTTP request error during download: {e}")

    def cleanup_file(self, file_path: Path):
        """Removes spooled file after printing to protect customer privacy."""
        try:
            if file_path.exists():
                file_path.unlink()
                print(f"[CLEANUP] Deleted spooled file: {file_path.name}")
        except Exception as e:
            print(f"[WARN] Failed to delete temporary file {file_path}: {e}")
