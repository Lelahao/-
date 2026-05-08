import * as fs from "node:fs";
import * as path from "node:path";
import { getLogsDir } from "./paths";

function logFilePath(): string {
  const d = new Date();
  const day = d.toISOString().slice(0, 10);
  return path.join(getLogsDir(), `electron-${day}.log`);
}

export function logLine(scope: string, message: string): void {
  const line = `[${new Date().toISOString()}] [${scope}] ${message}\n`;
  try {
    fs.appendFileSync(logFilePath(), line, "utf8");
  } catch {
    // 日志失败不阻断主进程
  }
}
