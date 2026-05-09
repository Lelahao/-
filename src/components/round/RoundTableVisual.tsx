import { useId, type ReactNode } from "react";
import {
  calculateSeatPositions,
  offsetFromCenter,
  polarOffset,
  STANDARD_SEAT_START_ANGLE_RAD,
} from "@/utils/seatGeometry";

export type RoundTableVisualMode = "card" | "fullscreen" | "export";

export type RoundTableVisualSeatSlotProps = {
  seatNo: number;
  offsetX: number;
  offsetY: number;
  angle: number;
  roleLabel: string | null;
  occupied: boolean;
  personName: string | null;
  /** 总览搜索：姓名模糊匹配 */
  searchMatch?: boolean;
};

export type RoundTableVisualProps = {
  mode: RoundTableVisualMode;
  tableNo: number;
  /** 中心圆桌第二行（桌别） */
  tableKind: string | null;
  capacity: number;
  /** 索引 0 对应 1 号座 */
  seatOccupied: boolean[];
  seatNames?: (string | null)[];
  dropActive?: boolean;
  seatError?: boolean[];
  renderSeat?: (p: RoundTableVisualSeatSlotProps) => ReactNode;
  /** 全屏：圆桌画布边长(px)，用于随桌卡容器宽度缩放 */
  fullscreenBoxPx?: number;
  /** 姓名模糊匹配高亮（总览搜索） */
  personSearchQuery?: string;
};

const CARD_VB = 128;
const CARD_CX = CARD_VB / 2;
const CARD_CY = CARD_VB / 2;
const CARD_RING_R = 42;
const CARD_INNER_R = 22;
const CARD_LABEL_OFFSET = 13;
const CARD_DOT_R = 3.8;

function truncateSubtitle(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

function shortSeatName(name: string, maxChars: number): string {
  if (name.length <= maxChars) return name;
  return `${name.slice(0, Math.max(1, maxChars - 1))}…`;
}

/** 全屏 / 导出共用：画布边长、中心、环半径、中心圆桌直径(px) */
const FS_BOX = 360;
const FS_CENTER = FS_BOX / 2;
const FS_RING_R = 108;
const FS_TABLE_D = 150;

export function RoundTableVisual(props: RoundTableVisualProps) {
  const shadowFilterId = `rtv-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const {
    mode,
    tableNo,
    tableKind,
    capacity,
    seatOccupied,
    seatNames,
    dropActive,
    seatError,
    renderSeat,
    fullscreenBoxPx,
    personSearchQuery,
  } = props;

  const searchQ = personSearchQuery?.trim().toLowerCase() ?? "";
  const names =
    seatNames?.length === capacity ? seatNames : Array.from({ length: capacity }, () => null);

  if (mode === "fullscreen") {
    if (!renderSeat) {
      return (
        <div className="relative mx-auto text-center text-xs text-rose-600">
          fullscreen 模式需提供 renderSeat
        </div>
      );
    }
    const fsBox = Math.round(Math.max(200, Math.min(400, fullscreenBoxPx ?? FS_BOX)));
    const fsUnit = fsBox / FS_BOX;
    /** 内层固定 FS_BOX 坐标，整体 scale(fsUnit)，使人名等固定 px 的 seat 内容与圆桌同心同比缩放 */
    const fsCenter = FS_CENTER;
    const fsRingR = FS_RING_R;
    const fsTableD = FS_TABLE_D;
    const fsSeatW = 132;

    const positions = calculateSeatPositions({
      capacity,
      radius: fsRingR,
      centerX: fsCenter,
      centerY: fsCenter,
      startAngle: STANDARD_SEAT_START_ANGLE_RAD,
    });
    const sub = tableKind;

    return (
      <div
        className="relative mx-auto mt-4"
        style={{ width: fsBox, height: fsBox }}
      >
        <div
          className="absolute left-1/2 top-1/2"
          style={{
            width: FS_BOX,
            height: FS_BOX,
            transform: `translate(-50%, -50%) scale(${fsUnit})`,
          }}
        >
          <div className="absolute left-1/2 top-1/2 flex flex-col items-center justify-center rounded-full border border-slate-200/90 bg-slate-50 px-3 text-center shadow-[inset_0_1px_0_rgb(255_255_255_/_0.85)]"
            style={{
              width: fsTableD,
              height: fsTableD,
              transform: "translate(-50%, -50%)",
            }}
          >
            <div className="text-sm font-semibold text-slate-900">{tableNo}号桌</div>
            {sub ? (
              <div className="mt-1 max-w-[6.5rem] text-[11px] leading-snug text-slate-600">{sub}</div>
            ) : null}
          </div>

          {positions.map((pos) => {
            const i = pos.seatNo - 1;
            const occ = seatOccupied[i] ?? false;
            const pName = names[i] ?? null;
            const searchMatch = Boolean(
              searchQ && pName && pName.trim().toLowerCase().includes(searchQ),
            );
            const { x, y } = offsetFromCenter(pos.x, pos.y, fsCenter, fsCenter);
            return (
              <div
                key={pos.seatNo}
                className="absolute left-1/2 top-1/2"
                style={{
                  width: fsSeatW,
                  transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
                }}
              >
                {renderSeat({
                  seatNo: pos.seatNo,
                  offsetX: x,
                  offsetY: y,
                  angle: pos.angle,
                  roleLabel: pos.roleLabel,
                  occupied: occ,
                  personName: pName,
                  searchMatch,
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /* card + export: SVG */
  const sub = tableKind ? truncateSubtitle(tableKind, mode === "export" ? 12 : 8) : null;

  const positions = calculateSeatPositions({
    capacity,
    radius: CARD_RING_R,
    centerX: CARD_CX,
    centerY: CARD_CY,
    startAngle: STANDARD_SEAT_START_ANGLE_RAD,
  });

  const svg = (
    <svg
      width={mode === "export" ? CARD_VB : undefined}
      height={mode === "export" ? CARD_VB : undefined}
      viewBox={`0 0 ${CARD_VB} ${CARD_VB}`}
      className={`shrink-0 overflow-visible ${mode === "export" ? "block" : "mx-auto block h-auto w-full max-w-[min(100%,8.75rem)]"}`}
      aria-hidden
    >
      <defs>
        <filter id={shadowFilterId} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1" stdDeviation="0.8" floodOpacity="0.08" />
        </filter>
      </defs>

      <g filter={`url(#${shadowFilterId})`}>
        <circle cx={CARD_CX} cy={CARD_CY} r={CARD_INNER_R} className="fill-slate-50 stroke-slate-200/90" strokeWidth={1} />
        <text
          x={CARD_CX}
          y={sub ? CARD_CY - 4 : CARD_CY + 3}
          textAnchor="middle"
          className="fill-slate-900 font-semibold"
          style={{ fontSize: 11 }}
        >
          {tableNo}号桌
        </text>
        {sub ? (
          <text
            x={CARD_CX}
            y={CARD_CY + 12}
            textAnchor="middle"
            className="fill-slate-500"
            style={{ fontSize: 8 }}
          >
            {sub}
          </text>
        ) : null}
      </g>

      {positions.map((pos) => {
        const i = pos.seatNo - 1;
        const occ = seatOccupied[i] ?? false;
        const name = names[i] ?? null;
        const role = pos.roleLabel;
        const nameHit = Boolean(searchQ && name && name.trim().toLowerCase().includes(searchQ));
        const title = role ? (name ? `${role} · ${name}` : role) : name ? `${pos.seatNo} · ${name}` : `${pos.seatNo}`;

        const labelR = CARD_RING_R + CARD_LABEL_OFFSET;
        const lx = polarOffset(CARD_CX, CARD_CY, labelR, pos.angle).x;
        const ly = polarOffset(CARD_CX, CARD_CY, labelR, pos.angle).y;

        const nameR = role ? (CARD_INNER_R + CARD_RING_R) / 2 : labelR;
        const nx = polarOffset(CARD_CX, CARD_CY, nameR, pos.angle).x;
        const ny = polarOffset(CARD_CX, CARD_CY, nameR, pos.angle).y;

        let dotClass = "fill-white stroke-slate-300 stroke-[1.2]";
        if (occ) dotClass = "fill-orange-500 stroke-orange-600/30 stroke-[1]";
        if (dropActive && !occ) dotClass = "fill-orange-100 stroke-orange-400 stroke-[1.5]";
        if (seatError?.[i]) dotClass = `${dotClass} stroke-red-500 stroke-[2]`;
        if (nameHit) dotClass = `${dotClass} fill-amber-400 stroke-amber-600 stroke-[1.5]`;

        return (
          <g key={pos.seatNo}>
            <title>{title}</title>
            <circle cx={pos.x} cy={pos.y} r={CARD_DOT_R} className={dotClass} />
            {occ && name ? (
              <text
                x={nx}
                y={ny}
                textAnchor="middle"
                dominantBaseline="middle"
                className={`pointer-events-none ${nameHit ? "fill-amber-800 font-semibold" : "fill-slate-700"}`}
                style={{ fontSize: 6.5 }}
              >
                {shortSeatName(name, 6)}
              </text>
            ) : null}
            {role ? (
              <text
                x={lx}
                y={ly}
                textAnchor="middle"
                dominantBaseline="middle"
                className="pointer-events-none fill-slate-600"
                style={{ fontSize: 8 }}
              >
                {role}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );

  if (mode === "export") {
    return <div className="inline-block bg-white text-slate-900">{svg}</div>;
  }

  return <div className="flex w-full min-w-0 justify-center px-0.5">{svg}</div>;
}

export const roundVisualFullscreenLayout = {
  box: FS_BOX,
  center: FS_CENTER,
  ringR: FS_RING_R,
  tableD: FS_TABLE_D,
} as const;
