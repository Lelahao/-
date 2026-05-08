use rusqlite::{params, Connection, OptionalExtension};
use serde::Deserialize;
use serde_json::json;
use std::path::PathBuf;

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn db_path() -> Result<PathBuf, String> {
    let base = dirs::data_local_dir().ok_or_else(|| "missing data_local_dir".to_string())?;
    let dir = base.join("com.paizuo.assistant");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("paizuo_core.db"))
}

fn open_conn() -> Result<Connection, String> {
    let path = db_path()?;
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|e| e.to_string())?;
    Ok(conn)
}

fn init_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
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
    ",
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn bump_plan_updated(conn: &Connection, plan_id: &str) -> Result<i64, String> {
    let t = now_ms();
    conn.execute(
        "UPDATE plans SET updated_at = ?1 WHERE id = ?2",
        params![t, plan_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(t)
}

fn log_activity(
    conn: &Connection,
    plan_id: Option<&str>,
    action: &str,
    payload: &serde_json::Value,
) -> Result<(), String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_ms();
    let payload_str = serde_json::to_string(payload).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO activity_logs (id, plan_id, action, payload_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, plan_id, action, payload_str, now],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// --- Commands ---

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreatePlanReq {
    name: String,
    note: Option<String>,
}

#[tauri::command]
pub fn db_create_plan(payload: String) -> Result<String, String> {
    let req: CreatePlanReq = serde_json::from_str(&payload).map_err(|e| e.to_string())?;
    let conn = open_conn()?;
    init_schema(&conn)?;
    let id = uuid::Uuid::new_v4().to_string();
    let t = now_ms();
    conn.execute(
        "INSERT INTO plans (id, name, note, status, created_at, updated_at) VALUES (?1, ?2, ?3, 'draft', ?4, ?5)",
        params![id, req.name, req.note, t, t],
    )
    .map_err(|e| e.to_string())?;
    log_activity(&conn, Some(&id), "createPlan", &json!({ "planId": id }))?;
    serde_json::to_string(&json!({ "id": id, "updatedAt": t }))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_list_plans() -> Result<String, String> {
    let conn = open_conn()?;
    init_schema(&conn)?;
    let mut stmt = conn
        .prepare("SELECT id, name, note, status, created_at, updated_at FROM plans ORDER BY updated_at DESC")
        .map_err(|e| e.to_string())?;
    let rows: Vec<serde_json::Value> = stmt
        .query_map([], |row| {
            Ok(json!({
                "id": row.get::<_, String>(0)?,
                "name": row.get::<_, String>(1)?,
                "note": row.get::<_, Option<String>>(2)?,
                "status": row.get::<_, String>(3)?,
                "createdAt": row.get::<_, i64>(4)?,
                "updatedAt": row.get::<_, i64>(5)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e: rusqlite::Error| e.to_string())?;
    serde_json::to_string(&json!({ "plans": rows })).map_err(|e| e.to_string())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdatePlanReq {
    id: String,
    name: Option<String>,
    note: Option<String>,
    status: Option<String>,
}

#[tauri::command]
pub fn db_update_plan(payload: String) -> Result<String, String> {
    let req: UpdatePlanReq = serde_json::from_str(&payload).map_err(|e| e.to_string())?;
    let conn = open_conn()?;
    init_schema(&conn)?;
    let t = now_ms();
    if let Some(ref n) = req.name {
        conn.execute(
            "UPDATE plans SET name = ?1, updated_at = ?2 WHERE id = ?3",
            params![n, t, req.id],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(ref n) = req.note {
        conn.execute(
            "UPDATE plans SET note = ?1, updated_at = ?2 WHERE id = ?3",
            params![n, t, req.id],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(ref s) = req.status {
        conn.execute(
            "UPDATE plans SET status = ?1, updated_at = ?2 WHERE id = ?3",
            params![s, t, req.id],
        )
        .map_err(|e| e.to_string())?;
    }
    let updated = bump_plan_updated(&conn, &req.id)?;
    log_activity(
        &conn,
        Some(&req.id),
        "updatePlan",
        &json!({ "planId": req.id }),
    )?;
    serde_json::to_string(&json!({ "id": req.id, "updatedAt": updated })).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_delete_plan(plan_id: String) -> Result<String, String> {
    let conn = open_conn()?;
    init_schema(&conn)?;
    conn.execute("DELETE FROM plans WHERE id = ?1", params![plan_id])
        .map_err(|e| e.to_string())?;
    serde_json::to_string(&json!({ "ok": true })).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_get_plan_detail(plan_id: String) -> Result<String, String> {
    let conn = open_conn()?;
    init_schema(&conn)?;

    let plan = conn
        .query_row(
            "SELECT id, name, note, status, created_at, updated_at FROM plans WHERE id = ?1",
            params![plan_id],
            |row| {
                Ok(json!({
                    "id": row.get::<_, String>(0)?,
                    "name": row.get::<_, String>(1)?,
                    "note": row.get::<_, Option<String>>(2)?,
                    "status": row.get::<_, String>(3)?,
                    "createdAt": row.get::<_, i64>(4)?,
                    "updatedAt": row.get::<_, i64>(5)?,
                }))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "plan not found".to_string())?;

    let mut ps = conn
        .prepare("SELECT id, plan_id, display_name, assigned_table_id, assigned_seat_no, meta_json, created_at, updated_at FROM people WHERE plan_id = ?1 ORDER BY id")
        .map_err(|e| e.to_string())?;
    let people: Vec<serde_json::Value> = ps
        .query_map(params![plan_id], |row| {
            Ok(json!({
                "id": row.get::<_, String>(0)?,
                "planId": row.get::<_, String>(1)?,
                "displayName": row.get::<_, String>(2)?,
                "assignedTableId": row.get::<_, Option<String>>(3)?,
                "assignedSeatNo": row.get::<_, Option<i64>>(4)?,
                "metaJson": row.get::<_, Option<String>>(5)?,
                "createdAt": row.get::<_, i64>(6)?,
                "updatedAt": row.get::<_, i64>(7)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e: rusqlite::Error| e.to_string())?;

    let mut ts = conn
        .prepare("SELECT id, plan_id, table_no, hall_name, capacity, kind, meta_json, created_at, updated_at FROM tables WHERE plan_id = ?1 ORDER BY table_no")
        .map_err(|e| e.to_string())?;
    let tables: Vec<serde_json::Value> = ts
        .query_map(params![plan_id], |row| {
            Ok(json!({
                "id": row.get::<_, String>(0)?,
                "planId": row.get::<_, String>(1)?,
                "tableNo": row.get::<_, i64>(2)?,
                "hallName": row.get::<_, Option<String>>(3)?,
                "capacity": row.get::<_, i64>(4)?,
                "kind": row.get::<_, String>(5)?,
                "metaJson": row.get::<_, Option<String>>(6)?,
                "createdAt": row.get::<_, i64>(7)?,
                "updatedAt": row.get::<_, i64>(8)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e: rusqlite::Error| e.to_string())?;

    let mut ss = conn
        .prepare("SELECT id, plan_id, table_id, seat_no, person_id, locked, meta_json, created_at, updated_at FROM seats WHERE plan_id = ?1 ORDER BY table_id, seat_no")
        .map_err(|e| e.to_string())?;
    let seats: Vec<serde_json::Value> = ss
        .query_map(params![plan_id], |row| {
            Ok(json!({
                "id": row.get::<_, String>(0)?,
                "planId": row.get::<_, String>(1)?,
                "tableId": row.get::<_, String>(2)?,
                "seatNo": row.get::<_, i64>(3)?,
                "personId": row.get::<_, Option<String>>(4)?,
                "locked": row.get::<_, i64>(5)? == 1,
                "metaJson": row.get::<_, Option<String>>(6)?,
                "createdAt": row.get::<_, i64>(7)?,
                "updatedAt": row.get::<_, i64>(8)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e: rusqlite::Error| e.to_string())?;

    serde_json::to_string(&json!({
        "plan": plan,
        "people": people,
        "tables": tables,
        "seats": seats,
    }))
    .map_err(|e| e.to_string())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TableIn {
    id: Option<String>,
    table_no: i64,
    hall_name: Option<String>,
    capacity: i64,
    kind: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveTablesReq {
    plan_id: String,
    tables: Vec<TableIn>,
}

#[tauri::command]
pub fn db_save_tables(payload: String) -> Result<String, String> {
    let req: SaveTablesReq = serde_json::from_str(&payload).map_err(|e| e.to_string())?;
    let conn = open_conn()?;
    init_schema(&conn)?;

    let t = now_ms();
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let existing: Vec<String> = tx
        .prepare("SELECT id FROM tables WHERE plan_id = ?1")
        .map_err(|e| e.to_string())?
        .query_map(params![req.plan_id], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e: rusqlite::Error| e.to_string())?;

    let mut keep = std::collections::HashSet::<String>::new();

    for tbl in &req.tables {
        let id = tbl
            .id
            .clone()
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        keep.insert(id.clone());

        let kind = tbl.kind.clone().unwrap_or_else(|| "round".to_string());
        let exists: i64 = tx
            .query_row(
                "SELECT COUNT(1) FROM tables WHERE id = ?1",
                params![id],
                |r| r.get(0),
            )
            .unwrap_or(0);

        if exists > 0 {
            tx.execute(
                "UPDATE tables SET plan_id = ?1, table_no = ?2, hall_name = ?3, capacity = ?4, kind = ?5, updated_at = ?6 WHERE id = ?7",
                params![
                    req.plan_id,
                    tbl.table_no,
                    tbl.hall_name,
                    tbl.capacity,
                    kind,
                    t,
                    id
                ],
            )
            .map_err(|e| e.to_string())?;
        } else {
            let meta: Option<String> = None;
            tx.execute(
                "INSERT INTO tables (id, plan_id, table_no, hall_name, capacity, kind, meta_json, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    id,
                    req.plan_id,
                    tbl.table_no,
                    tbl.hall_name,
                    tbl.capacity,
                    kind,
                    meta,
                    t,
                    t
                ],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    for eid in &existing {
        if !keep.contains(eid) {
            tx.execute("DELETE FROM tables WHERE id = ?1", params![eid])
                .map_err(|e| e.to_string())?;
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    let plan_updated = bump_plan_updated(&conn, &req.plan_id)?;
    log_activity(
        &conn,
        Some(&req.plan_id),
        "saveTables",
        &json!({ "planId": req.plan_id }),
    )?;
    serde_json::to_string(&json!({ "planUpdatedAt": plan_updated })).map_err(|e| e.to_string())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SeatIn {
    id: Option<String>,
    table_id: String,
    seat_no: i64,
    person_id: Option<String>,
    locked: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveSeatsReq {
    plan_id: String,
    seats: Vec<SeatIn>,
}

#[tauri::command]
pub fn db_save_seats(payload: String) -> Result<String, String> {
    let req: SaveSeatsReq = serde_json::from_str(&payload).map_err(|e| e.to_string())?;
    let conn = open_conn()?;
    init_schema(&conn)?;
    let t = now_ms();

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for s in &req.seats {
        let id = s
            .id
            .clone()
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let locked = if s.locked.unwrap_or(false) { 1 } else { 0 };
        let exists: i64 = tx
            .query_row(
                "SELECT COUNT(1) FROM seats WHERE table_id = ?1 AND seat_no = ?2",
                params![s.table_id, s.seat_no],
                |r| r.get(0),
            )
            .unwrap_or(0);

        if exists > 0 {
            tx.execute(
                "UPDATE seats SET plan_id = ?1, person_id = ?2, locked = ?3, updated_at = ?4 WHERE table_id = ?5 AND seat_no = ?6",
                params![
                    req.plan_id,
                    s.person_id,
                    locked,
                    t,
                    s.table_id,
                    s.seat_no
                ],
            )
            .map_err(|e| e.to_string())?;
        } else {
            let meta: Option<String> = None;
            tx.execute(
                "INSERT INTO seats (id, plan_id, table_id, seat_no, person_id, locked, meta_json, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    id,
                    req.plan_id,
                    s.table_id,
                    s.seat_no,
                    s.person_id,
                    locked,
                    meta,
                    t,
                    t
                ],
            )
            .map_err(|e| e.to_string())?;
        }

        if let Some(ref pid) = s.person_id {
            tx.execute(
                "UPDATE people SET assigned_table_id = ?1, assigned_seat_no = ?2, updated_at = ?3 WHERE id = ?4 AND plan_id = ?5",
                params![s.table_id, s.seat_no, t, pid, req.plan_id],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    let plan_updated = bump_plan_updated(&conn, &req.plan_id)?;
    log_activity(
        &conn,
        Some(&req.plan_id),
        "saveSeats",
        &json!({ "planId": req.plan_id }),
    )?;
    serde_json::to_string(&json!({ "planUpdatedAt": plan_updated })).map_err(|e| e.to_string())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MoveSeatPersonReq {
    plan_id: String,
    person_id: String,
    target_table_id: String,
    target_seat_no: i64,
}

#[tauri::command]
pub fn db_move_seat_person(payload: String) -> Result<String, String> {
    let req: MoveSeatPersonReq = serde_json::from_str(&payload).map_err(|e| e.to_string())?;
    let conn = open_conn()?;
    init_schema(&conn)?;

    let t = now_ms();
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let _: String = tx
        .query_row(
            "SELECT id FROM people WHERE id = ?1 AND plan_id = ?2",
            params![req.person_id, req.plan_id],
            |row| row.get(0),
        )
        .map_err(|_| "person not found".to_string())?;

    let tgt_sid: String = tx
        .query_row(
            "SELECT id FROM seats WHERE plan_id = ?1 AND table_id = ?2 AND seat_no = ?3",
            params![req.plan_id, req.target_table_id, req.target_seat_no],
            |row| row.get(0),
        )
        .map_err(|_| "target seat not found".to_string())?;

    let src: Option<(String, String, i64)> = tx
        .query_row(
            "SELECT id, table_id, seat_no FROM seats WHERE plan_id = ?1 AND person_id = ?2 LIMIT 1",
            params![req.plan_id, req.person_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    if let Some((ref sid, ref stid, sn)) = src {
        if stid.as_str() == req.target_table_id.as_str() && sn == req.target_seat_no {
            let cur = tx
                .query_row(
                    "SELECT updated_at FROM plans WHERE id = ?1",
                    params![req.plan_id],
                    |row| row.get::<_, i64>(0),
                )
                .map_err(|e| e.to_string())?;
            tx.commit().map_err(|e| e.to_string())?;
            return serde_json::to_string(&json!({ "planUpdatedAt": cur })).map_err(|e| e.to_string());
        }
        tx.execute(
            "UPDATE seats SET person_id = NULL, updated_at = ?1 WHERE id = ?2",
            params![t, sid],
        )
        .map_err(|e| e.to_string())?;
    }

    let tgt_pid: Option<String> = tx
        .query_row(
            "SELECT person_id FROM seats WHERE id = ?1",
            params![tgt_sid],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    if let Some(ref other) = tgt_pid {
        if other != &req.person_id {
            tx.execute(
                "UPDATE people SET assigned_table_id = NULL, assigned_seat_no = NULL, updated_at = ?1 WHERE id = ?2",
                params![t, other],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    tx.execute(
        "UPDATE seats SET person_id = ?1, updated_at = ?2 WHERE id = ?3",
        params![req.person_id, t, tgt_sid],
    )
    .map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE people SET assigned_table_id = ?1, assigned_seat_no = ?2, updated_at = ?3 WHERE id = ?4",
        params![
            req.target_table_id,
            req.target_seat_no,
            t,
            req.person_id
        ],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    let plan_updated = bump_plan_updated(&conn, &req.plan_id)?;
    log_activity(
        &conn,
        Some(&req.plan_id),
        "moveSeatPerson",
        &json!({
            "personId": req.person_id,
            "targetTableId": req.target_table_id,
            "targetSeatNo": req.target_seat_no
        }),
    )?;
    serde_json::to_string(&json!({ "planUpdatedAt": plan_updated })).map_err(|e| e.to_string())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SeatRef {
    table_id: String,
    seat_no: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SwapSeatPersonsReq {
    plan_id: String,
    a: SeatRef,
    b: SeatRef,
}

#[tauri::command]
pub fn db_swap_seat_persons(payload: String) -> Result<String, String> {
    let req: SwapSeatPersonsReq = serde_json::from_str(&payload).map_err(|e| e.to_string())?;
    let conn = open_conn()?;
    init_schema(&conn)?;
    let t = now_ms();

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let id_a: String = tx
        .query_row(
            "SELECT id FROM seats WHERE plan_id = ?1 AND table_id = ?2 AND seat_no = ?3",
            params![req.plan_id, req.a.table_id, req.a.seat_no],
            |row| row.get(0),
        )
        .map_err(|_| "seat a not found".to_string())?;
    let id_b: String = tx
        .query_row(
            "SELECT id FROM seats WHERE plan_id = ?1 AND table_id = ?2 AND seat_no = ?3",
            params![req.plan_id, req.b.table_id, req.b.seat_no],
            |row| row.get(0),
        )
        .map_err(|_| "seat b not found".to_string())?;

    let pa: Option<String> = tx
        .query_row(
            "SELECT person_id FROM seats WHERE id = ?1",
            params![id_a],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let pb: Option<String> = tx
        .query_row(
            "SELECT person_id FROM seats WHERE id = ?1",
            params![id_b],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE seats SET person_id = ?1, updated_at = ?2 WHERE id = ?3",
        params![pb, t, id_a],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE seats SET person_id = ?1, updated_at = ?2 WHERE id = ?3",
        params![pa, t, id_b],
    )
    .map_err(|e| e.to_string())?;

    if let Some(ref p) = pa {
        tx.execute(
            "UPDATE people SET assigned_table_id = ?1, assigned_seat_no = ?2, updated_at = ?3 WHERE id = ?4",
            params![req.b.table_id, req.b.seat_no, t, p],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(ref p) = pb {
        tx.execute(
            "UPDATE people SET assigned_table_id = ?1, assigned_seat_no = ?2, updated_at = ?3 WHERE id = ?4",
            params![req.a.table_id, req.a.seat_no, t, p],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;

    let plan_updated = bump_plan_updated(&conn, &req.plan_id)?;
    log_activity(
        &conn,
        Some(&req.plan_id),
        "swapSeatPersons",
        &json!({ "a": req.a, "b": req.b }),
    )?;
    serde_json::to_string(&json!({ "planUpdatedAt": plan_updated })).map_err(|e| e.to_string())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveUiSettingReq {
    key: String,
    value: String,
}

#[tauri::command]
pub fn db_save_ui_setting(payload: String) -> Result<String, String> {
    let req: SaveUiSettingReq = serde_json::from_str(&payload).map_err(|e| e.to_string())?;
    let conn = open_conn()?;
    init_schema(&conn)?;
    let t = now_ms();
    conn.execute(
        "INSERT INTO ui_settings (key, value, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![req.key, req.value, t],
    )
    .map_err(|e| e.to_string())?;
    serde_json::to_string(&json!({ "key": req.key, "updatedAt": t })).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_get_ui_setting(key: String) -> Result<Option<String>, String> {
    let conn = open_conn()?;
    init_schema(&conn)?;
    let row = conn
        .query_row(
            "SELECT key, value, updated_at FROM ui_settings WHERE key = ?1",
            params![key],
            |row| {
                Ok(json!({
                    "key": row.get::<_, String>(0)?,
                    "value": row.get::<_, String>(1)?,
                    "updatedAt": row.get::<_, i64>(2)?,
                }))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;
    match row {
        Some(v) => serde_json::to_string(&v).map(Some).map_err(|e| e.to_string()),
        None => Ok(None),
    }
}
