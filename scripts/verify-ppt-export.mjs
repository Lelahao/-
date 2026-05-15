/**
 * 验证 PPT 排座总览幻灯片用的是 PPT 原生 ellipse + textbox，而不是嵌入 PNG。
 *
 * 该脚本只用 pptxgenjs 做"重现"，调用方式与 src/lib/pptShapes.ts 一致；
 * 复制了 src/utils/seatGeometry.ts 中圆环几何逻辑（精简版），
 * 用于在 Node 环境直接生成 .pptx，避免去 Vite + 浏览器流程。
 */
import { mkdirSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import pptxgen from "pptxgenjs";
import JSZip from "jszip";

/** ---------- 1. 合成 scene（2 桌、5 人，类似 demo 数据） ---------- */
const scene = {
  planName: "验证导出 · 测试方案",
  stats: { tableCount: 2, peopleCount: 5, assignedCount: 4, unassignedCount: 1 },
  tables: [
    {
      tableId: "t1",
      tableNo: 1,
      tableRole: "主桌",
      tableKind: "主桌",
      capacity: 8,
      hallName: "锦绣厅一桌",
      seats: [
        { seatNo: 1, roleLabel: null, personName: "张三", isEmpty: false },
        { seatNo: 2, roleLabel: null, personName: "李四", isEmpty: false },
        { seatNo: 3, roleLabel: null, personName: null, isEmpty: true },
        { seatNo: 4, roleLabel: null, personName: null, isEmpty: true },
        { seatNo: 5, roleLabel: null, personName: null, isEmpty: true },
        { seatNo: 6, roleLabel: null, personName: null, isEmpty: true },
        { seatNo: 7, roleLabel: null, personName: null, isEmpty: true },
        { seatNo: 8, roleLabel: null, personName: null, isEmpty: true },
      ],
    },
    {
      tableId: "t2",
      tableNo: 2,
      tableRole: null,
      tableKind: "宾客桌",
      capacity: 10,
      hallName: "锦绣厅二桌",
      seats: [
        { seatNo: 1, roleLabel: null, personName: "王五", isEmpty: false },
        { seatNo: 2, roleLabel: null, personName: "赵六", isEmpty: false },
        ...Array.from({ length: 8 }, (_, i) => ({
          seatNo: i + 3,
          roleLabel: null,
          personName: null,
          isEmpty: true,
        })),
      ],
    },
  ],
  unassignedPeople: [{ id: "p5", name: "周七" }],
  versionExport: null,
};

/** ---------- 2. 几何工具（与 utils/seatGeometry.ts 同源逻辑） ---------- */
const STANDARD_SEAT_START_ANGLE_RAD = -Math.PI / 2;
function buildClockwiseSymmetricSeatRing(capacity) {
  if (capacity < 2) return [1];
  const evens = [];
  for (let n = 2; n <= capacity; n += 2) evens.push(n);
  const maxOdd = capacity % 2 === 1 ? capacity : capacity - 1;
  const oddsDesc = [];
  for (let n = maxOdd; n >= 3; n -= 2) oddsDesc.push(n);
  return [1, ...evens, ...oddsDesc];
}
function calculateSeatPositions({ capacity, radius, centerX, centerY, startAngle }) {
  const ring = buildClockwiseSymmetricSeatRing(capacity);
  const out = [];
  for (let k = 0; k < capacity; k++) {
    const angle = (2 * Math.PI * k) / capacity + startAngle;
    out.push({
      seatNo: ring[k],
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
      angle,
    });
  }
  return out;
}

/** ---------- 3. addRoundTableToSlide（与 src/lib/pptShapes.ts 等价复刻） ---------- */
function truncateName(name, max) {
  return name.length <= max ? name : `${name.slice(0, Math.max(1, max - 1))}…`;
}
function addRoundTableToSlide(slide, pptx, opts) {
  const {
    cx, cy, radiusIn, seatRadiusIn, nameRadiusIn, capacity, seatLabels,
    tableTitle, tableSubtitle,
    ringColor = "ea580c", ringLineWidthPt = 1.5,
    titleFontSize = 12, subtitleFontSize = 9,
    seatNumberFontSize = 9, seatNameFontSize = 10, nameMaxChars = 6,
  } = opts;

  slide.addShape(pptx.ShapeType.ellipse, {
    x: cx - radiusIn, y: cy - radiusIn, w: radiusIn * 2, h: radiusIn * 2,
    fill: { type: "none" }, line: { color: ringColor, width: ringLineWidthPt },
  });

  const titleBoxW = radiusIn * 1.4;
  const titleBoxH = radiusIn * 0.7;
  const subtitle = (tableSubtitle ?? "").trim();
  if (subtitle) {
    slide.addText(
      [
        { text: tableTitle, options: { bold: true, fontSize: titleFontSize, color: "0f172a", breakLine: true } },
        { text: subtitle, options: { fontSize: subtitleFontSize, color: "475569" } },
      ],
      { x: cx - titleBoxW / 2, y: cy - titleBoxH / 2, w: titleBoxW, h: titleBoxH, align: "center", valign: "middle", margin: 0 },
    );
  } else {
    slide.addText(tableTitle, {
      x: cx - titleBoxW / 2, y: cy - titleBoxH / 2, w: titleBoxW, h: titleBoxH,
      align: "center", valign: "middle", fontSize: titleFontSize, bold: true, color: "0f172a", margin: 0,
    });
  }

  if (capacity <= 0) return;

  const numberRing = calculateSeatPositions({ capacity, radius: seatRadiusIn, centerX: cx, centerY: cy, startAngle: STANDARD_SEAT_START_ANGLE_RAD });
  const nameRing = calculateSeatPositions({ capacity, radius: nameRadiusIn, centerX: cx, centerY: cy, startAngle: STANDARD_SEAT_START_ANGLE_RAD });
  const labelByNo = new Map(seatLabels.map((s) => [s.seatNo, s]));
  const numBoxW = Math.max(0.22, radiusIn * 0.32);
  const numBoxH = Math.max(0.18, radiusIn * 0.24);
  const nameBoxW = Math.max(0.7, radiusIn * 1.05);
  const nameBoxH = Math.max(0.22, radiusIn * 0.32);

  for (let i = 0; i < numberRing.length; i++) {
    const np = numberRing[i];
    const mp = nameRing[i];
    const label = labelByNo.get(np.seatNo);
    slide.addText(String(np.seatNo), {
      x: np.x - numBoxW / 2, y: np.y - numBoxH / 2, w: numBoxW, h: numBoxH,
      align: "center", valign: "middle", fontSize: seatNumberFontSize, bold: true, color: "0f172a", margin: 0,
    });
    if (label && !label.isEmpty && label.personName) {
      slide.addText(truncateName(label.personName, nameMaxChars), {
        x: mp.x - nameBoxW / 2, y: mp.y - nameBoxH / 2, w: nameBoxW, h: nameBoxH,
        align: "center", valign: "middle", fontSize: seatNameFontSize, color: "334155", margin: 0,
      });
    }
  }
}

/** ---------- 4. exportScenePpt（与 src/lib/planExport.ts 阶段 2 后等价复刻） ---------- */
async function exportScenePpt(scene, outPath) {
  const pptx = new pptxgen();
  pptx.author = "排座助手";
  pptx.title = scene.planName;
  pptx.layout = "LAYOUT_WIDE";

  const OVERVIEW_TABLES_PER_SLIDE = 12;
  const overviewPages = Math.max(1, Math.ceil(scene.tables.length / OVERVIEW_TABLES_PER_SLIDE));
  for (let pageIdx = 0; pageIdx < overviewPages; pageIdx++) {
    const pageTables = scene.tables.slice(pageIdx * OVERVIEW_TABLES_PER_SLIDE, (pageIdx + 1) * OVERVIEW_TABLES_PER_SLIDE);
    const slide = pptx.addSlide();
    const pageSuffix = overviewPages > 1 ? `（${pageIdx + 1}/${overviewPages}）` : "";
    slide.addText(`${scene.planName}${pageSuffix}`, { x: 0.35, y: 0.2, w: 12.6, h: 0.55, fontSize: 22, bold: true, color: "0f172a" });
    let yNext = 0.52;
    slide.addText(
      `总桌数：${scene.stats.tableCount} ｜ 人员条目：${scene.stats.peopleCount} ｜ 已安排：${scene.stats.assignedCount} ｜ 未安排：${scene.stats.unassignedCount}`,
      { x: 0.35, y: yNext, w: 12.6, h: 0.35, fontSize: 12, color: "475569" },
    );
    yNext += 0.4;
    if (pageIdx === 0) {
      slide.addText(`导出时间：${new Date().toLocaleString("zh-CN", { hour12: false })}`, { x: 0.35, y: yNext, w: 12.6, h: 0.3, fontSize: 10, color: "94a3b8" });
      yNext += 0.34;
    }

    const gridX = 0.4, gridW = 12.53;
    const gridY = Math.max(1.35, yNext + 0.1);
    const gridH = Math.max(2.5, 7.2 - gridY);
    const n = pageTables.length;
    const cols = n <= 2 ? n : n <= 4 ? 2 : n <= 9 ? 3 : 4;
    const rows = Math.max(1, Math.ceil(n / cols));
    const cellW = gridW / cols;
    const cellH = gridH / rows;
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
      addRoundTableToSlide(slide, pptx, {
        cx: gridX + (col + 0.5) * cellW,
        cy: gridY + (row + 0.5) * cellH,
        radiusIn, seatRadiusIn, nameRadiusIn,
        capacity: t.capacity,
        seatLabels: t.seats,
        tableTitle: `${t.tableNo}号桌`,
        tableSubtitle: t.hallName || null,
        titleFontSize, subtitleFontSize, seatNumberFontSize, seatNameFontSize,
      });
    });
  }

  await pptx.writeFile({ fileName: outPath });
}

/** ---------- 5. 运行 + 解压 + 检查 slide1.xml ---------- */
const OUT_DIR = resolve("scripts", "out");
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
const OUT_PPT = resolve(OUT_DIR, "verify_export.pptx");
await exportScenePpt(scene, OUT_PPT);
console.log(`[1/3] PPTX 生成完成: ${OUT_PPT}`);

const zip = await JSZip.loadAsync(readFileSync(OUT_PPT));
const slide1Entry = zip.file("ppt/slides/slide1.xml");
if (!slide1Entry) throw new Error("ppt/slides/slide1.xml 不存在于 .pptx");
const slide1 = await slide1Entry.async("string");
console.log(`[2/3] slide1.xml 已读取（${slide1.length} 字节）`);

const ellipseCount = (slide1.match(/prst="ellipse"/g) ?? []).length;
const picCount = (slide1.match(/<p:pic/g) ?? []).length;
const textBoxCount = (slide1.match(/<p:sp>/g) ?? []).length;
const seatNoTexts = (slide1.match(/<a:t>[1-9]<\/a:t>|<a:t>1[0-9]<\/a:t>/g) ?? []).length;
const personTexts = (slide1.match(/张三|李四|王五|赵六/g) ?? []).length;

console.log(`[3/3] 审计 slide1.xml`);
console.log("\n=========== 验证结果 ===========");
console.log(`第 1 张幻灯片 (slide1.xml) 内容审计:`);
console.log(`  · ellipse 形状数量      = ${ellipseCount}  (期望 ≥ 2，每张桌一个)`);
console.log(`  · 嵌入图片 (p:pic) 数量 = ${picCount}      (期望 = 0，证明无 PNG)`);
console.log(`  · 形状/文本框总数 (p:sp) = ${textBoxCount}`);
console.log(`  · 座位编号文本数量      = ${seatNoTexts}   (8+10 = 18 个座位号)`);
console.log(`  · 已知姓名出现次数      = ${personTexts}   (期望 4: 张三/李四/王五/赵六)`);

const ok = ellipseCount >= 2 && picCount === 0 && personTexts === 4;
console.log("\n" + (ok ? "✅ 通过：第 1 张总览幻灯片确实由原生 ellipse + textbox 组成，无嵌入 PNG。" : "❌ 未通过：见上方计数。"));
console.log("\n手动验证：可直接打开此文件查看视觉效果：");
console.log(`  ${OUT_PPT}`);
console.log("================================");
process.exit(ok ? 0 : 1);
