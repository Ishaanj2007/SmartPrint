# Cloud Resource Shutdown & Cleanup Checklist

> **Manual Action Required in Google Cloud & External Consoles**

Since source code changes cannot automatically modify external cloud subscriptions, use this checklist to manually verify and shut down any active cloud resources or billing associated with this project.

---

## 📋 Google Cloud Platform (GCP) Console Checklist

Navigate to [Google Cloud Console](https://console.cloud.google.com/):

- [ ] **Cloud Run Services:**
  - Check **Cloud Run** $\rightarrow$ **Services**.
  - Delete any deployed SmartPrint services to stop instance execution.
- [ ] **Container / Artifact Registry:**
  - Check **Artifact Registry** / **Container Registry**.
  - Delete stored Docker container images to avoid storage fees.
- [ ] **Cloud Build:**
  - Check **Cloud Build** history; ensure no automated build triggers remain active.
- [ ] **Cloud Storage (GCS):**
  - Check **Cloud Storage** $\rightarrow$ **Buckets**.
  - Delete any temporary upload buckets created for document storage.
- [ ] **Cloud SQL / PostgreSQL (if provisioned):**
  - Check **SQL** instances.
  - Delete or stop database instances to avoid hourly compute charges.
- [ ] **Service Accounts & Keys:**
  - Check **IAM & Admin** $\rightarrow$ **Service Accounts**.
  - Delete or revoke JSON service account keys generated for the project.
- [ ] **API Keys & Credentials:**
  - Check **APIs & Services** $\rightarrow$ **Credentials**.
  - Delete or restrict any Gemini API keys, Maps keys, or OAuth Client IDs.
- [ ] **Billing Alerts / Project Deletion:**
  - If the entire project was created solely for SmartPrint experiments, navigate to **IAM & Admin** $\rightarrow$ **Settings** $\rightarrow$ **Shut Down Project**.

---

## 📋 External Services (if tested)

- [ ] **Supabase / Firebase:**
  - Verify project status in the Supabase or Firebase console; pause or delete inactive projects.
- [ ] **Local Python Environment:**
  - Terminate any running `agent.py` processes on counter Windows machines (`Ctrl + C` in command prompt).
