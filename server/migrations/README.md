# migrations

- `schema.sql`：由 `server.migrations.apply_schema` 加载，**仅** `CREATE TABLE IF NOT EXISTS`，可重复执行。
- 不再使用旧骨架里的独立 `settings` 表；UI 设置统一为 **`ui_settings`**（与 Rust `app_db` 一致）。
