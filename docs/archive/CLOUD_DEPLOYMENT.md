# Cloud Deployment & Experimentation History

> **ARCHIVED — NO LONGER REQUIRED**

This document records the architectural history and observations from early experiments deploying SmartPrint to hosted cloud infrastructure (Google Cloud Run / Google AI Studio runtime).

---

## 1. Background

During early prototyping, the full-stack backend (Express + React SPA) was tested inside containerized environments:
- **Environment:** Containerized Node.js backend on Google Cloud Run.
- **Goal:** Allow remote walk-in customers to access a publicly accessible web URL to upload print jobs, while a local counter PC ran the Python Print Agent to poll and print jobs.

---

## 2. Observations & Architectural Takeaways

### A. Authentication & Interactive Browser Challenges
Development preview URLs in container environments often feature security layers (such as interactive cookie-check interstitials or Google account authentication). While browser requests handle these transparently, headless background daemons (like `agent.py`) receive HTML challenge pages unless explicit API bypasses or session tokens are configured.

### B. Ephemeral Container Filesystems
Cloud container services provide ephemeral local disks. Uploaded customer files stored in local folders (`/uploads`) are discarded whenever a container restarts or scales to zero. For a production deployment, external object storage (e.g. Google Cloud Storage or S3) would be required.

### C. Moving to a Self-Contained Local Prototype
Because retail print shops operate on local counter PCs with locally attached USB/Wi-Fi printers (e.g., EPSON L8050, Canon imagePROGRAF), hosting the prototype locally (`http://localhost:3000`) provides zero-latency file downloads, immediate spooler response, and eliminates all cloud subscription costs.

---

## 3. Current Project State

All live cloud endpoints have been disconnected from the source code. The repository is now 100% self-contained for local execution.
