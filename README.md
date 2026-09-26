# SmartPrint

> **STATUS: PROTOTYPE / ARCHIVED**

A prototype print-shop automation system connecting a web print-request interface, admin approval workflow, backend API, local Windows Print Agent, and physical printer.

The public cloud deployment has been shut down and this project is preserved as a clean, self-contained local prototype for learning, experimentation, portfolio reference, and future rebuilding.

---

## 🏗 System Architecture

```text
Customer (Mobile / Desktop)
        │  1. Upload PDF / Image & Configure Print Settings
        ▼
SmartPrint Web Backend (Express + Vite)
        │  2. Order Created (Pending Staff Review)
        ▼
Admin Dashboard (/admin)
        │  3. Staff clicks "Approve & Print"
        ▼
Local Prototype Store (data/db.json)
        │  4. Order status changed to APPROVED
        ▼
Python Print Agent (Running on Counter Windows PC)
        │  5. Polls http://localhost:3000, Claims Job
        ▼
Windows GDI / pypdfium2 Spooler Engine
        │  6. Direct rasterization to Windows Print Spooler
        ▼
Physical Printer (e.g. EPSON L8050 Series)
```

---

## 🚀 Local Development Setup

### 1. Backend & Web Interface

**Prerequisites:** Node.js (v18+ or v20+)

```bash
# Clone the repository
git clone <YOUR_REPO_URL>
cd smartprint

# Install dependencies
npm install

# (Optional) Copy environment template for custom settings
cp .env.example .env

# Run full-stack development server
npm run dev
```

The application will be accessible at:
- **Customer Portal:** `http://localhost:3000`
- **Admin Dashboard:** `http://localhost:3000` (click "Staff" top-right, or visit `http://localhost:3000/?admin=true`)

---

### 2. Windows Python Print Agent Setup

**Prerequisites:** Windows 10/11 PC with Python 3.10+ and connected printer (e.g., EPSON L8050 or any installed Windows printer).

```powershell
# Navigate to the print agent directory
cd print-agent

# Install Python requirements
pip install -r requirements.txt

# (Optional) Customize settings
# Copy config.example.json to config.json or configure environment variables
cp config.example.json config.json

# Run continuous background print agent
python agent.py --loop
```

#### Standalone Print Agent Diagnostic Commands:
```powershell
# List all printers detected on the Windows machine
python agent.py --list-printers

# Run standalone test print without backend (Mock mode - no paper used)
python agent.py --test "test.pdf" --mock

# Run standalone test print to physical printer
python agent.py --test "test.pdf" --printer "EPSON L8050 Series"
```

---

## ⚙️ Configuration

### Backend (`.env`)
```env
PORT=3000
APP_URL=http://localhost:3000
ADMIN_USERNAME=admin
ADMIN_PASSWORD=YOUR_ADMIN_PASSWORD
ADMIN_TOKEN=YOUR_ADMIN_SESSION_TOKEN
AGENT_ID=SHOP_001
AGENT_TOKEN=YOUR_AGENT_SECRET_TOKEN
```

### Print Agent (`print-agent/config.json`)
```json
{
  "server_url": "http://localhost:3000",
  "agent_id": "SHOP_001",
  "agent_token": "YOUR_AGENT_SECRET_TOKEN",
  "printer_name": "EPSON L8050 Series",
  "poll_interval": 3,
  "heartbeat_interval": 10,
  "print_mode": "windows",
  "temp_dir": "./spool"
}
```

---

## 📂 Project Structure

```text
├── data/                  # Local prototype JSON storage (data/db.json)
├── database/              # Relational SQL schema reference (PostgreSQL)
├── docs/                  # Prototype architecture documentation & archive
│   ├── PROTOTYPE.md       # Implemented features, architecture & lessons learned
│   └── archive/           # Cloud deployment history & shutdown checklist
├── print-agent/           # Windows Python Print Agent
│   ├── agent.py           # Polling daemon & job execution lifecycle
│   ├── api_client.py      # REST client for backend communication
│   ├── config.py          # Configuration loader (JSON / Env)
│   ├── downloader.py      # Stream downloader with SHA-256 validation
│   ├── printer.py         # Windows GDI / pypdfium2 physical printing engine
│   └── requirements.txt   # Python dependencies (requests, pypdfium2, pywin32, pillow)
├── server/                # Express backend modules
│   ├── auth/              # Admin & Agent token verification middleware
│   ├── controllers/       # Order, Admin, and Agent route controllers
│   ├── database/          # In-memory / JSON database engine
│   ├── routes/            # REST API endpoints
│   ├── services/          # Business logic, atomic locks, retention cleanup
│   └── storage/           # Local file upload handler (Multer)
├── src/                   # React frontend (Vite + Tailwind CSS)
│   ├── components/        # CustomerPortal, AdminDashboard, AgentHub, ShopQrModal
│   ├── App.tsx            # Main application layout & mode switching
│   └── types.ts           # Shared TypeScript domain models
├── server.ts              # Full-stack Node.js server entry point
├── package.json           # Node dependencies and scripts
└── README.md              # Project overview and local setup guide
```

---

## 🔒 Security & Local Prototype Disclaimer

- `data/db.json` is a **local development store** and is not intended for production multi-tenant persistence.
- Do not commit real passwords or private tokens to public source control.
- All secrets have been replaced with placeholders (`YOUR_AGENT_SECRET_TOKEN`, `YOUR_ADMIN_PASSWORD`).

For more details on what was built and development lessons, see [`docs/PROTOTYPE.md`](docs/PROTOTYPE.md).
