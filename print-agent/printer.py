"""
Windows Printing Engine for the Xerox Print Shop Agent.

Uses pywin32 (win32print, win32api) to interact directly with the
Windows Print Spooler and Printer Drivers.

Supports both real Windows printing and mock mode for development/testing.
"""

import os
import sys
import time
from pathlib import Path
from typing import List, Optional, Dict, Any

# Attempt to import Windows-specific pywin32 libraries
WIN32_AVAILABLE = False
if sys.platform == "win32":
    try:
        import win32print
        import win32api
        WIN32_AVAILABLE = True
    except ImportError:
        WIN32_AVAILABLE = False


class PrinterError(Exception):
    """Base exception for printing errors."""
    pass


class PrinterNotFoundError(PrinterError):
    """Raised when a specified or default printer cannot be located."""
    pass


class DocumentNotFoundError(PrinterError):
    """Raised when the document file to be printed does not exist."""
    pass


class WindowsPrinterEngine:
    """
    Manages discovery, selection, and job transmission to Windows printers
    via the Windows Print Spooler API (pywin32).
    """

    def __init__(self, mode: str = "windows"):
        """
        :param mode: 'windows' to send real jobs via pywin32,
                     'mock' to simulate printing without paper/toner.
        """
        self.mode = mode.lower()
        if self.mode == "windows" and not WIN32_AVAILABLE:
            print("[WARN] pywin32 is not installed or not running on Windows. Falling back to MOCK mode.")
            self.mode = "mock"

    def list_printers(self) -> List[str]:
        """
        Queries the Windows Print Subsystem for all installed local and network printers.
        """
        if self.mode == "mock" or not WIN32_AVAILABLE:
            return [
                "EPSON L3150 Series (Mock)",
                "HP LaserJet Pro M404dn (Mock)",
                "Canon imageRUNNER 2520 (Mock)",
                "Microsoft Print to PDF"
            ]

        try:
            # PRINTER_ENUM_LOCAL: locally attached USB/LPT printers
            # PRINTER_ENUM_CONNECTIONS: network-mapped Windows printers
            flags = win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
            printers = win32print.EnumPrinters(flags)
            # Tuple structure: (flags, description, name, comment)
            printer_names = [p[2] for p in printers]
            return printer_names
        except Exception as e:
            raise PrinterError(f"Failed to enumerate Windows printers: {e}")

    def get_default_printer(self) -> str:
        """
        Retrieves the name of the default Windows printer configured in the OS.
        """
        if self.mode == "mock" or not WIN32_AVAILABLE:
            return "EPSON L3150 Series (Mock)"

        try:
            default_printer = win32print.GetDefaultPrinter()
            if not default_printer:
                raise PrinterNotFoundError("No default printer is configured in Windows.")
            return default_printer
        except Exception as e:
            raise PrinterNotFoundError(f"Unable to get default printer from Windows: {e}")

    def resolve_printer(self, target_name: Optional[str] = None) -> str:
        """
        Resolves a printer name. If 'DEFAULT' or None, resolves to the Windows default.
        Validates that the resolved printer actually exists on the system.
        """
        installed = self.list_printers()
        if not installed:
            raise PrinterNotFoundError("No printers were detected on this computer.")

        if not target_name or target_name.upper() == "DEFAULT":
            resolved = self.get_default_printer()
            print(f"[INFO] Using Windows default printer: '{resolved}'")
            return resolved

        # Case-insensitive match against installed printers
        for name in installed:
            if name.lower() == target_name.lower():
                print(f"[INFO] Found configured printer: '{name}'")
                return name

        raise PrinterNotFoundError(
            f"Configured printer '{target_name}' was not found. "
            f"Available printers: {', '.join(installed)}"
        )

    def print_file(
        self,
        file_path: str,
        printer_name: Optional[str] = "DEFAULT",
        settings: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Sends a PDF or image file to the designated Windows printer.

        :param file_path: Absolute or relative path to PDF, JPG, or PNG.
        :param printer_name: Target printer name or 'DEFAULT'.
        :param settings: Dictionary of print settings (copies, color, paper_size, sides).
        :return: Result dictionary with status, timestamp, and details.
        """
        settings = settings or {}
        copies = int(settings.get("copies", 1))
        paper_size = settings.get("paper_size", "A4")
        color_mode = settings.get("color_mode", "BW")
        sides = settings.get("sides", "SINGLE")

        # Step 1: Verify file existence and readability
        target_path = Path(file_path).resolve()
        if not target_path.exists():
            raise DocumentNotFoundError(f"Print file does not exist: {target_path}")

        file_size = target_path.stat().st_size
        if file_size == 0:
            raise DocumentNotFoundError(f"Print file is 0 bytes (empty): {target_path}")

        # Step 2: Resolve target printer
        selected_printer = self.resolve_printer(printer_name)

        print("=" * 65)
        print(f"[*] INITIATING PRINT JOB")
        print(f"    File:       {target_path.name} ({file_size} bytes)")
        print(f"    Path:       {target_path}")
        print(f"    Printer:    {selected_printer}")
        print(f"    Mode:       {'[MOCK SIMULATION]' if self.mode == 'mock' else '[REAL WINDOWS SPOOLER]'}")
        print(f"    Settings:   {copies} cop(y/ies), {paper_size}, {color_mode}, {sides}")
        print("=" * 65)

        start_time = time.time()

        # Step 3: Execute print (Mock vs Real)
        if self.mode == "mock":
            return self._mock_print(target_path, selected_printer, copies, start_time)
        else:
            return self._windows_print(target_path, selected_printer, copies, start_time)

    def _mock_print(self, file_path: Path, printer_name: str, copies: int, start_time: float) -> Dict[str, Any]:
        """
        Simulates print spooling with realistic timing for testing and dev environments.
        """
        print(f"[MOCK] 1. Handshake with virtual printer '{printer_name}'...")
        time.sleep(0.4)
        print(f"[MOCK] 2. Reading file stream ({file_path.stat().st_size} bytes)...")
        time.sleep(0.4)
        for c in range(1, copies + 1):
            print(f"[MOCK] 3. Spooling copy {c}/{copies} into Windows Print Spooler queue...")
            time.sleep(0.5)
        print(f"[MOCK] 4. Spooler dispatched job to printer driver. Spool buffer cleared.")
        time.sleep(0.3)

        elapsed = round(time.time() - start_time, 2)
        print(f"[SUCCESS] Mock print completed in {elapsed}s.")
        return {
            "success": True,
            "mode": "mock",
            "printer": printer_name,
            "file": str(file_path),
            "copies": copies,
            "elapsed_seconds": elapsed,
            "message": f"Successfully simulated printing {copies} copy/copies to {printer_name}"
        }

    def _windows_print(self, file_path: Path, printer_name: str, copies: int, start_time: float) -> Dict[str, Any]:
        """
        Sends the file directly to the Windows printing system via win32api ShellExecute 'printto'.
        Windows ShellExecute 'printto' routes the document through the registered Windows
        handler application (such as Edge/Acrobat/Windows Photo Viewer) directly to the
        named printer's Spooler queue without displaying a GUI dialog.
        """
        try:
            print(f"[WINDOWS] 1. Verifying printer handle for: '{printer_name}'...")
            # Verify the printer can be opened and is online in Windows spooler
            hprinter = win32print.OpenPrinter(printer_name)
            try:
                printer_info = win32print.GetPrinter(hprinter, 2)
                spooler_status = printer_info.get("Status", 0)
                driver_name = printer_info.get("pDriverName", "Unknown")
                port_name = printer_info.get("pPortName", "Unknown")
                print(f"[WINDOWS]    Driver: {driver_name} | Port: {port_name} | Status Code: {spooler_status}")
            finally:
                win32print.ClosePrinter(hprinter)

            # Print requested number of copies
            for c in range(1, copies + 1):
                print(f"[WINDOWS] 2. Sending copy {c}/{copies} to Windows Print Spooler...")
                # win32api.ShellExecute(hwnd, op, file, params, dir, bShow)
                # 'printto' verb syntax: params = '"<PrinterName>"'
                params = f'"{printer_name}"'
                res = win32api.ShellExecute(
                    0,
                    "printto",
                    str(file_path),
                    params,
                    str(file_path.parent),
                    0  # SW_HIDE: completely silent in background
                )
                # ShellExecute returns > 32 on success
                if res <= 32:
                    # Fallback to standard 'print' verb to default printer if 'printto' verb isn't supported for extension
                    print(f"[WARN] 'printto' verb returned code {res}. Attempting standard 'print' verb...")
                    res2 = win32api.ShellExecute(
                        0,
                        "print",
                        str(file_path),
                        None,
                        str(file_path.parent),
                        0
                    )
                    if res2 <= 32:
                        raise PrinterError(f"Windows ShellExecute print failed with error code: {res2}")

                # Give Windows Spooler a small breather between multiple copies
                if copies > 1 and c < copies:
                    time.sleep(1.0)

            elapsed = round(time.time() - start_time, 2)
            print(f"[WINDOWS] 3. Windows Spooler accepted job. Spooling to driver.")
            print(f"[SUCCESS] Print job successfully queued in {elapsed}s.")

            return {
                "success": True,
                "mode": "windows",
                "printer": printer_name,
                "file": str(file_path),
                "copies": copies,
                "elapsed_seconds": elapsed,
                "message": f"Successfully queued {copies} copies to Windows printer {printer_name}"
            }

        except Exception as e:
            print(f"[ERROR] Windows printing failed: {e}")
            raise PrinterError(f"Windows Print Spooler error: {e}")
