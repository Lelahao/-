/** 与后端 JSON（camelCase）对齐的领域类型，供 dbApi 与 api/* 共用。 */

export type PlanRow = {
  id: string;
  name: string;
  note: string | null;
  status: string;
  createdAt: number;
  updatedAt: number;
};

export type PersonRow = {
  id: string;
  planId: string;
  displayName: string;
  assignedTableId: string | null;
  assignedSeatNo: number | null;
  metaJson: string | null;
  createdAt: number;
  updatedAt: number;
};

export type TableRow = {
  id: string;
  planId: string;
  tableNo: number;
  hallName: string | null;
  capacity: number;
  kind: string;
  metaJson: string | null;
  createdAt: number;
  updatedAt: number;
};

export type SeatRow = {
  id: string;
  planId: string;
  tableId: string;
  seatNo: number;
  personId: string | null;
  locked: boolean;
  metaJson: string | null;
  createdAt: number;
  updatedAt: number;
};

export type PlanDetail = {
  plan: PlanRow;
  people: PersonRow[];
  tables: TableRow[];
  seats: SeatRow[];
};

export type UISettingRow = {
  key: string;
  value: string;
  updatedAt: number;
};

/** GET /api/plans/{planId}/versions 列表项 */
export type PlanVersionListItem = {
  id: string;
  versionNo: number;
  versionName: string | null;
  note: string | null;
  tableCount: number;
  peopleCount: number;
  assignedCount: number;
  unassignedCount: number;
  createdAt: number;
};

/** POST /api/plans/{planId}/versions 响应 */
export type PlanVersionCreateResult = {
  id: string;
  planId: string;
  versionNo: number;
  versionName: string | null;
  note: string | null;
  tableCount: number;
  peopleCount: number;
  assignedCount: number;
  unassignedCount: number;
  createdAt: number;
  createdBy: string | null;
  exportCount: number;
};
