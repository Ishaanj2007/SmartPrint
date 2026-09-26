#!/usr/bin/env python3
"""
=============================================================================
XEROX PRINT SHOP AUTOMATION - LOCAL PRINT AGENT
=============================================================================

This Python agent runs locally on the shopkeeper's Windows PC.
It acts as the secure, non-exposed bridge between the backend order queue
and the local Windows Print Spooler / physical printer.

Milestone 1 Standalone Test:
    python agent.py --test "test.pdf"
    python agent.py --test "test.pdf" --mock
    python agent.py --list-printers

Daemon Polling Mode:
    python agent.py --loop
=============================================================================
"""

import argparse
import os
import platform
import sys
import threading
import time
from datetime import datetime
from pathlib import Path

from config import AgentConfig
from printer import (
    WindowsPrinterEngine,
    PrinterNotFoundError,
    DocumentNotFoundError,
    PrinterError,
)

# Downloader and API client depend on requests (lazy loaded for Milestone 1 standalone test)
try:
    from downloader import FileDownloader, DownloaderError
    from api_client import AgentAPIClient, AgentAPIError
except ImportError:
    FileDownloader = None
    DownloaderError = Exception
    AgentAPIClient = None
    AgentAPIError = Exception


def get_timestamp() -> str:
    return datetime.now().strftime("[%H:%M:%S]")


class HeartbeatWorker(threading.Thread):
    """
    Dedicated background worker for periodic heartbeats.
    Ensures the shop PC remains marked 'Online' in the Admin Dashboard even
    during long print jobs, large file downloads, or network delays.
    """

    def __init__(self, api_client: AgentAPIClient, interval: float, printer_name: str, print_mode: str):
        super().__init__(daemon=True, name="HeartbeatThread")
        self.api = api_client
        self.interval = max(float(interval), 3.0)
        self.printer_name = printer_name
        self.print_mode = print_mode
        self._stop_event = threading.Event()
        self._current_status = "IDLE"
        self._lock = threading.Lock()

    def set_status(self, status: str):
        with self._lock:
            self._current_status = status

    def get_status(self) -> str:
        with self._lock:
            return self._current_status

    def stop(self):
        self._stop_event.set()

    def send_now(self, is_initial: bool = False) -> bool:
        status = self.get_status()
        sys_info = {
            "platform": platform.platform(),
            "python": platform.python_version(),
            "mode": self.print_mode,
            "os": f"{platform.system()} {platform.release()}",
        }

        if is_initial:
            print(f"{get_timestamp()} Sending heartbeat...")

        res = self.api.send_heartbeat(
            status=status,
            system_info=sys_info
        )

        if res.get("success"):
            if is_initial:
                print(f"{get_timestamp()} [SUCCESS] Heartbeat acknowledged")
            else:
                print(f"{get_timestamp()} [HEARTBEAT] Online")
            return True
        else:
            err = res.get("error", "Unknown error")
            status_code = res.get("status_code")
            code_prefix = f"HTTP {status_code} - " if status_code else ""
            print(f"{get_timestamp()} [HEARTBEAT ERROR] {code_prefix}{err}")
            return False

    def run(self):
        while not self._stop_event.is_set():
            if self._stop_event.wait(self.interval):
                break
            self.send_now(is_initial=False)


def run_milestone1_standalone_test(file_path: str, printer_name: str, force_mock: bool):
    """
    Executes Milestone 1: Direct verification of Python -> Windows -> Printer
    WITHOUT requiring a backend server or database.
    """
    print("=" * 70)
    print("XEROX PRINT SHOP - MILESTONE 1: LOCAL PRINT ENGINE VERIFICATION")
    print("=" * 70)
    print(f"{get_timestamp()} Target File:    {file_path}")
    print(f"{get_timestamp()} Target Printer: {printer_name or 'DEFAULT (Windows system default)'}")
    print(f"{get_timestamp()} Operating Sys:  {platform.system()} {platform.release()}")
    print(f"{get_timestamp()} Python Version: {platform.python_version()}")

    mode = "mock" if force_mock else ("windows" if os.name == "nt" else "mock")
    if force_mock:
        print(f"{get_timestamp()} Mode Override:  Forced MOCK mode via --mock flag")
    elif os.name != "nt":
        print(f"{get_timestamp()} Mode Notice:    Non-Windows OS detected -> automatically using MOCK mode")
    else:
        print(f"{get_timestamp()} Mode Selected:  Real WINDOWS pywin32 print spooler")

    print("-" * 70)

    try:
        engine = WindowsPrinterEngine(mode=mode)

        # 1. Check if user wanted to verify file existence
        target = Path(file_path)
        if not target.exists():
            print(f"[ERROR] {get_timestamp()} File not found: '{file_path}'")
            print(f"        Please check that the path is correct and the document exists.")
            sys.exit(1)

        # 2. Show available printers
        try:
            installed = engine.list_printers()
            print(f"{get_timestamp()} Detected {len(installed)} printer(s):")
            for p in installed:
                print(f"           - {p}")
        except Exception as e:
            print(f"{get_timestamp()} [WARN] Could not enumerate printers: {e}")

        # 3. Perform print test
        settings = {
            "copies": 1,
            "paper_size": "A4",
            "color_mode": "BW",
            "sides": "SINGLE",
        }
        print(f"{get_timestamp()} Dispatching test document to print spooler...")
        result = engine.print_file(file_path=file_path, printer_name=printer_name, settings=settings)

        print("-" * 70)
        print(f"[SUCCESS] {get_timestamp()} Milestone 1 Test Passed!")
        print(f"          Status: {result.get('message')}")
        print(f"          Elapsed: {result.get('elapsed_seconds')}s")
        print("=" * 70)

    except DocumentNotFoundError as e:
        print(f"[ERROR] {get_timestamp()} Document Error: {e}")
        sys.exit(1)
    except PrinterNotFoundError as e:
        print(f"[ERROR] {get_timestamp()} Printer Error: {e}")
        sys.exit(1)
    except PrinterError as e:
        print(f"[ERROR] {get_timestamp()} Windows Spooler Error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"[ERROR] {get_timestamp()} Unexpected Failure: {e}")
        sys.exit(1)


def run_daemon_loop(config: AgentConfig):
    """
    Runs the continuous background polling loop:
    1. Authenticate with backend.
    2. Periodically send heartbeat.
    3. Poll for APPROVED orders.
    4. Atomically claim job (prevent duplicate printing).
    5. Download file.
    6. Send to printer.
    7. Update status to COMPLETED (or FAILED on error).
    """
    if AgentAPIClient is None or FileDownloader is None:
        print("[ERROR] Missing required dependencies for daemon polling mode.")
        print("        Please install dependencies using: pip install -r requirements.txt")
        sys.exit(1)

    print("=" * 70)
    print("XEROX PRINT SHOP - PRINT AGENT BACKGROUND SERVICE")
    print("=" * 70)
    print(f"{get_timestamp()} Agent ID:       {config.agent_id}")
    print(f"{get_timestamp()} Server URL:      {config.server_url}")
    print(f"{get_timestamp()} Printer:         {config.printer_name}")
    print(f"{get_timestamp()} Print Mode:      {config.print_mode.upper()}")
    print(f"{get_timestamp()} Poll Interval:   {config.poll_interval}s")
    print(f"{get_timestamp()} Spool Directory: {config.temp_dir}")
    print("=" * 70)

    api = AgentAPIClient(config)
    downloader = FileDownloader(temp_dir=config.temp_dir)
    printer_engine = WindowsPrinterEngine(mode=config.print_mode)

    # 1. Initial Authentication
    print(f"{get_timestamp()} Authenticating with backend...")
    try:
        auth_res = api.authenticate()
        print(f"{get_timestamp()} [SUCCESS] Authenticated successfully as '{auth_res.get('agent_name', config.agent_id)}'")
    except AgentAPIError as e:
        print(f"{get_timestamp()} [FATAL] Authentication failed: {e}")
        print("Please verify 'agent_id' and 'agent_token' in config.json or environment variables.")
        sys.exit(1)

    # 2. Start Dedicated Background Heartbeat Worker
    heartbeat_worker = HeartbeatWorker(
        api_client=api,
        interval=config.heartbeat_interval,
        printer_name=config.printer_name,
        print_mode=config.print_mode,
    )

    # Send initial synchronous heartbeat handshake
    heartbeat_worker.send_now(is_initial=True)
    heartbeat_worker.start()

    print(f"{get_timestamp()} Ready and listening for approved print jobs. Press Ctrl+C to stop.")

    try:
        while True:
            # Poll for approved jobs
            jobs = api.get_approved_jobs()

            if jobs:
                print(f"{get_timestamp()} Found {len(jobs)} approved print job(s) in queue.")

                for job in jobs:
                    job_id = job.get("id")
                    public_order_id = job.get("public_order_id", job_id)
                    files = job.get("files", [])

                    print("-" * 65)
                    print(f"{get_timestamp()} Processing Order #{public_order_id} ({len(files)} file(s))")

                    # Step 4: ATOMIC CLAIM - Prevents duplicate printing across multiple PCs/agents
                    claimed = api.claim_job(job_id)
                    if not claimed:
                        print(f"{get_timestamp()} Could not claim #{public_order_id} (already claimed by another agent). Skipping.")
                        continue

                    print(f"{get_timestamp()} Job #{public_order_id} claimed successfully.")
                    heartbeat_worker.set_status("PRINTING")

                    order_success = True
                    failure_reason = ""

                    for file_info in files:
                        file_id = file_info.get("id")
                        filename = file_info.get("original_filename", f"doc_{file_id}.pdf")
                        download_url = f"{config.server_url}/api/agent/jobs/{job_id}/files/{file_id}/download"
                        settings = file_info.get("print_settings", {})
                        expected_size = file_info.get("file_size_bytes")

                        print(f"{get_timestamp()} Downloading '{filename}'...")
                        local_path = None

                        try:
                            # Step 5: Download & Verify
                            local_path = downloader.download_file(
                                download_url=download_url,
                                filename=f"spool_{public_order_id}_{filename}",
                                agent_token=config.agent_token,
                                agent_id=config.agent_id,
                                session_cookie=config.session_cookie,
                                expected_size=expected_size
                            )

                            # Step 6: Mark PRINTING on backend
                            api.mark_printing(job_id)

                            # Step 7: Send to Windows Print Spooler
                            print(f"{get_timestamp()} Sending '{filename}' to Windows printing system...")
                            print_res = printer_engine.print_file(
                                file_path=str(local_path),
                                printer_name=config.printer_name,
                                settings=settings
                            )
                            print(f"{get_timestamp()} Print result: {print_res.get('message')}")

                        except (DownloaderError, PrinterError, Exception) as e:
                            order_success = False
                            failure_reason = str(e)
                            print(f"{get_timestamp()} [ERROR] Failed processing '{filename}': {e}")
                            break
                        finally:
                            # Step 8: Clean up local spooled file
                            if local_path:
                                downloader.cleanup_file(local_path)

                    # Step 9: Final status reporting
                    if order_success:
                        api.mark_completed(job_id, {"completed_at": datetime.now().isoformat()})
                        print(f"{get_timestamp()} [SUCCESS] Order #{public_order_id} marked COMPLETED.")
                    else:
                        api.mark_failed(job_id, failure_reason)
                        print(f"{get_timestamp()} [FAILED] Order #{public_order_id} marked FAILED ({failure_reason}).")

                    heartbeat_worker.set_status("IDLE")
                    print("-" * 65)

            time.sleep(config.poll_interval)

    except KeyboardInterrupt:
        print(f"\n{get_timestamp()} Agent shut down requested by operator (Ctrl+C). Exiting.")
        heartbeat_worker.stop()
        sys.exit(0)


def main():
    parser = argparse.ArgumentParser(
        description="Xerox Print Shop Automation - Windows Print Agent",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  Standalone test on local PDF:
    python agent.py --test "test.pdf"
    python agent.py --test "test.pdf" --mock
    python agent.py --list-printers

  Background polling daemon:
    python agent.py --loop
    python agent.py --loop --config my_config.json
        """
    )
    parser.add_argument("--test", metavar="FILE_PATH", help="Run Milestone 1 standalone print test on a local file")
    parser.add_argument("--printer", default=None, help="Specify printer name to use (default: OS default)")
    parser.add_argument("--list-printers", action="store_true", help="List installed printers on this machine")
    parser.add_argument("--mock", action="store_true", help="Force mock print mode (no physical paper consumed)")
    parser.add_argument("--loop", action="store_true", help="Run continuous background polling loop")
    parser.add_argument("--server", default=None, help="Override server URL (e.g. http://localhost:3000)")
    parser.add_argument("--cookie", default=None, help="Session cookie if connecting to protected development server")
    parser.add_argument("--config", default="config.json", help="Path to config.json file (default: config.json)")

    args = parser.parse_args()

    # Load configuration
    cfg = AgentConfig.load(args.config)
    if args.server:
        cfg.server_url = args.server.rstrip("/")
    if args.cookie:
        cfg.session_cookie = args.cookie
    if args.printer:
        cfg.printer_name = args.printer
    if args.mock:
        cfg.print_mode = "mock"

    # Action 1: List printers
    if args.list_printers:
        engine = WindowsPrinterEngine(mode=cfg.print_mode)
        try:
            printers = engine.list_printers()
            default = engine.get_default_printer()
            print("\nAvailable Windows Printers:")
            for p in printers:
                star = " [DEFAULT]" if p.lower() == default.lower() else ""
                print(f"  • {p}{star}")
            print()
        except Exception as e:
            print(f"[ERROR] Could not list printers: {e}")
        return

    # Action 2: Milestone 1 standalone test
    if args.test:
        run_milestone1_standalone_test(
            file_path=args.test,
            printer_name=cfg.printer_name,
            force_mock=args.mock
        )
        return

    # Action 3: Daemon loop (default if --loop or no test flag)
    run_daemon_loop(cfg)


if __name__ == "__main__":
    main()
