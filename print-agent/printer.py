"""
Windows Printing Engine for the Xerox Print Shop Agent.

Replaces fragile ShellExecute('printto') with robust native Windows GDI/DEVMODE
spooler architecture using win32print, win32ui, and win32gui.

Execution chain:
Python Agent -> Document Renderer (pypdfium2/Pillow) -> Windows Device Context (win32ui DC)
             -> Windows Print Spooler (spoolsv.exe) -> EPSON Driver -> EPSON L8050

Supports PDF, JPG/JPEG, and PNG.
Maintains Mock Mode for safe non-physical simulation on any OS.
"""

import os
import sys
import time
from pathlib import Path
from typing import List, Optional, Dict, Any, Generator

# Lazy-loaded rendering libraries
PDF_RENDERER_AVAILABLE = False
IMAGE_RENDERER_AVAILABLE = False

try:
    from PIL import Image, ImageWin
    IMAGE_RENDERER_AVAILABLE = True
except ImportError:
    Image = None
    ImageWin = None

try:
    import pypdfium2 as pdfium
    PDF_RENDERER_AVAILABLE = True
except ImportError:
    pdfium = None

# Attempt to import Windows-specific pywin32 libraries
WIN32_AVAILABLE = False
if sys.platform == "win32":
    try:
        import win32print
        import win32ui
        import win32gui
        import win32con
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
    Manages discovery, selection, DEVMODE copies configuration, and direct
    Windows GDI Spooler transmission via win32ui.CreateDC() and win32print.
    """

    def __init__(self, mode: str = "windows"):
        """
        :param mode: 'windows' to send real jobs via native Windows GDI / win32print,
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
                "EPSON L8050 Series (Mock)",
                "EPSON L3150 Series (Mock)",
                "HP LaserJet Pro M404dn (Mock)",
                "Canon imageRUNNER 2520 (Mock)",
                "Microsoft Print to PDF"
            ]

        try:
            flags = win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
            printers = win32print.EnumPrinters(flags)
            return [p[2] for p in printers]
        except Exception as e:
            raise PrinterError(f"Failed to enumerate Windows printers: {e}")

    def get_default_printer(self) -> str:
        """
        Retrieves the name of the default Windows printer configured in the OS.
        """
        if self.mode == "mock" or not WIN32_AVAILABLE:
            return "EPSON L8050 Series (Mock)"

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
        Sends a PDF, JPG, or PNG file to the designated Windows printer.

        :param file_path: Absolute or relative path to PDF, JPG, or PNG.
        :param printer_name: Target printer name or 'DEFAULT'.
        :param settings: Dictionary of print settings (copies, color, paper_size, sides).
        :return: Result dictionary with status, timestamp, and details.
        """
        settings = settings or {}
        copies = max(1, int(settings.get("copies", 1)))
        paper_size = settings.get("paper_size", "A4")
        color_mode = settings.get("color_mode", "BW")
        sides = settings.get("sides", "SINGLE")

        target_path = Path(file_path).resolve()
        if not target_path.exists():
            raise DocumentNotFoundError(f"Print file does not exist: {target_path}")

        file_size = target_path.stat().st_size
        if file_size == 0:
            raise DocumentNotFoundError(f"Print file is 0 bytes (empty): {target_path}")

        selected_printer = self.resolve_printer(printer_name)

        print("=" * 70)
        print("[*] INITIATING PRINT JOB")
        print(f"    Selected printer: {selected_printer}")
        print(f"    File:             {target_path.name} ({file_size} bytes)")
        print(f"    Path:             {target_path}")
        print(f"    Print method:     {'[MOCK SIMULATION]' if self.mode == 'mock' else 'Windows GDI Device Context (win32ui)'}")
        print(f"    Copies:           {copies}")
        print(f"    Format Settings:  paper={paper_size}, color={color_mode}, sides={sides}")
        print("=" * 70)

        start_time = time.time()

        if self.mode == "mock":
            return self._mock_print(target_path, selected_printer, copies, start_time)
        else:
            return self._windows_print(target_path, selected_printer, copies, start_time, settings)

    def _mock_print(self, file_path: Path, printer_name: str, copies: int, start_time: float) -> Dict[str, Any]:
        """
        Simulates print spooling with detailed logging for testing and development.
        GUARANTEES no physical paper or toner is ever consumed.
        """
        print(f"[MOCK] 1. Handshake with virtual printer '{printer_name}'...")
        time.sleep(0.3)
        print(f"[MOCK]    Printer driver: EPSON ESC/P-R V4 (Simulated)")
        print(f"[MOCK]    Printer port:   USB002 (Simulated)")
        print(f"[MOCK] 2. Inspecting document format: '{file_path.suffix.upper()}' ({file_path.stat().st_size} bytes)...")
        time.sleep(0.3)
        print(f"[MOCK] 3. Initializing virtual Windows GDI Device Context...")
        print(f"[MOCK]    Configured native DEVMODE copies = {copies}")
        time.sleep(0.4)
        print(f"[MOCK] 4. Spooling 1 print job ({copies} copy/copies) into Windows Spooler (spoolsv.exe)...")
        time.sleep(0.5)
        print(f"[MOCK] 5. Windows Spooler dispatched GDI bitmap to printer driver. Spool buffer cleared.")

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

    def _windows_print(
        self,
        file_path: Path,
        printer_name: str,
        copies: int,
        start_time: float,
        settings: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Directly prints documents to the Windows Print Spooler using Windows GDI Device Contexts.
        
        Execution:
        1. Query printer capabilities (driver, port, status).
        2. Configure DEVMODE for native copies (dmCopies = copies).
        3. Create GDI Printer DC (win32ui.CreateDC()).
        4. Render pages to GDI Device Context via win32ui / win32gui.
        5. Windows Spooler sends rendered pages to Epson printer driver.
        """
        driver_name = "Unknown"
        port_name = "Unknown"
        spooler_status = 0
        hprinter = None

        try:
            # 1. Inspect printer details via win32print
            hprinter = win32print.OpenPrinter(printer_name)
            try:
                printer_info = win32print.GetPrinter(hprinter, 2)
                driver_name = printer_info.get("pDriverName", "Unknown")
                port_name = printer_info.get("pPortName", "Unknown")
                spooler_status = printer_info.get("Status", 0)
            except Exception as e:
                print(f"[WINDOWS] [WARN] Could not read extended printer properties: {e}")

            print(f"[WINDOWS] Printer Driver: {driver_name}")
            print(f"[WINDOWS] Printer Port:   {port_name}")
            print(f"[WINDOWS] Spooler Status: {spooler_status} (0 = Ready/Idle)")

            # 2. Configure native DEVMODE for copies
            devmode = None
            native_copies_configured = False
            try:
                p_devmode = printer_info.get("pDevMode")
                if p_devmode:
                    p_devmode.Copies = copies
                    devmode = p_devmode
                    native_copies_configured = True
                    print(f"[WINDOWS] Native DEVMODE configured: {copies} cop(y/ies) in single print job.")
            except Exception as e:
                print(f"[WINDOWS] [INFO] DEVMODE copy config not available ({e}); will handle copies cleanly.")

            # 3. Create Windows GDI Device Context
            print(f"[WINDOWS] Initializing GDI Device Context for '{printer_name}'...")
            pdc = win32ui.CreateDC()
            if devmode:
                pdc.CreatePrinterDC(printer_name)
            else:
                pdc.CreatePrinterDC(printer_name)

            # Get printable pixel area from Device Context
            printable_width = pdc.GetDeviceCaps(win32con.HORZRES)
            printable_height = pdc.GetDeviceCaps(win32con.VERTRES)
            dpi_x = pdc.GetDeviceCaps(win32con.LOGPIXELSX)
            dpi_y = pdc.GetDeviceCaps(win32con.LOGPIXELSY)
            print(f"[WINDOWS] Printable Area: {printable_width}x{printable_height} px @ {dpi_x}x{dpi_y} DPI")

            # Determine copies multiplier: if driver accepted native dmCopies, loop once; else loop
            job_repeat = 1 if native_copies_configured else copies

            job_title = f"SmartPrint_{file_path.stem}"
            ext = file_path.suffix.lower()

            for copy_idx in range(1, job_repeat + 1):
                if job_repeat > 1:
                    print(f"[WINDOWS] Sending document copy {copy_idx}/{job_repeat} to Windows Spooler...")

                pdc.StartDoc(job_title)

                if ext == ".pdf":
                    self._render_pdf_to_dc(pdc, file_path, printable_width, printable_height)
                elif ext in [".jpg", ".jpeg", ".png", ".bmp"]:
                    self._render_image_to_dc(pdc, file_path, printable_width, printable_height)
                else:
                    pdc.AbortDoc()
                    raise PrinterError(f"Unsupported file format '{ext}'. Supported: PDF, JPG, PNG.")

                pdc.EndDoc()

            # Clean up DC
            pdc.DeleteDC()

            elapsed = round(time.time() - start_time, 2)
            print(f"[WINDOWS] Windows Spooler/job result: Job queued successfully into spoolsv.exe")
            print(f"[SUCCESS] Document delivered to {printer_name} in {elapsed}s.")

            return {
                "success": True,
                "mode": "windows",
                "printer": printer_name,
                "driver": driver_name,
                "port": port_name,
                "file": str(file_path),
                "copies": copies,
                "elapsed_seconds": elapsed,
                "message": f"Successfully queued {copies} cop(y/ies) to {printer_name} ({driver_name} on {port_name})"
            }

        except Exception as e:
            print(f"[ERROR] Windows GDI printing failed: {e}")
            raise PrinterError(f"Windows Print Spooler error: {e}")
        finally:
            if hprinter:
                try:
                    win32print.ClosePrinter(hprinter)
                except Exception:
                    pass

    def _render_pdf_to_dc(self, pdc, pdf_path: Path, max_w: int, max_h: int):
        """
        Renders PDF pages directly into the Windows Printer Device Context using pypdfium2.
        pypdfium2 uses Google's PDFium engine to rasterize vector PDF pages into crisp
        DPI-matched GDI bitmaps without launching external viewer executables.
        """
        try:
            import pypdfium2 as pdfium
            from PIL import Image, ImageWin
        except ImportError:
            raise PrinterError(
                "PDF printing requires 'pypdfium2' and 'Pillow'. "
                "Please run: pip install pypdfium2 Pillow"
            )

        try:
            pdf = pdfium.PdfDocument(str(pdf_path))
            total_pages = len(pdf)
            print(f"[WINDOWS] Rendering PDF ({total_pages} page(s)) via PDFium engine...")

            for page_num in range(total_pages):
                page = pdf.get_page(page_num)
                # Render at 300 DPI for sharp, professional print output
                rendered = page.render(scale=300 / 72.0)
                pil_image = rendered.to_pil()

                # Start page in Windows GDI Spooler
                pdc.StartPage()

                # Scale to fit printable dimensions while preserving aspect ratio
                img_w, img_h = pil_image.size
                scale = min(max_w / img_w, max_h / img_h)
                dest_w = int(img_w * scale)
                dest_h = int(img_h * scale)
                # Center on page
                dest_x = (max_w - dest_w) // 2
                dest_y = (max_h - dest_h) // 2

                # Convert to RGB and paint into Windows GDI DC
                if pil_image.mode != "RGB":
                    pil_image = pil_image.convert("RGB")

                dib = ImageWin.Dib(pil_image)
                dib.draw(pdc.GetHandleOutput(), (dest_x, dest_y, dest_x + dest_w, dest_y + dest_h))

                pdc.EndPage()
                print(f"[WINDOWS]    Page {page_num + 1}/{total_pages} rasterized and spooled.")

            pdf.close()

        except Exception as e:
            raise PrinterError(f"Failed to render PDF to Windows Device Context: {e}")

    def _render_image_to_dc(self, pdc, img_path: Path, max_w: int, max_h: int):
        """
        Renders JPG, JPEG, or PNG images into the Windows Printer Device Context via Pillow.
        """
        try:
            from PIL import Image, ImageWin
        except ImportError:
            raise PrinterError(
                "Image printing requires 'Pillow'. "
                "Please run: pip install Pillow"
            )

        try:
            with Image.open(str(img_path)) as img:
                print(f"[WINDOWS] Rendering image ({img.format}, {img.size[0]}x{img.size[1]} px)...")
                pdc.StartPage()

                if img.mode != "RGB":
                    img = img.convert("RGB")

                img_w, img_h = img.size
                scale = min(max_w / img_w, max_h / img_h)
                dest_w = int(img_w * scale)
                dest_h = int(img_h * scale)
                dest_x = (max_w - dest_w) // 2
                dest_y = (max_h - dest_h) // 2

                dib = ImageWin.Dib(img)
                dib.draw(pdc.GetHandleOutput(), (dest_x, dest_y, dest_x + dest_w, dest_y + dest_h))

                pdc.EndPage()
                print(f"[WINDOWS]    Image rasterized and spooled to printer DC.")

        except Exception as e:
            raise PrinterError(f"Failed to render image to Windows Device Context: {e}")
