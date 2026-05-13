import { type ReactNode } from "react";
import {
  calculateSeatPositions,
  offsetFromCenter,
  polarOffset,
  STANDARD_SEAT_START_ANGLE_RAD,
} from "@/utils/seatGeometry";
import { FS_FULLSCREEN_OUTER_CAP } from "@/fullscreen/fullscreenVisualCaps";

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
/** 橙色桌圈（空心）；数字在圈内，姓名在圈外 */
const CARD_BORDER_R = 44;
const CARD_NUMBER_R = 30;
const CARD_NAME_R = 62;
const CARD_ROLE_R = 71;

function truncateSubtitle(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

function shortSeatName(name: string, maxChars: number): string {
  if (name.length <= maxChars) return name;
  return `${name.slice(0, Math.max(1, maxChars - 1))}…`;
}

/** 全屏逻辑尺寸：外圈座位半径（与 calculateSeatPositions 一致）；编号排在圆内侧附近 */
const FS_BOX = 360;
const FS_CENTER = FS_BOX / 2;
const FS_RING_R = 104;
/** 编号所在圆半径与外圈半径之比（略小于 1，使数字落在外圈橙线内侧） */
const FS_FULLSCREEN_NUMBER_RING_RATIO = 0.82;

export function RoundTableVisual(props: RoundTableVisualProps) {
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
    const fsBox = Math.round(Math.max(200, Math.min(FS_FULLSCREEN_OUTER_CAP, fullscreenBoxPx ?? FS_BOX)));
    const fsUnit = fsBox / FS_BOX;
    /** 仅唯一外橙圈、中心桌号文案、圈内编号随 fsUnit 缩放；桌外姓名卡片不缩放 */
    const fsCenter = FS_CENTER;
    const fsRingR = FS_RING_R;
    const numberR = fsRingR * FS_FULLSCREEN_NUMBER_RING_RATIO;
    /** 姓名卡片相对「座位环」外沿的额外间隙：**固定屏幕 px**，不随圆桌缩放，避免放大时间隙被同步拉大 */
    const nameCardRingGapPx = capacity >= 14 ? 30 : capacity >= 10 ? 24 : 18;

    const positions = calculateSeatPositions({
      capacity,
      radius: fsRingR,
      centerX: fsCenter,
      centerY: fsCenter,
      startAngle: STANDARD_SEAT_START_ANGLE_RAD,
    });
    const sub = tableKind;

    return (
      <div className="relative mx-auto h-full w-full" style={{ width: fsBox, height: fsBox }}>
        <div
          className="pointer-events-none absolute left-1/2 top-1/2"
          style={{
            width: FS_BOX,
            height: FS_BOX,
            transform: `translate(-50%, -50%) scale(${fsUnit})`,
          }}
        >
          {/* 唯一圆桌橙色边框：与座位几何外环同径 */}
          <div
            className="absolute left-1/2 top-1/2 z-[8] rounded-full border-2 border-orange-500 bg-transparent"
            style={{
              width: fsRingR * 2,
              height: fsRingR * 2,
              transform: "translate(-50%, -50%)",
            }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 z-10 flex max-w-[9.5rem] flex-col items-center justify-center px-2 text-center"
            style={{ transform: "translate(-50%, -50%)" }}
          >
            <div className="text-sm font-semibold text-slate-900">{tableNo}号桌</div>
            {sub ? (
              <div className="mt-1 max-w-[6.5rem] text-[11px] leading-snug text-slate-600">{sub}</div>
            ) : null}
          </div>

          {positions.map((pos, slotIdx) => {
            const ix = fsCenter + numberR * Math.cos(pos.angle);
            const iy = fsCenter + numberR * Math.sin(pos.angle);
            const io = offsetFromCenter(ix, iy, fsCenter, fsCenter);
            const si = pos.seatNo - 1;
            const nameHit = Boolean(
              searchQ && names[si] && names[si]!.trim().toLowerCase().includes(searchQ),
            );
            const err = seatError?.[si];
            return (
              <div
                key={`fs-in-${slotIdx}`}
                className="absolute left-1/2 top-1/2 z-[12]"
                style={{ transform: `translate(-50%, -50%) translate(${io.x}px, ${io.y}px)` }}
              >
                <span
                  className={[
                    "flex h-7 min-w-[1.75rem] shrink-0 items-center justify-center px-0.5 text-[11px] font-semibold tabular-nums text-slate-900",
                    err ? "text-red-700" : "",
                    nameHit ? "text-amber-900" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {pos.seatNo}
                </span>
              </div>
            );
          })}
        </div>

        <div className="pointer-events-none absolute inset-0">
          {positions.map((pos, slotIdx) => {
            const i = pos.seatNo - 1;
            const occ = seatOccupied[i] ?? false;
            const pName = names[i] ?? null;
            const searchMatch = Boolean(
              searchQ && pName && pName.trim().toLowerCase().includes(searchQ),
            );
            const { x, y } = offsetFromCenter(pos.x, pos.y, fsCenter, fsCenter);
            const xScaled = x * fsUnit;
            const yScaled = y * fsUnit;
            const dist = Math.hypot(xScaled, yScaled) || 1;
            const push = nameCardRingGapPx;
            const xP = xScaled + (xScaled / dist) * push;
            const yP = yScaled + (yScaled / dist) * push;
            return (
              <div
                key={`fs-slot-${slotIdx}`}
                className="absolute left-1/2 top-1/2 z-20 flex w-max max-w-[11rem] justify-center"
                style={{
                  transform: `translate(-50%, -50%) translate(${xP}px, ${yP}px)`,
                }}
              >
                {renderSeat({
                  seatNo: pos.seatNo,
                  offsetX: xP,
                  offsetY: yP,
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
      <g>
        <title>
          {tableNo}号桌{sub ? ` ${sub}` : ""}
        </title>
        <circle
          cx={CARD_CX}
          cy={CARD_CY}
          r={CARD_BORDER_R}
          fill="none"
          stroke="#ea580c"
          strokeWidth={1.8}
        />
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

        const numPt = polarOffset(CARD_CX, CARD_CY, CARD_NUMBER_R, pos.angle);
        const namePt = polarOffset(CARD_CX, CARD_CY, CARD_NAME_R, pos.angle);

        let numClass = "pointer-events-none fill-slate-900 font-semibold";
        if (seatError?.[i]) numClass = "pointer-events-none fill-red-600 font-semibold";
        if (nameHit) numClass = "pointer-events-none fill-amber-700 font-semibold";
        if (dropActive && !occ) numClass = "pointer-events-none fill-orange-600 font-semibold";

        let nameClass = `pointer-events-none ${nameHit ? "fill-amber-800 font-semibold" : "fill-slate-700"}`;

        return (
          <g key={`slot-${pos.seatNo}`}>
            <title>{title}</title>
            <text
              x={numPt.x}
              y={numPt.y}
              textAnchor="middle"
              dominantBaseline="middle"
              className={numClass}
              style={{ fontSize: 9 }}
            >
              {pos.seatNo}
            </text>
            {occ && name ? (
              <text
                x={namePt.x}
                y={namePt.y}
                textAnchor="middle"
                dominantBaseline="middle"
                className={nameClass}
                style={{ fontSize: 6.5 }}
              >
                {shortSeatName(name, 6)}
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
  numberRingRatio: FS_FULLSCREEN_NUMBER_RING_RATIO,
} as const;
