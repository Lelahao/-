import { getSeatRoleLabel } from "@/config/seatRoleTemplates";

/** 与历史实现一致：0 号席在正上方（12 点方向） */
export const STANDARD_SEAT_START_ANGLE_RAD = -Math.PI / 2;

export type CalculateSeatPositionsParams = {
  capacity: number;
  radius: number;
  centerX: number;
  centerY: number;
  /** 弧度；常用 `STANDARD_SEAT_START_ANGLE_RAD` */
  startAngle: number;
};

export type CalculatedSeatPosition = {
  seatNo: number;
  x: number;
  y: number;
  angle: number;
  roleLabel: string | null;
};

export type AngularSeatSlot = {
  /** 顺时针等分角位序号，从 12 点方向起为 0 */
  slotIndex: number;
  /** 业务席位号（交叉排布时的逻辑座号） */
  logicalSeatNo: number;
  x: number;
  y: number;
  angle: number;
  roleLabel: string | null;
};

/**
 * 顶为 1；顺时针角位 0..N-1 依次为：
 * 1 → 所有 ≤N 的偶数升序 → 从不超过 N 的最大奇数递减至 3（含 N 本身当 N 为奇时作为奇数段首）。
 * 例 N=15：1,2,4,6,8,10,12,14,15,13,11,9,7,5,3。
 * @internal 供 calculateAngularSeatSlots 单次构建。
 */
function buildClockwiseSymmetricSeatRing(capacity: number): number[] {
  if (capacity < 2) return [1];

  const evens: number[] = [];
  for (let n = 2; n <= capacity; n += 2) evens.push(n);

  const maxOdd = capacity % 2 === 1 ? capacity : capacity - 1;
  const oddsDesc: number[] = [];
  for (let n = maxOdd; n >= 3; n -= 2) oddsDesc.push(n);

  return [1, ...evens, ...oddsDesc];
}

export function logicalSeatNoAtAngularSlot(slotIndex: number, capacity: number): number {
  if (slotIndex < 0 || slotIndex >= capacity) return 1;
  return buildClockwiseSymmetricSeatRing(capacity)[slotIndex] ?? 1;
}

/**
 * 圆环角位 + 逻辑座号（交叉布局）+ 坐标；用于全屏 / SVG 导出同源几何。
 */
export function calculateAngularSeatSlots(params: CalculateSeatPositionsParams): AngularSeatSlot[] {
  const { capacity, radius, centerX, centerY, startAngle } = params;
  const ring = buildClockwiseSymmetricSeatRing(capacity);
  const out: AngularSeatSlot[] = [];
  for (let k = 0; k < capacity; k++) {
    const angle = (2 * Math.PI * k) / capacity + startAngle;
    const logicalSeatNo = ring[k]!;
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);
    out.push({
      slotIndex: k,
      logicalSeatNo,
      x,
      y,
      angle,
      roleLabel: getSeatRoleLabel(capacity, logicalSeatNo),
    });
  }
  return out;
}

/**
 * 统一圆桌座位环几何：座位点坐标 + 方位标签（来自 config，无模板则为 null）。
 */
export function calculateSeatPositions(params: CalculateSeatPositionsParams): CalculatedSeatPosition[] {
  return calculateAngularSeatSlots(params).map((s) => ({
    seatNo: s.logicalSeatNo,
    x: s.x,
    y: s.y,
    angle: s.angle,
    roleLabel: s.roleLabel,
  }));
}

export function polarOffset(centerX: number, centerY: number, r: number, angleRad: number) {
  return {
    x: centerX + r * Math.cos(angleRad),
    y: centerY + r * Math.sin(angleRad),
  };
}

/** 将绝对坐标转为相对中心点的平移量（用于 CSS translate） */
export function offsetFromCenter(x: number, y: number, centerX: number, centerY: number) {
  return { x: x - centerX, y: y - centerY };
}
