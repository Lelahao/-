/**
 * 本地排座 HTTP API 客户端。
 * - 默认：`http://127.0.0.1:8765`（与 `npm run dev:backend` 一致）
 * - 覆盖：`.env` 中 `VITE_API_BASE_URL`（可为 `http://127.0.0.1:8000` 等）
 */

function normalizeBase(raw: string | undefined): string {
  const s = (raw?.trim() || "http://127.0.0.1:8765").replace(/\/+$/, "");
  return s;
}

export const API_BASE_URL = normalizeBase(import.meta.env.VITE_API_BASE_URL);

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

function joinUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${p}`;
}

function extractMessage(status: number, data: unknown): string {
  if (typeof data === "object" && data !== null && "message" in data) {
    const m = (data as { message: unknown }).message;
    if (typeof m === "string" && m.length) return m;
  }
  if (typeof data === "string" && data.length) return data;
  return `HTTP ${status}`;
}

export async function apiFetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const url = joinUrl(path);
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");
  if (init?.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let res: Response;
  try {
    res = await fetch(url, { ...init, headers });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network request failed";
    throw new ApiError(msg, 0);
  }

  const text = await res.text();
  let data: unknown = null;
  if (text.length) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    throw new ApiError(extractMessage(res.status, data), res.status, data);
  }

  return data as T;
}
