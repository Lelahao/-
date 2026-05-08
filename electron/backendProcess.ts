import { type ChildProcess, spawn } from "node:child_process";
import * as http from "node:http";
import * as fs from "node:fs";
import { logLine } from "./logger";
import {
  getBackendExePath,
  getBackendPort,
  getPythonDataDir,
  getRepoRoot,
  isDev,
} from "./paths";

let child: ChildProcess | null = null;
let stopping = false;
let restarts = 0;
const MAX_RESTARTS = 3;
const HEALTH_PATH = "/api/health";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function getBackendOrigin(): string {
  return `http://127.0.0.1:${getBackendPort()}`;
}

async function waitForHealth(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await new Promise<boolean>((resolve) => {
      const req = http.get(
        {
          hostname: "127.0.0.1",
          port,
          path: HEALTH_PATH,
          timeout: 2000,
        },
        (res) => {
          resolve(res.statusCode === 200);
        },
      );
      req.on("error", () => resolve(false));
      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });
    });
    if (ok) return;
    await sleep(300);
  }
  throw new Error(`backend health check timeout (${HEALTH_PATH})`);
}

function buildEnv(): NodeJS.ProcessEnv {
  const dataDir = getPythonDataDir();
  return {
    ...process.env,
    PAIZUO_DATA_DIR: dataDir,
    PAIZUO_PORT: String(getBackendPort()),
    PAIZUO_BACKEND_PORT: String(getBackendPort()),
  };
}

function spawnDev(): ChildProcess {
  const root = getRepoRoot();
  const port = getBackendPort();
  const py = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
  const args = [
    "-m",
    "uvicorn",
    "server.main:app",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
  ];
  logLine("backend", `dev spawn: ${py} ${args.join(" ")} cwd=${root}`);
  const c = spawn(py, args, {
    cwd: root,
    env: buildEnv(),
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  c.stdout?.on("data", (b) => logLine("backend-out", String(b).trim()));
  c.stderr?.on("data", (b) => logLine("backend-err", String(b).trim()));
  return c;
}

function spawnProd(): ChildProcess {
  const exe = getBackendExePath();
  if (!exe || !fs.existsSync(exe)) {
    const msg = `production backend exe missing: ${exe || "(empty)"}`;
    logLine("backend", msg);
    throw new Error(msg);
  }
  logLine("backend", `prod spawn: ${exe}`);
  const c = spawn(exe, [], {
    env: buildEnv(),
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  c.stdout?.on("data", (b) => logLine("backend-out", String(b).trim()));
  c.stderr?.on("data", (b) => logLine("backend-err", String(b).trim()));
  return c;
}

function scheduleRelaunch(): void {
  if (stopping) return;
  if (restarts >= MAX_RESTARTS) {
    logLine("backend", "max restarts reached, giving up");
    return;
  }
  restarts += 1;
  logLine("backend", `restart ${restarts}/${MAX_RESTARTS} in 2s`);
  setTimeout(() => {
    if (stopping) return;
    void launchBackendInner()
      .then(() => waitForHealth(getBackendPort(), 30000))
      .then(() => logLine("backend", "healthy after restart"))
      .catch((e: Error) => logLine("backend", `restart health failed: ${e.message}`));
  }, 2000);
}

function bindExitOnce(c: ChildProcess): void {
  c.once("exit", (code, signal) => {
    logLine("backend", `exited code=${code} signal=${signal}`);
    child = null;
    scheduleRelaunch();
  });
}

async function launchBackendInner(): Promise<void> {
  if (child) return;
  const c = isDev() ? spawnDev() : spawnProd();
  child = c;
  bindExitOnce(c);
}

export async function startBackend(): Promise<void> {
  stopping = false;
  restarts = 0;
  const port = getBackendPort();
  await launchBackendInner();
  await waitForHealth(port, 45000);
  logLine("backend", "healthy");
}

export function stopBackend(): void {
  stopping = true;
  if (!child || child.pid == null) {
    child = null;
    return;
  }
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
    } else {
      child.kill("SIGTERM");
    }
  } catch (e) {
    logLine("backend", `stop error: ${(e as Error).message}`);
  }
  child = null;
}
