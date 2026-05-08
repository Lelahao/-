import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import pptxgen from "pptxgenjs";
import * as XLSX from "xlsx";
import type { LayoutSnapshot } from "@/fullscreen/types";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportBasename() {
  return `paizuo-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`;
}

export function exportLayoutJson(layout: LayoutSnapshot): void {
  const blob = new Blob([JSON.stringify(layout, null, 2)], { type: "application/json;charset=utf-8" });
  downloadBlob(blob, `${exportBasename()}.json`);
}

export function exportLayoutExcel(layout: LayoutSnapshot): void {
  const wb = XLSX.utils.book_new();

  const summaryData = [
    ["排座助手 · 方案导出", ""],
    ["导出时间", new Date().toLocaleString("zh-CN")],
    ["桌数", String(layout.tables.length)],
    ["人员条目", String(layout.people.length)],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), "总览");

  const tableSheet = [["桌号", "厅名", "容量"]];
  for (const t of layout.tables) {
    tableSheet.push([String(t.no), t.hallName, String(t.capacity)]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tableSheet), "桌次");

  for (const t of layout.tables) {
    const rows = [["座位号", "姓名", "人员ID"]];
    for (let sn = 1; sn <= t.capacity; sn++) {
      const p = layout.people.find((x) => x.assignedTableId === t.id && x.assignedSeatNo === sn);
      rows.push([String(sn), p?.name ?? "", p?.id ?? ""]);
    }
    const sh = `桌${t.no}`.slice(0, 31);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sh);
  }

  XLSX.writeFile(wb, `${exportBasename()}.xlsx`);
}

export async function exportLayoutWord(layout: LayoutSnapshot): Promise<void> {
  const children: Paragraph[] = [
    new Paragraph({
      text: "排座方案",
      heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph({
      children: [new TextRun({ text: `导出时间：${new Date().toLocaleString("zh-CN")}` })],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `共 ${layout.tables.length} 桌，${layout.people.length} 条人员记录。`,
        }),
      ],
    }),
  ];

  for (const t of layout.tables) {
    children.push(
      new Paragraph({
        text: `${t.no} 号桌 · ${t.hallName}（${t.capacity} 人）`,
        heading: HeadingLevel.HEADING_2,
      }),
    );
    for (let sn = 1; sn <= t.capacity; sn++) {
      const p = layout.people.find((x) => x.assignedTableId === t.id && x.assignedSeatNo === sn);
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${sn} 号座：`, bold: true }),
            new TextRun({ text: p ? p.name : "（空）" }),
          ],
        }),
      );
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, `${exportBasename()}.docx`);
}

/** PPT 中每张幻灯片为一张桌；姓名为独立文本框，可在 PowerPoint 中点选编辑。 */
export function exportLayoutPpt(layout: LayoutSnapshot): void {
  const pptx = new pptxgen();
  pptx.author = "排座助手";
  pptx.title = "圆桌排座";

  for (const t of layout.tables) {
    const slide = pptx.addSlide();
    slide.addText(`${t.no} 号桌 · ${t.hallName}`, {
      x: 0.4,
      y: 0.25,
      w: 9,
      h: 0.55,
      fontSize: 22,
      bold: true,
      color: "1e293b",
    });
    slide.addText(`${t.capacity} 人桌 · 可在编辑视图下单击姓名修改`, {
      x: 0.4,
      y: 0.85,
      w: 9,
      h: 0.35,
      fontSize: 12,
      color: "64748b",
    });

    const cols = Math.min(5, Math.ceil(Math.sqrt(t.capacity)) + 1);
    const cellW = 8.6 / cols;
    const rowH = 1.05;
    let idx = 0;
    for (let sn = 1; sn <= t.capacity; sn++) {
      const p = layout.people.find((x) => x.assignedTableId === t.id && x.assignedSeatNo === sn);
      const row = Math.floor(idx / cols);
      const col = idx % cols;
      const x = 0.45 + col * cellW;
      const y = 1.35 + row * rowH;
      slide.addText(`${sn} 号`, { x, y, w: cellW - 0.1, h: 0.28, fontSize: 11, color: "94a3b8" });
      slide.addText(p?.name ?? "空座", {
        x,
        y: y + 0.32,
        w: cellW - 0.1,
        h: 0.65,
        fontSize: 14,
        color: "0f172a",
        align: "center",
        valign: "middle",
      });
      idx += 1;
    }
  }

  void pptx.writeFile({ fileName: `${exportBasename()}.pptx` });
}

export function buildLayoutSvg(layout: LayoutSnapshot): string {
  const pad = 40;
  const tw = 320;
  const th = 340;
  const cols = Math.min(3, Math.max(1, layout.tables.length));
  const rows = Math.ceil(layout.tables.length / cols);
  const totalW = cols * tw + pad * 2;
  const totalH = rows * th + pad * 2;

  let body = "";
  layout.tables.forEach((t, ti) => {
    const cx = pad + (ti % cols) * tw;
    const cy = pad + Math.floor(ti / cols) * th;
    const ox = cx + tw / 2;
    const oy = cy + th / 2 - 10;
    const rRing = 110;
    body += `<text x="${cx + 12}" y="${cy + 22}" font-size="16" font-weight="600" fill="#0f172a">${t.no}号桌 · ${escapeXml(t.hallName)}</text>`;
    body += `<text x="${cx + 12}" y="${cy + 42}" font-size="12" fill="#64748b">${t.capacity}人桌</text>`;
    body += `<circle cx="${ox}" cy="${oy}" r="42" fill="#f8fafc" stroke="#e2e8f0" stroke-width="2"/>`;
    for (let i = 0; i < t.capacity; i++) {
      const seatNo = i + 1;
      const ang = (2 * Math.PI * i) / t.capacity - Math.PI / 2;
      const sx = ox + Math.cos(ang) * rRing;
      const sy = oy + Math.sin(ang) * rRing;
      const p = layout.people.find((x) => x.assignedTableId === t.id && x.assignedSeatNo === seatNo);
      const label = p?.name ?? "空";
      body += `<circle cx="${sx}" cy="${sy}" r="28" fill="#ffffff" stroke="#fdba74" stroke-width="1.5"/>`;
      body += `<text x="${sx}" y="${sy - 4}" text-anchor="middle" font-size="10" fill="#94a3b8">${seatNo}</text>`;
      body += `<text x="${sx}" y="${sy + 10}" text-anchor="middle" font-size="11" fill="#0f172a">${escapeXml(truncate(label, 5))}</text>`;
    }
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}">
  <rect width="100%" height="100%" fill="#f8fafc"/>
  ${body}
</svg>`;
}

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(s: string, max: number) {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

export function exportLayoutSvgFile(layout: LayoutSnapshot): void {
  const svg = buildLayoutSvg(layout);
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  downloadBlob(blob, `${exportBasename()}.svg`);
}

function svgToRaster(svg: string, type: "image/png" | "image/jpeg"): Promise<Blob> {
  const width = 1600;
  const height = 1200;
  return new Promise((resolve, reject) => {
    const img = new Image();
    const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("canvas"));
        return;
      }
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (b) => {
          URL.revokeObjectURL(url);
          if (b) resolve(b);
          else reject(new Error("toBlob"));
        },
        type,
        type === "image/jpeg" ? 0.92 : undefined,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("svg load"));
    };
    img.src = url;
  });
}

export async function exportLayoutPng(layout: LayoutSnapshot): Promise<void> {
  const svg = buildLayoutSvg(layout);
  const blob = await svgToRaster(svg, "image/png");
  downloadBlob(blob, `${exportBasename()}.png`);
}

export async function exportLayoutJpg(layout: LayoutSnapshot): Promise<void> {
  const svg = buildLayoutSvg(layout);
  const blob = await svgToRaster(svg, "image/jpeg");
  downloadBlob(blob, `${exportBasename()}.jpg`);
}
