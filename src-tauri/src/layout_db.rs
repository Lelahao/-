use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersonDto {
    id: String,
    name: String,
    assigned_table_id: Option<String>,
    assigned_seat_no: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TableDto {
    id: String,
    no: i32,
    hall_name: String,
    capacity: i32,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LayoutDto {
    people: Vec<PersonDto>,
    tables: Vec<TableDto>,
}

fn db_path() -> Result<PathBuf, String> {
    let base = dirs::data_local_dir().ok_or_else(|| "missing data_local_dir".to_string())?;
    let dir = base.join("com.paizuo.assistant");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("paizuo_round.db"))
}

fn init_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS table_defs (
            id TEXT PRIMARY KEY,
            table_no INTEGER NOT NULL,
            hall_name TEXT NOT NULL,
            capacity INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS people (
            id TEXT PRIMARY KEY,
            display_name TEXT NOT NULL,
            assigned_table_id TEXT,
            assigned_seat_no INTEGER
        );
        CREATE TABLE IF NOT EXISTS seats (
            table_id TEXT NOT NULL,
            seat_no INTEGER NOT NULL,
            person_id TEXT,
            PRIMARY KEY (table_id, seat_no)
        );
    ",
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn save_round_layout(payload: String) -> Result<(), String> {
    let dto: LayoutDto = serde_json::from_str(&payload).map_err(|e| e.to_string())?;
    let path = db_path()?;
    let mut conn = Connection::open(path).map_err(|e| e.to_string())?;
    init_schema(&conn)?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM seats", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM people", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM table_defs", []).map_err(|e| e.to_string())?;

    for t in &dto.tables {
        tx.execute(
            "INSERT INTO table_defs (id, table_no, hall_name, capacity) VALUES (?1, ?2, ?3, ?4)",
            params![t.id, t.no, t.hall_name, t.capacity],
        )
        .map_err(|e| e.to_string())?;
    }

    for p in &dto.people {
        tx.execute(
            "INSERT INTO people (id, display_name, assigned_table_id, assigned_seat_no) VALUES (?1, ?2, ?3, ?4)",
            params![
                p.id,
                p.name,
                p.assigned_table_id,
                p.assigned_seat_no,
            ],
        )
        .map_err(|e| e.to_string())?;

        if let (Some(tid), Some(seat)) = (&p.assigned_table_id, p.assigned_seat_no) {
            tx.execute(
                "INSERT INTO seats (table_id, seat_no, person_id) VALUES (?1, ?2, ?3)",
                params![tid, seat, p.id],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn load_round_layout() -> Result<String, String> {
    let path = db_path()?;
    if !path.exists() {
        return Ok("{\"people\":[],\"tables\":[]}".to_string());
    }

    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    init_schema(&conn)?;

    let mut tables_stmt = conn
        .prepare("SELECT id, table_no, hall_name, capacity FROM table_defs ORDER BY table_no ASC")
        .map_err(|e| e.to_string())?;

    let tables: Vec<TableDto> = tables_stmt
        .query_map([], |row| {
            Ok(TableDto {
                id: row.get(0)?,
                no: row.get(1)?,
                hall_name: row.get(2)?,
                capacity: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, rusqlite::Error>>()
        .map_err(|e| e.to_string())?;

    let mut people_stmt = conn
        .prepare("SELECT id, display_name, assigned_table_id, assigned_seat_no FROM people ORDER BY id ASC")
        .map_err(|e| e.to_string())?;

    let people: Vec<PersonDto> = people_stmt
        .query_map([], |row| {
            Ok(PersonDto {
                id: row.get(0)?,
                name: row.get(1)?,
                assigned_table_id: row.get(2)?,
                assigned_seat_no: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, rusqlite::Error>>()
        .map_err(|e| e.to_string())?;

    let dto = LayoutDto { people, tables };
    serde_json::to_string(&dto).map_err(|e| e.to_string())
}
