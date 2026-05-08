import { app } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";

/** 与 Vite 脚本、前端默认一致，可用 PAIZUO_BACKEND_PORT 覆盖。 */
export function getBackendPort(): number {
  const n = Number(process.env.PAIZUO_BACKEND_PORT || process.env.PAIZUO_PORT || 8765);
  return Number.isFinite(n) && n > 0 ? n : 8765;
}

export function isDev(): boolean {
  return !app.isPackaged;
}

/** Electron userData 根目录。 */
export function getUserDataRoot(): string {
  return app.getPath("userData");
}

/** 传给 Python：与用户数据一致的子目录（统一数据落盘）。 */
export function getPythonDataDir(): string {
  const dir = path.join(getUserDataRoot(), "paizuo-data");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 主进程 / 后端相关日志目录。 */
export function getLogsDir(): string {
  const dir = path.join(getUserDataRoot(), "logs");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 打包后 backend exe 应位于 resources（extraResources）。 */
export function getBackendExePath(): string {
  if (!app.isPackaged) {
    return "";
  }
  return path.join(process.resourcesPath, "paizuo-backend.exe");
}

/**
 * 仓库根目录（开发态：从 dist-electron/main.js 向上一条）。
 */
export function getRepoRoot(): string {
  return path.resolve(__dirname, "..");
}
