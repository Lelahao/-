import { createRoot, type Root } from "react-dom/client";
import { toPng } from "html-to-image";
import { ExportRoundOverviewView } from "./ExportRoundOverviewView";
import type { ExportScene } from "./exportScene";
import { sanitizePlanFileBase } from "./exportScene";

let host: HTMLDivElement | null = null;
let root: Root | null = null;

function ensureHost(): HTMLDivElement {
  if (!host) {
    host = document.createElement("div");
    host.setAttribute("data-paizuo-export-overview", "1");
    host.setAttribute("aria-hidden", "true");
    host.style.position = "fixed";
    host.style.left = "-12000px";
    host.style.top = "0";
    host.style.pointerEvents = "none";
    document.body.appendChild(host);
  }
  return host;
}

/**
 * 渲染与界面 export 模式一致的排座总览 PNG（不触发下载）。Excel / Word / PPT 与 PNG 下载应复用此结果。
 */
export async function renderOverviewPng(scene: ExportScene): Promise<{ dataUrl: string; blob: Blob }> {
  const el = ensureHost();
  if (!root) root = createRoot(el);

  root.render(<ExportRoundOverviewView scene={scene} />);

  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
  await new Promise((r) => setTimeout(r, 150));

  const target = el.firstElementChild as HTMLElement | null;
  if (!target) {
    root.render(null);
    throw new Error("renderOverviewPng: mount failed");
  }

  try {
    const dataUrl = await toPng(target, {
      pixelRatio: 2,
      backgroundColor: "#ffffff",
      cacheBust: true,
      filter: (node) => {
        if (node instanceof HTMLElement && node.dataset.paizuoExportIgnore === "1") return false;
        return true;
      },
    });
    const blob = await (await fetch(dataUrl)).blob();
    return { dataUrl, blob };
  } finally {
    root.render(null);
  }
}

/**
 * 将排座总览导出为 PNG（复用 renderOverviewPng，几何与界面一致）。
 * @param fileBase 不含扩展名，默认 `sanitize(planName)_排座总览`
 */
export async function exportOverviewImage(scene: ExportScene, fileBase?: string): Promise<void> {
  const { dataUrl } = await renderOverviewPng(scene);
  const base = fileBase ?? `${sanitizePlanFileBase(scene.planName)}_排座总览`;

  const a = document.createElement("a");
  a.download = `${base}.png`;
  a.href = dataUrl;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
