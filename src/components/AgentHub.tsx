import React, { useState, useEffect, useRef } from 'react';
import {
  Terminal,
  Play,
  Square,
  Copy,
  Check,
  Download,
  FileCode,
  HardDrive,
  Cpu,
  Layers,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  FolderOpen,
} from 'lucide-react';

interface AgentHubProps {
  onOrderUpdated?: () => void;
}

export function AgentHub({ onOrderUpdated }: AgentHubProps) {
  // Active code viewer tab
  const [selectedFile, setSelectedFile] = useState<string>('agent.py');
  const [copiedCode, setCopiedCode] = useState(false);

  // In-Browser Agent Simulator state
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulatedLogs, setSimulatedLogs] = useState<Array<{ timestamp: string; text: string; type?: string }>>([
    {
      timestamp: new Date().toLocaleTimeString(),
      text: '[INFO] Local Print Agent Hub initialized. Ready to simulate or run on Windows.',
    },
  ]);

  const simulationRef = useRef<boolean>(false);
  simulationRef.current = isSimulating;

  const addLog = (text: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setSimulatedLogs((prev) => [...prev.slice(-100), { timestamp, text, type }]);
  };

  // Simulation execution loop
  useEffect(() => {
    if (!isSimulating) return;

    let isRunning = true;
    addLog('[AGENT] Background worker thread started. Connecting to backend...');
    addLog('[AGENT] Authenticated as SHOP_001 (Counter Windows PC)');

    const loop = async () => {
      while (isRunning && simulationRef.current) {
        try {
          // 1. Send heartbeat
          await fetch('/api/agent/heartbeat', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Agent-ID': 'SHOP_001',
              'X-Agent-Token': 'agent_secret_token_123',
            },
            body: JSON.stringify({
              status: 'IDLE',
              printer_name: 'EPSON L3150 Series (Simulated)',
              print_mode: 'mock',
              system_info: { os: 'Windows 11 (Simulated)', python: '3.10.12' },
            }),
          });

          // 2. Poll approved jobs
          const res = await fetch('/api/agent/jobs', {
            headers: {
              'X-Agent-ID': 'SHOP_001',
              'X-Agent-Token': 'agent_secret_token_123',
            },
          });
          const data = await res.json();
          const jobs = data.jobs || [];

          if (jobs.length > 0) {
            for (const job of jobs) {
              if (!simulationRef.current) break;

              addLog(`[AGENT] 🔍 Found Approved Job #${job.publicOrderId}. Attempting atomic claim...`);

              // 3. Atomic Claim
              const claimRes = await fetch(`/api/agent/jobs/${job.id}/claim`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-Agent-ID': 'SHOP_001',
                  'X-Agent-Token': 'agent_secret_token_123',
                },
                body: JSON.stringify({ agent_id: 'SHOP_001' }),
              });

              if (!claimRes.ok) {
                addLog(`[AGENT] ⚠️ Job #${job.publicOrderId} claim rejected (already claimed). Skipping.`, 'warn');
                continue;
              }

              addLog(`[AGENT] ✅ Job #${job.publicOrderId} atomically claimed. Status: CLAIMED`, 'success');

              // 4. Mark Printing
              await fetch(`/api/agent/jobs/${job.id}/printing`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-Agent-ID': 'SHOP_001',
                  'X-Agent-Token': 'agent_secret_token_123',
                },
              });
              addLog(`[AGENT] 🖨️ Job #${job.publicOrderId} marked as PRINTING in queue.`, 'info');

              // Simulate downloading and spooling each file
              for (const file of job.files || []) {
                addLog(`[AGENT] 📥 Downloading '${file.originalFilename}' (${(file.fileSizeBytes / 1024).toFixed(0)} KB)...`);
                await new Promise((r) => setTimeout(r, 800));

                addLog(`[AGENT] 📄 Handing '${file.originalFilename}' to Windows Spooler -> EPSON L3150...`);
                await new Promise((r) => setTimeout(r, 1200));

                addLog(`[AGENT] ⚡ Driver processed ${file.printSettings.copies} copy/copies (${file.printSettings.paperSize}, ${file.printSettings.colorMode}).`);
              }

              // 5. Mark Completed
              await fetch(`/api/agent/jobs/${job.id}/completed`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-Agent-ID': 'SHOP_001',
                  'X-Agent-Token': 'agent_secret_token_123',
                },
                body: JSON.stringify({
                  details: { simulated: true, completedAt: new Date().toISOString() },
                }),
              });

              addLog(`[AGENT] 🏁 Order #${job.publicOrderId} printed successfully! Status: COMPLETED`, 'success');
              if (onOrderUpdated) onOrderUpdated();
            }
          }
        } catch (e: any) {
          addLog(`[AGENT] Polling error: ${e.message}`, 'error');
        }

        // Wait interval
        await new Promise((r) => setTimeout(r, 3000));
      }
    };

    loop();

    return () => {
      isRunning = false;
      addLog('[AGENT] Background worker stopped.', 'warn');
    };
  }, [isSimulating]);

  // Code snippets for each file
  const codeFiles: Record<string, { desc: string; code: string }> = {
    'agent.py': {
      desc: 'CLI entry point supporting Milestone 1 (--test) and background daemon polling (--loop).',
      code: `#!/usr/bin/env python3
# Milestone 1: Run standalone test on local PDF:
#   python agent.py --test "test.pdf"
#   python agent.py --test "test.pdf" --mock
#   python agent.py --list-printers
#
# Milestone 2+: Run continuous background daemon:
#   python agent.py --loop

import argparse
from config import AgentConfig
from printer import WindowsPrinterEngine
from api_client import AgentAPIClient
from downloader import FileDownloader

# See /print-agent/agent.py for complete source code.`,
    },
    'printer.py': {
      desc: 'Windows pywin32 print engine integrating win32print, win32api.ShellExecute, and mock mode.',
      code: `import sys
import win32print
import win32api
from pathlib import Path

class WindowsPrinterEngine:
    def list_printers(self):
        flags = win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
        return [p[2] for p in win32print.EnumPrinters(flags)]

    def print_file(self, file_path, printer_name="DEFAULT", settings=None):
        # Sends file to Windows Print Spooler via registered application
        params = f'"{printer_name}"'
        win32api.ShellExecute(0, "printto", str(file_path), params, str(file_path.parent), 0)
        return {"success": True, "message": "Queued in Windows Print Spooler"}`,
    },
    'config.json': {
      desc: 'Configuration file for the shop Windows PC.',
      code: `{
  "server_url": "http://localhost:3000",
  "agent_id": "SHOP_001",
  "agent_token": "agent_secret_token_123",
  "printer_name": "DEFAULT",
  "poll_interval": 3,
  "heartbeat_interval": 10,
  "print_mode": "mock",
  "temp_dir": "./spool"
}`,
    },
    'requirements.txt': {
      desc: 'Python dependencies for Windows.',
      code: `requests>=2.31.0
pywin32>=306; sys_platform == 'win32'`,
    },
  };

  const handleCopyCode = () => {
    const text = codeFiles[selectedFile]?.code || '';
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Hero / Overview */}
      <div className="bg-white rounded-3xl border border-zinc-200 p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-zinc-100 text-zinc-800 rounded-full text-xs font-bold uppercase tracking-wider">
              <Cpu className="w-3.5 h-3.5 text-zinc-900" /> Windows Print Bridge Architecture
            </div>
            <h2 className="text-2xl font-black text-zinc-900 tracking-tight">
              Python Print Agent (Local Windows Service)
            </h2>
            <p className="text-sm text-zinc-600 leading-relaxed">
              In a commercial Xerox print shop, physical printers and Windows PCs must{' '}
              <strong className="text-zinc-900">never be exposed directly to the public internet</strong>. Instead,
              a small, secure Python agent runs locally on the shop's PC, connects out to the cloud backend, claims
              approved jobs, and forwards them to the native Windows Print Spooler.
            </p>
          </div>

          {/* Quick Simulator Switch Card */}
          <div className="bg-zinc-50 border border-zinc-200/80 rounded-2xl p-5 shrink-0 w-full md:w-80 shadow-xs">
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1">
              Browser Agent Simulator
            </h4>
            <p className="text-xs text-zinc-600 mb-4">
              Test the end-to-end customer ➔ admin ➔ agent printing flow directly in your browser.
            </p>

            <button
              onClick={() => setIsSimulating(!isSimulating)}
              className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-xs ${
                isSimulating
                  ? 'bg-rose-600 hover:bg-rose-700 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
            >
              {isSimulating ? (
                <>
                  <Square className="w-3.5 h-3.5 fill-current" /> Stop Simulated Agent
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" /> Start Simulated Agent Worker
                </>
              )}
            </button>

            <div className="mt-3 flex items-center gap-2 text-[11px] text-zinc-500">
              <span
                className={`w-2 h-2 rounded-full ${
                  isSimulating ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-300'
                }`}
              />
              <span>Status: {isSimulating ? 'Worker polling every 3s' : 'Worker idle'}</span>
            </div>
          </div>
        </div>

        {/* Visual Architecture Flow Diagram */}
        <div className="mt-8 pt-6 border-t border-zinc-100">
          <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-4">
            Security & Execution Chain
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-center text-xs">
            <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200">
              <span className="text-[10px] text-zinc-400 font-mono block mb-1">1. Customer</span>
              <p className="font-bold text-zinc-800">Phone / QR</p>
              <p className="text-[10px] text-zinc-500 mt-1">Uploads PDF</p>
            </div>
            <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200">
              <span className="text-[10px] text-zinc-400 font-mono block mb-1">2. Backend</span>
              <p className="font-bold text-zinc-800">REST API</p>
              <p className="text-[10px] text-zinc-500 mt-1">Status: PENDING</p>
            </div>
            <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200">
              <span className="text-[10px] text-zinc-400 font-mono block mb-1">3. Admin</span>
              <p className="font-bold text-zinc-800">Dashboard</p>
              <p className="text-[10px] text-zinc-500 mt-1">Staff Approves</p>
            </div>
            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
              <span className="text-[10px] text-emerald-600 font-mono block mb-1">4. Cloud Queue</span>
              <p className="font-bold text-emerald-900">APPROVED</p>
              <p className="text-[10px] text-emerald-700 mt-1">Ready for claim</p>
            </div>
            <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-200">
              <span className="text-[10px] text-indigo-600 font-mono block mb-1">5. Shop PC</span>
              <p className="font-bold text-indigo-900">Python Agent</p>
              <p className="text-[10px] text-indigo-700 mt-1">Atomic claim</p>
            </div>
            <div className="p-3 bg-blue-50 rounded-xl border border-blue-200">
              <span className="text-[10px] text-blue-600 font-mono block mb-1">6. Windows OS</span>
              <p className="font-bold text-blue-900">Print Spooler</p>
              <p className="text-[10px] text-blue-700 mt-1">pywin32 driver</p>
            </div>
            <div className="p-3 bg-zinc-900 text-white rounded-xl shadow-xs">
              <span className="text-[10px] text-zinc-400 font-mono block mb-1">7. Output</span>
              <p className="font-bold text-white">Physical Print</p>
              <p className="text-[10px] text-zinc-300 mt-1">Xerox complete</p>
            </div>
          </div>
        </div>
      </div>

      {/* Simulator Terminal Console */}
      <div className="bg-zinc-950 rounded-3xl border border-zinc-800 p-5 shadow-xl font-mono text-xs text-zinc-300 space-y-3">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <span className="font-bold text-white">Print Agent Live Event Stream</span>
          </div>
          <button
            onClick={() => setSimulatedLogs([])}
            className="text-[11px] text-zinc-500 hover:text-zinc-300 transition cursor-pointer"
          >
            Clear logs
          </button>
        </div>

        <div className="h-48 overflow-y-auto space-y-1 pr-2">
          {simulatedLogs.map((log, i) => (
            <div
              key={i}
              className={`leading-relaxed ${
                log.type === 'success'
                  ? 'text-emerald-400 font-semibold'
                  : log.type === 'warn'
                  ? 'text-amber-400'
                  : log.type === 'error'
                  ? 'text-rose-400 font-bold'
                  : 'text-zinc-300'
              }`}
            >
              <span className="text-zinc-600 mr-2">[{log.timestamp}]</span>
              {log.text}
            </div>
          ))}
        </div>
      </div>

      {/* Milestone 1 Instructions & Code Viewer */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Milestone 1 Setup Guide */}
        <div className="lg:col-span-1 bg-white rounded-3xl border border-zinc-200 p-6 space-y-5 shadow-xs">
          <div className="flex items-center gap-2 text-zinc-900">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <h3 className="font-bold text-base">Milestone 1 Guide</h3>
          </div>

          <p className="text-xs text-zinc-600 leading-relaxed">
            Verify the direct link from <strong className="text-zinc-800">Python ➔ Windows ➔ Printer</strong> before
            connecting to any cloud network:
          </p>

          <div className="space-y-3 text-xs">
            <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 space-y-1">
              <span className="font-bold text-zinc-800 block">Step 1: Install Requirements</span>
              <code className="text-zinc-600 font-mono text-[11px] block bg-white p-1.5 rounded border border-zinc-200">
                pip install -r requirements.txt
              </code>
            </div>

            <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 space-y-1">
              <span className="font-bold text-zinc-800 block">Step 2: Enumerate Printers</span>
              <code className="text-zinc-600 font-mono text-[11px] block bg-white p-1.5 rounded border border-zinc-200">
                python agent.py --list-printers
              </code>
            </div>

            <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 space-y-1">
              <span className="font-bold text-zinc-800 block">Step 3: Standalone Test Print</span>
              <code className="text-zinc-600 font-mono text-[11px] block bg-white p-1.5 rounded border border-zinc-200">
                python agent.py --test "test_sample.pdf" --mock
              </code>
              <p className="text-[10px] text-zinc-400 mt-1">Omit --mock when ready to print on real paper.</p>
            </div>

            <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 space-y-1">
              <span className="font-bold text-zinc-800 block">Step 4: Launch Daemon Loop</span>
              <code className="text-zinc-600 font-mono text-[11px] block bg-white p-1.5 rounded border border-zinc-200">
                python agent.py --loop
              </code>
            </div>
          </div>
        </div>

        {/* Python Source Code Viewer */}
        <div className="lg:col-span-2 bg-white rounded-3xl border border-zinc-200 p-6 space-y-4 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <div className="flex items-center gap-2">
                <FileCode className="w-5 h-5 text-zinc-700" />
                <h3 className="font-bold text-base text-zinc-900">Print Agent Files</h3>
              </div>
              <button
                onClick={handleCopyCode}
                className="py-1 px-2.5 rounded-lg border border-zinc-200 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 flex items-center gap-1.5 cursor-pointer"
              >
                {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedCode ? 'Copied' : 'Copy Code'}
              </button>
            </div>

            {/* File Switcher Tabs */}
            <div className="flex gap-2 my-3 overflow-x-auto pb-1">
              {Object.keys(codeFiles).map((fname) => (
                <button
                  key={fname}
                  onClick={() => setSelectedFile(fname)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-mono font-semibold transition cursor-pointer ${
                    selectedFile === fname
                      ? 'bg-zinc-900 text-white shadow-xs'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  }`}
                >
                  {fname}
                </button>
              ))}
            </div>

            <p className="text-xs text-zinc-500 mb-3">{codeFiles[selectedFile]?.desc}</p>

            <pre className="p-4 bg-zinc-900 text-zinc-100 rounded-2xl text-xs font-mono overflow-x-auto max-h-72">
              <code>{codeFiles[selectedFile]?.code}</code>
            </pre>
          </div>

          <div className="pt-3 border-t border-zinc-100 flex items-center justify-between text-xs text-zinc-500">
            <span>Files located in <code>/print-agent/</code> on disk</span>
            <span className="font-semibold text-zinc-700">Ready for Windows copy</span>
          </div>
        </div>
      </div>
    </div>
  );
}
