# Print Shop Automation System

A production-grade, secure automation system designed specifically for Xerox, print, and copy shops.

Customers scan a QR code at the counter, upload documents (PDF, JPG, PNG) on their smartphone without needing an account, pick paper size and copies, and track their print job in real time. The shopkeeper reviews submissions in an Admin Dashboard. Upon manual approval, a local **Python Print Agent** running securely on the shop's Windows PC downloads the document and sends it directly to the local Windows printing subsystem (**pywin32 / Windows Print Spooler**).

---

## 1. What the System Does

- **Eliminates USB drives & cords:** Customers do not plug untrusted flash drives or phones into shop PCs.
- **Mobile-first customer kiosk:** Fast drag-and-drop / photo upload with no user registration required.
- **Admin approval gate:** Shopkeeper manually inspects the document, settings, and confirms customer payment before any paper or toner is consumed.
- **Zero internet exposure for printers:** Physical printers and shop PCs have **no public ports open**. Communication is strictly outbound from the local Python agent to the cloud backend.
- **Atomic job claiming:** Guarantees that multiple shop PCs or retry loops can never accidentally print the same job twice.

---

## 2. Architecture & Data Flow

```
[ Customer Smartphone / Laptop ]
               │ (Uploads PDF/Image via HTTPS)
               ▼
       [ Cloud Backend API ]  ◄────►  [ Storage & Database ]
               │
               ▼
      [ Admin Dashboard ]
     (Shopkeeper clicks Approve)
               │
      (Status: APPROVED)
               │
               ▲
               │ (Outbound HTTP polling / X-Agent-Token)
     [ Local Python Print Agent ]  <-- Runs on Shop Windows PC
               │
               ▼
     [ Windows Print Spooler ]     <-- pywin32 / ShellExecute
               │
               ▼
     [ Windows Printer Driver ]
               │
               ▼
     [ Physical Xerox / Printer ]
```

---

## 3. How the Customer Flow Works

1. Customer arrives at the counter and scans the printed shop QR code with their mobile camera.
2. The customer web portal opens (e.g., `https://shop.example.com`).
3. The customer selects up to 10 files (PDF, JPG, PNG, max 20 MB each).
4. The customer chooses:
   - **Paper Size:** A4 or A3
   - **Color Mode:** Black & White or Color
   - **Sides:** Single-sided or Double-sided
   - **Copies:** 1 to 20
   - **Page Range:** All pages or custom range (e.g. `1-5, 8`)
5. Customer submits the request and receives a unique Public Order ID (e.g., `PS-20260926-001`).
6. The status page dynamically reflects real-time progression:
   - `🟡 Waiting for shop approval`
   - `🟢 Approved`
   - `⚙️ Claimed by Print Agent`
   - `🔵 Printing (in Windows Spooler)`
   - `✅ Printing completed!`
   - `❌ Request rejected` (if shopkeeper declines with a reason)

---

## 4. How the Admin Flow Works

1. Shopkeeper opens `/admin` on the counter workstation or tablet.
2. Authenticates securely (default credentials: `admin` / `xerox123`).
3. The dashboard displays the real-time agent status banner:
   - `🟢 Shop PC Online (Last seen 6s ago - EPSON L3150)`
4. When a new submission arrives under the **Pending** queue, the shopkeeper clicks **View** to inspect:
   - File preview, original filename, file size
   - Requested copies, paper size, and color mode
   - Special instructions / notes
5. The customer pays in cash or UPI at the counter.
6. The shopkeeper clicks **Approve** (transitions order from `PENDING` to `APPROVED`).
   - If the file is unreadable or out of stock, the shopkeeper clicks **Reject** and selects a reason.
   - If an error occurs, the shopkeeper can click **Retry Job**.

---

## 5. How the Backend Works

- **Framework:** Node.js with TypeScript and Express.
- **REST Endpoints:**
  - `POST /api/orders` — Customer order creation with file validation (MIME, size, sanitization).
  - `GET /api/orders/:publicOrderId` — Public status tracking.
  - `POST /api/admin/login` — Admin authentication.
  - `GET /api/admin/orders` — Admin queue with status filters.
  - `POST /api/admin/orders/:id/approve` — Moves order to `APPROVED`.
  - `POST /api/admin/orders/:id/reject` — Moves order to `REJECTED`.
  - `POST /api/admin/orders/:id/retry` — Resets `FAILED` orders back to `APPROVED`.
  - `POST /api/agent/heartbeat` — Agent alive monitor (online within 30 seconds).
  - `GET /api/agent/jobs` — Polls for `APPROVED` jobs.
  - `POST /api/agent/jobs/:id/claim` — Atomic job claiming (mutex lock / database lock).
  - `POST /api/agent/jobs/:id/printing` — Marks active printing.
  - `POST /api/agent/jobs/:id/completed` — Marks successful completion.
  - `POST /api/agent/jobs/:id/failed` — Records failure reason.
  - `GET /api/agent/jobs/:id/files/:fileId/download` — Authorized file stream for the agent.

---

## 6. How the Print Agent Works

The agent is an independent Python application running in `print-agent/`:
- `agent.py`: CLI supporting both Milestone 1 standalone test (`--test`) and daemon polling (`--loop`).
- `printer.py`: Windows pywin32 print subsystem integration (`win32print`, `win32api`).
- `api_client.py`: Secure REST client with dedicated `X-Agent-ID` and `X-Agent-Token`.
- `downloader.py`: Streams document to temporary local `./spool` folder and removes it immediately after printing.
- `config.py`: Loads configuration from `config.json` or environment variables.

---

## 7. How Python Communicates with the Backend

1. **Authentication:**
   Sends `X-Agent-ID: SHOP_001` and `X-Agent-Token: agent_secret_token_123`.
2. **Heartbeat:**
   Periodically (every 10s) calls `POST /api/agent/heartbeat` with system diagnostics.
3. **Polling:**
   Every 3s calls `GET /api/agent/jobs`.
4. **Atomic Claiming:**
   Before printing, the agent calls `POST /api/agent/jobs/<id>/claim`. If another agent already claimed the job, HTTP 409 is returned and the agent skips it.

---

## 8. How Python Communicates with Windows

Inside `print-agent/printer.py`:
1. `win32print.EnumPrinters(flags)` discovers installed printers and default printers.
2. `win32print.OpenPrinter()` queries driver properties, port mapping (`USB002`), and spooler health.
3. Native `pDevMode.Copies = copies` configures the driver directly, spooling a single job rather than multiple fragmented requests.
4. `win32ui.CreateDC()` creates an authentic Windows Printer Device Context (DC) bound to the target printer.
5. Documents are rendered directly into the Device Context:
   - **PDF:** Rendered to crisp 300 DPI GDI bitmaps via Google PDFium (`pypdfium2`).
   - **Images (JPG, PNG):** Rendered to GDI DIBs via `Pillow (PIL.ImageWin)`.
6. `pdc.StartDoc()`, `pdc.StartPage()`, `dib.draw()`, and `pdc.EndPage()` / `pdc.EndDoc()` deliver the rendered pages directly to `spoolsv.exe`.

---

## 9. How Windows Communicates with the Printer

```
Python Agent (pypdfium2 / Pillow)
                 │
                 ▼
Windows GDI Device Context (`win32ui`)
                 │
                 ▼
Windows Print Spooler Service (`spoolsv.exe`)
                 │
                 ▼
EPSON Printer Driver (ESC/P-R)
(Translates GDI commands into ESC/P-R printer raster stream)
                 │
                 ▼
Windows USB Port (`USB002`)
                 │
                 ▼
Physical EPSON L8050 Printer
```

---

## 10. How to Install Python on Windows

1. Download Python 3.10+ from [python.org](https://www.python.org/downloads/).
2. **CRITICAL:** Check the box **"Add Python to PATH"** during installation.
3. Open Windows Command Prompt (`cmd.exe`) and verify:
   ```cmd
   python --version
   pip --version
   ```

---

## 11. How to Install Dependencies

On the shop's Windows PC:
```cmd
cd print-agent
pip install -r requirements.txt
```
Or directly:
```cmd
pip install requests pywin32 Pillow pypdfium2
```

---

## 12. How to Configure the Agent

Edit `print-agent/config.json`:
```json
{
  "server_url": "https://your-print-shop-domain.com",
  "agent_id": "SHOP_001",
  "agent_token": "agent_secret_token_123",
  "printer_name": "DEFAULT",
  "poll_interval": 3,
  "heartbeat_interval": 10,
  "print_mode": "windows",
  "temp_dir": "./spool"
}
```

---

## 13. How to Run the Agent

### Standalone Test (Milestone 1):
```cmd
python agent.py --test "test_sample.pdf"
```

### List Installed Windows Printers:
```cmd
python agent.py --list-printers
```

### Continuous Background Polling Service (Production):
```cmd
python agent.py --loop
```

---

## 14. How to Test with a Real PDF

1. Generate or copy any test PDF into `print-agent/`:
   ```cmd
   python create_test_pdf.py
   ```
2. Test printing directly to your Windows default printer:
   ```cmd
   python agent.py --test "test_sample.pdf"
   ```
3. To specify a specific printer:
   ```cmd
   python agent.py --test "test_sample.pdf" --printer "EPSON L3150 Series"
   ```

---

## 15. How to Switch Between Mock and Real Printing

- **Mock mode** (safe development mode that does not consume paper or ink):
  ```cmd
  python agent.py --test "test_sample.pdf" --mock
  ```
  Or set `"print_mode": "mock"` in `config.json`.
- **Windows real mode:**
  Set `"print_mode": "windows"` in `config.json`.

---

## 16. How to Deploy the Backend

```bash
# Build frontend
npm run build

# Start production server
npm start
```
The server binds to port 3000 (or `process.env.PORT`).

---

## 17. How to Configure Storage and Database

- **PostgreSQL:** Run `database/schema.sql` against your PostgreSQL database.
- **Storage:** Stored locally in `uploads/` with randomized SHA keys, or set S3/Supabase storage credentials.
- **Retention Cleanup:** Files older than 24 hours from completed/rejected orders are automatically scrubbed by `server/services/cleanupService.ts`.

---

## 18. Security Considerations

- **Private Printer Isolation:** The printer IP/port is never exposed to the internet.
- **No USB Malware Risk:** Customers upload through their own devices; no infected flash drives touch the counter PC.
- **File Validation:** MIME checking, extension sanitization, and 20 MB size limits prevent malicious payload execution.
- **Agent Token Isolation:** The agent only has access to claim and fetch approved print jobs; it has zero administrative privileges.

---

## 19. Future WhatsApp Integration Architecture

The backend is built modularly:
```
[ WhatsApp Business API Webhook ]
               │
               ▼
[ Webhook Ingestion Service ]  ──► Creates same Order (orders table)
                                         │
                                         ▼
                            [ Same Admin Dashboard ]
                                         │
                                         ▼
                            [ Same Python Print Agent ]
```
Customers will be able to send a PDF over WhatsApp, receive an automated Order ID, and have it printed using the exact same local Windows agent without changing the shop's printer setup.
