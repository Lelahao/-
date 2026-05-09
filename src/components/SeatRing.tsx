import { RoundTableVisual } from "@/components/round/RoundTableVisual";

export type SeatRingProps = {
  capacity: number;
  /** 索引 0 对应 1 号座 */
  occupied: boolean[];
  tableNo: number;
  /** 中心圆桌第二行；null 时只显示桌号 */
  tableSubtitle: string | null;
  dropActive?: boolean;
  /** 每席姓名，用于 title 悬停看全名 */
  seatNames?: (string | null)[];
  seatError?: boolean[];
  /** 总览顶栏姓名搜索：模糊匹配高亮 */
  personSearchQuery?: string;
};

/** 总览小卡圆环：由 RoundTableVisual(card) 统一几何与模板 */
export function SeatRing(props: SeatRingProps) {
  return (
    <RoundTableVisual
      mode="card"
      tableNo={props.tableNo}
      tableKind={props.tableSubtitle}
      capacity={props.capacity}
      seatOccupied={props.occupied}
      seatNames={props.seatNames}
      dropActive={props.dropActive}
      seatError={props.seatError}
      personSearchQuery={props.personSearchQuery}
    />
  );
}
