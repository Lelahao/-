-- 排座助手单库 paizuo.db（与 Rust app_db + layout_db 能力对齐，layout 使用 round_layout_* 前缀避免与业务表名冲突）
-- 多次执行安全：仅 IF NOT EXISTS

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tables (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    table_no INTEGER NOT NULL,
    hall_name TEXT,
    capacity INTEGER NOT NULL,
    kind TEXT NOT NULL DEFAULT 'round',
    meta_json TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(plan_id, table_no)
);

CREATE TABLE IF NOT EXISTS people (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    region TEXT,
    position TEXT,
    role TEXT,
    assigned_table_id TEXT REFERENCES tables(id) ON DELETE SET NULL,
    assigned_seat_no INTEGER,
    meta_json TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS seats (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    table_id TEXT NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
    seat_no INTEGER NOT NULL,
    person_id TEXT REFERENCES people(id) ON DELETE SET NULL,
    locked INTEGER NOT NULL DEFAULT 0,
    meta_json TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(table_id, seat_no)
);

-- 方案历史版本（完整 JSON 快照，不按 plans 表增加统计字段）
CREATE TABLE IF NOT EXISTS plan_versions (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    version_no INTEGER NOT NULL,
    version_name TEXT,
    note TEXT,
    snapshot_json TEXT NOT NULL,
    table_count INTEGER NOT NULL,
    people_count INTEGER NOT NULL,
    assigned_count INTEGER NOT NULL,
    unassigned_count INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    created_by TEXT,
    export_count INTEGER NOT NULL DEFAULT 0,
    UNIQUE(plan_id, version_no)
);

CREATE INDEX IF NOT EXISTS idx_plan_versions_plan_id ON plan_versions(plan_id);

CREATE TABLE IF NOT EXISTS ui_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS export_records (
    id TEXT PRIMARY KEY,
    plan_id TEXT REFERENCES plans(id) ON DELETE SET NULL,
    format TEXT NOT NULL,
    meta_json TEXT,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_logs (
    id TEXT PRIMARY KEY,
    plan_id TEXT REFERENCES plans(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    payload_json TEXT,
    created_at INTEGER NOT NULL
);

-- 全屏/总览布局快照（原 layout_db.rs 中 table_defs / people / seats）
CREATE TABLE IF NOT EXISTS round_layout_table_defs (
    id TEXT PRIMARY KEY,
    table_no INTEGER NOT NULL,
    hall_name TEXT NOT NULL,
    capacity INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS round_layout_people (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    assigned_table_id TEXT,
    assigned_seat_no INTEGER
);

CREATE TABLE IF NOT EXISTS round_layout_seats (
    table_id TEXT NOT NULL,
    seat_no INTEGER NOT NULL,
    person_id TEXT,
    PRIMARY KEY (table_id, seat_no)
);
