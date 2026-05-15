import type pptxgen from "pptxgenjs";
import {
  STANDARD_SEAT_START_ANGLE_RAD,
  calculateSeatPositions,
} from "@/utils/seatGeometry";

/** 单个座位标签输入（与 ExportScene.tables[].seats[] 的字段子集对齐） */
export type PptSeatLabel = {
  seatNo: number;
  personName: string | null;
  isEmpty: boolean;
};

export type AddRoundTableOptions = {
  /** 桌中心 X（英寸；以幻灯片左上为原点） */
  cx: number;
  /** 桌中心 Y（英寸） */
  cy: number;
  /** 桌外圈半径（英寸） */
  radiusIn: number;
  /** 座位编号所在环半径（英寸；常用 radiusIn * 0.82） */
  seatRadiusIn: number;
  /** 姓名所在环半径（英寸；常用 radiusIn + 间隙） */
  nameRadiusIn: number;
  capacity: number;
  seatLabels: ReadonlyArray<PptSeatLabel>;
  /** 桌中心标题，如 "1 号桌" */
  tableTitle: string;
  /** 桌中心副标题，如 "锦绣厅 · 主桌"；空/未传则不画 */
  tableSubtitle?: string | null;
  /** 桌圈线颜色（hex，无 #），默认 "ea580c"（与总览同色） */
  ringColor?: string;
  /** 桌圈线宽（pt），默认 1.5 */
  ringLineWidthPt?: number;
  /** 标题字号（pt），默认 12 */
  titleFontSize?: number;
  /** 副标题字号（pt），默认 9 */
  subtitleFontSize?: number;
  /** 座位编号字号（pt），默认 9 */
  seatNumberFontSize?: number;
  /** 姓名字号（pt），默认 10 */
  seatNameFontSize?: number;
  /** 姓名最大字符数，超出截断；默认 6（与总览 shortSeatName 一致） */
  nameMaxChars?: number;
};

const DEFAULTS = {
  ringColor: "ea580c",
  ringLineWidthPt: 1.5,
  titleFontSize: 12,
  subtitleFontSize: 9,
  seatNumberFontSize: 9,
  seatNameFontSize: 10,
  nameMaxChars: 6,
} as const;

/**
 * 在 slide 上以 PPT 原生 ellipse + textbox 画一张圆桌：
 *   - 1 个空心 ellipse（桌圈）
 *   - 1 个中心 text（桌号 + 桌别两行）
 *   - N 个座位编号 text（沿 seatRadiusIn 环分布）
 *   - 占用座位额外 N 个姓名 text（沿 nameRadiusIn 环分布）
 *
 * 几何与 utils/seatGeometry.calculateSeatPositions 同源，
 * 与总览 / 全屏 / 卡片视图的座位排布完全一致。
 *
 * 注意：所有元素在 PPT 里都是独立可编辑对象（用户可点选 / 拖动 / 改字号）。
 */
export function addRoundTableToSlide(
  slide: pptxgen.Slide,
  pptx: pptxgen,
  opts: AddRoundTableOptions,
): void {
  const {
    cx,
    cy,
    radiusIn,
    seatRadiusIn,
    nameRadiusIn,
    capacity,
    seatLabels,
    tableTitle,
    tableSubtitle,
    ringColor = DEFAULTS.ringColor,
    ringLineWidthPt = DEFAULTS.ringLineWidthPt,
    titleFontSize = DEFAULTS.titleFontSize,
    subtitleFontSize = DEFAULTS.subtitleFontSize,
    seatNumberFontSize = DEFAULTS.seatNumberFontSize,
    seatNameFontSize = DEFAULTS.seatNameFontSize,
    nameMaxChars = DEFAULTS.nameMaxChars,
  } = opts;

  // 桌圈：空心 ellipse
  slide.addShape(pptx.ShapeType.ellipse, {
    x: cx - radiusIn,
    y: cy - radiusIn,
    w: radiusIn * 2,
    h: radiusIn * 2,
    fill: { type: "none" } as unknown as never,
    line: { color: ringColor, width: ringLineWidthPt },
  });

  // 中心标题：桌号 +（可选）桌别
  const titleBoxW = radiusIn * 1.4;
  const titleBoxH = radiusIn * 0.7;
  const subtitle = tableSubtitle?.trim() || "";
  if (subtitle) {
    slide.addText(
      [
        {
          text: tableTitle,
          options: { bold: true, fontSize: titleFontSize, color: "0f172a", breakLine: true },
        },
        {
          text: subtitle,
          options: { fontSize: subtitleFontSize, color: "475569" },
        },
      ],
      {
        x: cx - titleBoxW / 2,
        y: cy - titleBoxH / 2,
        w: titleBoxW,
        h: titleBoxH,
        align: "center",
        valign: "middle",
        margin: 0,
      },
    );
  } else {
    slide.addText(tableTitle, {
      x: cx - titleBoxW / 2,
      y: cy - titleBoxH / 2,
      w: titleBoxW,
      h: titleBoxH,
      align: "center",
      valign: "middle",
      fontSize: titleFontSize,
      bold: true,
      color: "0f172a",
      margin: 0,
    });
  }

  if (capacity <= 0) return;

  // 座位编号与姓名共享角度，仅环半径不同
  const numberRing = calculateSeatPositions({
    capacity,
    radius: seatRadiusIn,
    centerX: cx,
    centerY: cy,
    startAngle: STANDARD_SEAT_START_ANGLE_RAD,
  });
  const nameRing = calculateSeatPositions({
    capacity,
    radius: nameRadiusIn,
    centerX: cx,
    centerY: cy,
    startAngle: STANDARD_SEAT_START_ANGLE_RAD,
  });

  const labelByNo = new Map(seatLabels.map((s) => [s.seatNo, s]));
  // 文本框尺寸按桌半径自适应，避免大桌姓名挤、小桌占空间
  const numBoxW = Math.max(0.22, radiusIn * 0.32);
  const numBoxH = Math.max(0.18, radiusIn * 0.24);
  const nameBoxW = Math.max(0.7, radiusIn * 1.05);
  const nameBoxH = Math.max(0.22, radiusIn * 0.32);

  for (let i = 0; i < numberRing.length; i++) {
    const np = numberRing[i]!;
    const mp = nameRing[i]!;
    const label = labelByNo.get(np.seatNo);

    slide.addText(String(np.seatNo), {
      x: np.x - numBoxW / 2,
      y: np.y - numBoxH / 2,
      w: numBoxW,
      h: numBoxH,
      align: "center",
      valign: "middle",
      fontSize: seatNumberFontSize,
      bold: true,
      color: "0f172a",
      margin: 0,
    });

    if (label && !label.isEmpty && label.personName) {
      slide.addText(truncateName(label.personName, nameMaxChars), {
        x: mp.x - nameBoxW / 2,
        y: mp.y - nameBoxH / 2,
        w: nameBoxW,
        h: nameBoxH,
        align: "center",
        valign: "middle",
        fontSize: seatNameFontSize,
        color: "334155",
        margin: 0,
      });
    }
  }
}

function truncateName(name: string, maxChars: number): string {
  if (name.length <= maxChars) return name;
  return `${name.slice(0, Math.max(1, maxChars - 1))}…`;
}
