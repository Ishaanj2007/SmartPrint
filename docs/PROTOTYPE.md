# SmartPrint: Prototype Architecture & Lessons Learned

> **Document Status:** PROTOTYPE ARCHIVE / LEARNING REFERENCE

This document outlines the technical architecture, implemented features, and engineering lessons learned during the development of the SmartPrint prototype.

---

## 1. System Overview & Workflow

SmartPrint addresses a real-world problem in retail print shops and xerox counters: customers want to upload documents from their phones without handing over their devices or messaging files via personal chat apps, while shop operators need automated printing directly to counter printers.

```text
Customer (Mobile Web)
       │  Upload document (PDF/Image), select paper size, copies, color mode
       ▼
SmartPrint Web Backend (Express API)
       │  Stores uploaded file to local disk, generates public order ID (PS-YYYYMMDD-XXX)
       ▼
Admin Dashboard (Counter Operator)
       │  Reviews order details, verifies payment, clicks "Approve & Print"
       ▼
Agent Poll & Claim (Atomic Lock)
       │  Windows Print Agent fetches pending job, transitions status to PRINTING
       ▼
Local Windows Print Spooler (EPSON L8050)
       │  pypdfium2 renders vector PDF -> Win32 GDI Device Context -> Physical Print
       ▼
Job Completed
          Agent posts final confirmation and updates backend status to COMPLETED
```

---

## 2. Implemented Prototype Features

The following features were built and verified in the prototype:

### Customer Web Portal (`src/components/CustomerPortal.tsx`)
- Drag-and-drop / file selector for PDF and images (JPG, PNG).
- Per-file print configuration (Color vs Black & White, Single-sided vs Duplex, Paper Size A4/A3/Letter, Copies count, Page Ranges).
- Dynamic price estimation in INR (₹).
- Order tracking with progress state (Pending $\rightarrow$ Approved $\rightarrow$ Printing $\rightarrow$ Completed / Rejected).
- QR Code generation for in-shop customer check-in.

### Admin Dashboard (`src/components/AdminDashboard.tsx`)
- Secure token-based staff login (`/admin`).
- Real-time order queue with status filtering (All, Pending, Printing, Completed, Rejected).
- One-click order actions: **Approve & Print**, **Reject**, and **Manual Override**.
- Connected Print Agent status badge (Online / Offline, Heartbeat latency, active printer model).
- Order search, daily revenue totals, and audit activity stream.

### Backend API & Storage Engine (`server/`)
- Express server mounted with Vite middleware for dev and static build serving.
- Multipart file upload handling with Multer and MIME-type validation.
- Atomic job claim lock (`claimingLock` in `server/database/db.ts`) preventing race conditions between concurrent agents.
- 24-hour automatic retention cleanup service (`server/services/cleanupService.ts`).
- Local JSON prototype persistence (`data/db.json`).

### Python Print Agent (`print-agent/`)
- Headless polling daemon (`python agent.py --loop`).
- Periodic heartbeat signaling (status `IDLE`, `PRINTING`, `ERROR`, `OFFLINE`).
- Stream downloader with local spool storage and SHA-256 integrity checks.
- Direct Windows GDI print engine via `pypdfium2` and `win32print`/`win32ui`.

---

## 3. Physical Printing Implementation: Windows GDI vs ShellExecute

One of the most critical technical discoveries in this project was the limitations of standard Windows printing methods:

### Why `ShellExecute(0, "printto", ...)` Failed:
1. **Third-Party Dependency:** It depends on external software (like Adobe Acrobat Reader or Edge) being installed and registered as the default handler.
2. **GUI Popups:** It frequently launches blocking UI windows, dialogs, or hanging background processes.
3. **No Spool Verification:** It provides no feedback on whether the spooler accepted the raw bytes.

### The Working Solution (`print-agent/printer.py`):
1. **Direct Vector Rasterization (`pypdfium2`):** Renders each PDF page at high DPI directly into raw bitmap pixels.
2. **Device Context (`win32ui.CreateDC`):** Creates an explicit Windows GDI Device Context for the target printer (e.g. `EPSON L8050 Series`).
3. **Raw Spooling (`StretchDIBits`):** Maps raster bitmap chunks straight to printer device coordinates without launching any external GUI application.
4. **Reliable Spool Confirmation:** Properly opens `StartDoc`, iterates pages with `StartPage`/`EndPage`, and closes with `EndDoc`.

---

## 4. Key Lessons Learned

### 1. Cloud to Local Printer Connectivity
Public cloud servers (such as Cloud Run or VPS) cannot directly open socket or USB connections to printers located behind residential or commercial NAT/firewalls. An **outbound-polling agent** on the local Windows computer is the standard, reliable architecture. The agent opens outbound HTTP requests to the backend, polls for jobs, and pushes heartbeats.

### 2. Atomic Job Claiming
When multiple agent processes or polling loops exist, two workers could attempt to claim the same approved job simultaneously. The backend must enforce atomic check-and-set semantics:
```ts
if (order.status !== 'APPROVED') {
  return res.status(409).json({ error: 'Order already claimed or invalid state' });
}
order.status = 'PRINTING';
order.claimedByAgentId = agentId;
```

### 3. Separation of Development Prototypes from Production Deployments
Prototyping environments (such as cloud sandbox dev environments) often enforce interactive browser authentication, session cookie handshakes, or ephemeral container lifecycles. For hardware automation (such as physical printer agents), a clean local development server (`http://localhost:3000`) or dedicated authenticated API is significantly more predictable and reproducible than routing hardware agents through developer preview proxies.

### 4. Storage Trade-offs (JSON Prototype vs Relational DB)
While `data/db.json` is ideal for zero-configuration local experimentation and unit testing, a multi-store production system would require PostgreSQL with strict foreign keys and transactional guarantees (as outlined in `database/schema.sql`).
