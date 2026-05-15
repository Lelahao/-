import ExcelJS from "exceljs";
import {
  AlignmentType,
  Document,
  FileChild,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import pptxgen from "pptxgenjs";
import { addRoundTableToSlide } from "@/lib/pptShapes";
import type { LayoutSnapshot } from "@/fullscreen/types";
import type { ExportScene } from "@/features/export/exportScene";
import {
  buildExportSceneFromLayout,
  buildVersionExportScene,
  getExportPlanDisplayName,
  sanitizePlanFileBase,
  versionOverviewExportFileBase,
} from "@/features/export/exportScene";
import { exportOverviewImage, renderOverviewPng } from "@/features/export/exportOverviewImage";

export type PlanVersionExportFormat = "png" | "xlsx" | "docx" | "pptx";

/**
 * 历史版本导出：数据仅来自该版本的 layout 快照（须由调用方经 getPlanVersion + snapshotToLayoutSnapshot 得到 layout）。
 */
export async function exportPlanVersionSnapshot(
  layout: LayoutSnapshot,
  meta: { planDisplayName: string; versionNo: number; versionName: string | null; savedAtMs: number },
  format: PlanVersionExportFormat,
): Promise<void> {
  const scene = buildVersionExportScene(layout, meta);
  const base = versionOverviewExportFileBase(meta.planDisplayName, meta.versionNo);
  switch (format) {
    case "png":
      await exportOverviewImage(scene, base);
      return;
    case "xlsx":
      await exportSceneExcel(scene, base);
      return;
    case "docx":
      await exportSceneWord(scene, base);
      return;
    case "pptx":
      await exportScenePpt(scene, base);
      return;
    default: {
      const _exhaustive: never = format;
      window.alert("该格式导出功能待接入");
      void _exhaustive;
    }
  }
}

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

function exportFileBaseName(scene: { planName: string }) {
  return `${sanitizePlanFileBase(scene.planName)}_排座总览`;
}

export async function exportSceneExcel(scene: ExportScene, fileBase?: string): Promise<void> {
  const { dataUrl } = await renderOverviewPng(scene);
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
  const outBase = fileBase ?? exportFileBaseName(scene);

  const wb = new ExcelJS.Workbook();
  wb.creator = "排座助手";

  const s1 = wb.addWorksheet("排座总览");
  s1.addRow([scene.planName]);
  s1.getRow(1).font = { size: 16, bold: true };
  if (scene.versionExport) {
    s1.addRow([scene.versionExport.versionLine]);
    s1.addRow([scene.versionExport.savedAtLine]);
  } else {
    s1.addRow([`导出时间：${new Date().toLocaleString("zh-CN", { hour12: false })}`]);
  }
  s1.addRow([
    `总桌数：${scene.stats.tableCount}，人员条目：${scene.stats.peopleCount}，已安排：${scene.stats.assignedCount}，未安排：${scene.stats.unassignedCount}`,
  ]);
  s1.addRow([]);

  const imgId = wb.addImage({ base64, extension: "png" });
  s1.addImage(imgId, {
    tl: { col: 0, row: s1.rowCount },
    ext: { width: 900, height: 1200 },
  });
  s1.getColumn(1).width = 120;

  const s2 = wb.addWorksheet("桌次明细");
  s2.addRow(["桌号", "桌别", "桌型", "容量", "已安排人数", "空位数"]);
  for (const t of scene.tables) {
    const occ = t.seats.filter((s) => !s.isEmpty).length;
    s2.addRow([
      t.tableNo,
      t.tableRole ?? t.hallName ?? "",
      t.tableKind ?? "",
      t.capacity,
      occ,
      t.capacity - occ,
    ]);
  }

  const s3 = wb.addWorksheet("人员座位明细");
  s3.addRow(["桌号", "座位号", "姓名", "备注"]);
  for (const row of scene.seats) {
    s3.addRow([row.tableNo, row.seatNo, row.personName ?? "", ""]);
  }

  const s4 = wb.addWorksheet("未安排人员");
  if (scene.unassignedPeople.length === 0) {
    s4.addRow(["（无未安排人员）"]);
  } else {
    s4.addRow(["姓名"]);
    for (const p of scene.unassignedPeople) {
      s4.addRow([p.name]);
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${outBase}.xlsx`,
  );
}

export function exportLayoutJson(layout: LayoutSnapshot): void {
  const blob = new Blob([JSON.stringify(layout, null, 2)], { type: "application/json;charset=utf-8" });
  downloadBlob(blob, `${exportBasename()}.json`);
}

/**
 * 工作表：排座总览（含 exceljs 嵌入的总览 PNG）、桌次明细、人员座位明细、未安排人员。
 * 总览图与 `renderOverviewPng` / PNG 下载一致。
 */
export async function exportLayoutExcel(layout: LayoutSnapshot): Promise<void> {
  const scene = buildExportSceneFromLayout(layout, getExportPlanDisplayName());
  await exportSceneExcel(scene);
}

export async function exportSceneWord(scene: ExportScene, fileBase?: string): Promise<void> {
  const { blob } = await renderOverviewPng(scene);
  const imageBuffer = new Uint8Array(await blob.arrayBuffer());
  const outBase = fileBase ?? exportFileBaseName(scene);

  const children: FileChild[] = [
    new Paragraph({
      text: scene.planName,
      heading: HeadingLevel.TITLE,
    }),
  ];
  if (scene.versionExport) {
    children.push(new Paragraph(scene.versionExport.versionLine));
    children.push(new Paragraph(scene.versionExport.savedAtLine));
  }
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `总桌数：${scene.stats.tableCount}，人员条目：${scene.stats.peopleCount}，已安排：${scene.stats.assignedCount}，未安排：${scene.stats.unassignedCount}。`,
        }),
      ],
    }),
  );
  if (!scene.versionExport) {
    children.push(
      new Paragraph(`导出时间：${new Date().toLocaleString("zh-CN", { hour12: false })}`),
    );
  }
  children.push(
    new Paragraph({
      text: "一、排座总览",
      heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new ImageRun({
          type: "png",
          data: imageBuffer,
          transformation: { width: 560, height: 760 },
        }),
      ],
    }),
    new Paragraph({
      text: "二、桌次明细",
      heading: HeadingLevel.HEADING_1,
    }),
  );

  for (const t of scene.tables) {
    children.push(
      new Paragraph({
        text: `${t.tableNo} 号桌 · ${t.hallName}（${t.tableKind ?? ""}，${t.capacity} 人）`,
        heading: HeadingLevel.HEADING_2,
      }),
    );
    const header = new TableRow({
      tableHeader: true,
      children: [
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "座位号", bold: true })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "姓名", bold: true })] })] }),
      ],
    });
    const body = t.seats.map(
      (s) =>
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph(String(s.seatNo))] }),
            new TableCell({ children: [new Paragraph(s.personName ?? "")] }),
          ],
        }),
    );
    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [header, ...body] }));
  }

  children.push(new Paragraph({ text: "三、未安排人员", heading: HeadingLevel.HEADING_1 }));
  if (scene.unassignedPeople.length === 0) {
    children.push(new Paragraph("无"));
  } else {
    for (const p of scene.unassignedPeople) {
      children.push(new Paragraph(`· ${p.name}`));
    }
  }

  const doc = new Document({
    sections: [{ properties: {}, children }],
  });

  const outBlob = await Packer.toBlob(doc);
  downloadBlob(outBlob, `${outBase}.docx`);
}

export async function exportLayoutWord(layout: LayoutSnapshot): Promise<void> {
  const scene = buildExportSceneFromLayout(layout, getExportPlanDisplayName());
  await exportSceneWord(scene);
}

/** LAYOUT_WIDE：12192000×6858000 EMU @ 914400 EMU/英寸 */
const PPTX_WIDE_W_IN = 12192000 / 914400;
const PPTX_WIDE_H_IN = 6858000 / 914400;
const PPTX_TEXT_W = PPTX_WIDE_W_IN - 0.7;

export async function exportScenePpt(scene: ExportScene, fileBase?: string): Promise<void> {
  const outBase = fileBase ?? exportFileBaseName(scene);

  const pptx = new pptxgen();
  pptx.author = "排座助手";
  pptx.title = scene.planName;
  /** 13.33" × 7.5"，给原生圆桌网格更多展示空间 */
  pptx.layout = "LAYOUT_WIDE";

  /** 排座总览：分页，每页最多 N 张迷你圆桌；用 PPT 原生 ellipse + textbox，用户可在 PowerPoint 直接编辑 */
  const OVERVIEW_TABLES_PER_SLIDE = 12;
  const overviewPages = Math.max(1, Math.ceil(scene.tables.length / OVERVIEW_TABLES_PER_SLIDE));
  for (let pageIdx = 0; pageIdx < overviewPages; pageIdx++) {
    const pageTables = scene.tables.slice(
      pageIdx * OVERVIEW_TABLES_PER_SLIDE,
      (pageIdx + 1) * OVERVIEW_TABLES_PER_SLIDE,
    );
    const slide = pptx.addSlide();
    const pageSuffix = overviewPages > 1 ? `（${pageIdx + 1}/${overviewPages}）` : "";
    slide.addText(`${scene.planName}${pageSuffix}`, {
      x: 0.35,
      y: 0.2,
      w: PPTX_TEXT_W,
      h: 0.55,
      fontSize: 22,
      bold: true,
      color: "0f172a",
    });
    let yNext = 0.52;
    if (scene.versionExport && pageIdx === 0) {
      slide.addText(scene.versionExport.versionLine, {
        x: 0.35,
        y: yNext,
        w: PPTX_TEXT_W,
        h: 0.3,
        fontSize: 13,
        color: "334155",
      });
      yNext += 0.34;
      slide.addText(scene.versionExport.savedAtLine, {
        x: 0.35,
        y: yNext,
        w: PPTX_TEXT_W,
        h: 0.26,
        fontSize: 10,
        color: "94a3b8",
      });
      yNext += 0.3;
    }
    slide.addText(
      `总桌数：${scene.stats.tableCount} ｜ 人员条目：${scene.stats.peopleCount} ｜ 已安排：${scene.stats.assignedCount} ｜ 未安排：${scene.stats.unassignedCount}`,
      { x: 0.35, y: yNext, w: PPTX_TEXT_W, h: 0.35, fontSize: 12, color: "475569" },
    );
    yNext += 0.4;
    if (!scene.versionExport && pageIdx === 0) {
      slide.addText(`导出时间：${new Date().toLocaleString("zh-CN", { hour12: false })}`, {
        x: 0.35,
        y: yNext,
        w: PPTX_TEXT_W,
        h: 0.3,
        fontSize: 10,
        color: "94a3b8",
      });
      yNext += 0.34;
    }

    // 网格区域：从 yNext+0.1 到 7.2（留底边距）
    const gridX = 0.4;
    const gridW = PPTX_WIDE_W_IN - 0.8;
    const gridY = Math.max(1.35, yNext + 0.1);
    const gridH = Math.max(2.5, 7.2 - gridY);

    const n = pageTables.length;
    const cols = n <= 2 ? n : n <= 4 ? 2 : n <= 9 ? 3 : 4;
    const rows = Math.max(1, Math.ceil(n / cols));
    const cellW = gridW / cols;
    const cellH = gridH / rows;
    /** 外圈姓名要占额外环宽，桌圈半径取格子短边的 30% */
    const radiusIn = Math.max(0.35, Math.min(cellW, cellH) * 0.3);
    const seatRadiusIn = radiusIn * 0.82;
    const nameRadiusIn = radiusIn + Math.min(0.35, radiusIn * 0.45);
    const titleFontSize = Math.min(14, Math.max(8, Math.round(radiusIn * 13)));
    const subtitleFontSize = Math.min(10, Math.max(6, Math.round(radiusIn * 9)));
    const seatNumberFontSize = Math.min(10, Math.max(7, Math.round(radiusIn * 10)));
    const seatNameFontSize = Math.min(11, Math.max(7, Math.round(radiusIn * 11)));

    pageTables.forEach((t, idx) => {
      const row = Math.floor(idx / cols);
      const col = idx % cols;
      const cx = gridX + (col + 0.5) * cellW;
      const cy = gridY + (row + 0.5) * cellH;
      addRoundTableToSlide(slide, pptx, {
        cx,
        cy,
        radiusIn,
        seatRadiusIn,
        nameRadiusIn,
        capacity: t.capacity,
        seatLabels: t.seats,
        tableTitle: `${t.tableNo}号桌`,
        tableSubtitle: t.hallName || null,
        titleFontSize,
        subtitleFontSize,
        seatNumberFontSize,
        seatNameFontSize,
      });
    });
  }

  /** 单桌页：宽幅头区 + 居中一张可编辑大圆桌（与总览几何同源） */
  const tableHeaderX = 0.35;
  const contentTop = 1.18;
  const contentBottom = PPTX_WIDE_H_IN - 0.22;
  const tableCx = PPTX_WIDE_W_IN / 2;
  const tableCy = (contentTop + contentBottom) / 2;
  const maxRadial = Math.min(
    tableCx - 0.48,
    PPTX_WIDE_W_IN - tableCx - 0.48,
    tableCy - contentTop - 0.28,
    contentBottom - tableCy - 0.28,
  );
  /** 外圈姓名环 + 文本框外沿，预留约 1.42×桌圈半径 */
  const tableRadiusIn = Math.min(maxRadial / 1.42, 2.78);
  const tableSeatRadiusIn = tableRadiusIn * 0.82;
  const tableNameRadiusIn = tableRadiusIn + Math.min(0.45, tableRadiusIn * 0.48);
  const tableTitleFont = Math.min(18, Math.max(11, Math.round(tableRadiusIn * 7)));
  const tableSubtitleFont = Math.min(12, Math.max(8, Math.round(tableRadiusIn * 5)));
  const tableSeatNumFont = Math.min(12, Math.max(8, Math.round(tableRadiusIn * 5.5)));
  const tableSeatNameFont = Math.min(13, Math.max(9, Math.round(tableRadiusIn * 5.8)));
  const tableNameMaxChars = Math.min(8, Math.max(6, Math.round(4 + tableRadiusIn)));

  for (const t of scene.tables) {
    const slide = pptx.addSlide();
    slide.addText(`${t.tableNo} 号桌 · ${t.hallName}`, {
      x: tableHeaderX,
      y: 0.22,
      w: PPTX_TEXT_W,
      h: 0.5,
      fontSize: 20,
      bold: true,
      color: "0f172a",
    });
    const occ = t.seats.filter((s) => !s.isEmpty).length;
    slide.addText(`${t.tableKind ?? ""} · ${t.capacity} 人 · 已安排 ${occ} / ${t.capacity}`, {
      x: tableHeaderX,
      y: 0.72,
      w: PPTX_TEXT_W,
      h: 0.35,
      fontSize: 12,
      color: "64748b",
    });

    const centerSubtitle = t.tableKind?.trim() || `${t.capacity}人桌`;
    addRoundTableToSlide(slide, pptx, {
      cx: tableCx,
      cy: tableCy,
      radiusIn: tableRadiusIn,
      seatRadiusIn: tableSeatRadiusIn,
      nameRadiusIn: tableNameRadiusIn,
      capacity: t.capacity,
      seatLabels: t.seats,
      tableTitle: `${t.tableNo}号桌`,
      tableSubtitle: centerSubtitle,
      titleFontSize: tableTitleFont,
      subtitleFontSize: tableSubtitleFont,
      seatNumberFontSize: tableSeatNumFont,
      seatNameFontSize: tableSeatNameFont,
      nameMaxChars: tableNameMaxChars,
    });
  }

  const last = pptx.addSlide();
  last.addText("未安排人员", {
    x: tableHeaderX,
    y: 0.28,
    w: PPTX_TEXT_W,
    h: 0.45,
    fontSize: 20,
    bold: true,
    color: "0f172a",
  });
  last.addText(scene.unassignedPeople.length === 0 ? "无" : scene.unassignedPeople.map((p) => p.name).join("、"), {
    x: tableHeaderX,
    y: 0.85,
    w: PPTX_TEXT_W,
    h: PPTX_WIDE_H_IN - 1.0,
    fontSize: 14,
    color: "334155",
    valign: "top",
  });

  await pptx.writeFile({ fileName: `${outBase}.pptx` });
}

export async function exportLayoutPpt(layout: LayoutSnapshot): Promise<void> {
  const scene = buildExportSceneFromLayout(layout, getExportPlanDisplayName());
  await exportScenePpt(scene);
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
  downloadBlob(blob, `${sanitizePlanFileBase(getExportPlanDisplayName())}_排座总览.svg`);
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
  const scene = buildExportSceneFromLayout(layout, getExportPlanDisplayName());
  await exportOverviewImage(scene);
}

export async function exportLayoutJpg(layout: LayoutSnapshot): Promise<void> {
  const svg = buildLayoutSvg(layout);
  const blob = await svgToRaster(svg, "image/jpeg");
  downloadBlob(blob, `${sanitizePlanFileBase(getExportPlanDisplayName())}_排座总览.jpg`);
}
