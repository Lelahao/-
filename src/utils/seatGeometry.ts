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

/**
 * 统一圆桌座位环几何：座位点坐标 + 方位标签（来自 config，无模板则为 null）。
 */
export function calculateSeatPositions(params: CalculateSeatPositionsParams): CalculatedSeatPosition[] {
  const { capacity, radius, centerX, centerY, startAngle } = params;
  const out: CalculatedSeatPosition[] = [];
  for (let i = 0; i < capacity; i++) {
    const seatNo = i + 1;
    const angle = (2 * Math.PI * i) / capacity + startAngle;
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);
    out.push({
      seatNo,
      x,
      y,
      angle,
      roleLabel: getSeatRoleLabel(capacity, seatNo),
    });
  }
  return out;
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
