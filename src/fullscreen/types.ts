export type PersonRecord = {
  id: string;
  name: string;
  assignedTableId: string | null;
  assignedSeatNo: number | null;
};

export type TableDefinition = {
  id: string;
  no: number;
  hallName: string;
  capacity: number;
};

export type LayoutSnapshot = {
  people: PersonRecord[];
  tables: TableDefinition[];
};

export type SeatDragData = {
  sourceTableId: string | null;
  sourceSeatNo: number;
  personId: string;
  personName: string;
};
