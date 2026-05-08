mod layout_db;
mod app_db;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            layout_db::save_round_layout,
            layout_db::load_round_layout,
            app_db::db_create_plan,
            app_db::db_list_plans,
            app_db::db_update_plan,
            app_db::db_delete_plan,
            app_db::db_get_plan_detail,
            app_db::db_save_tables,
            app_db::db_save_seats,
            app_db::db_move_seat_person,
            app_db::db_swap_seat_persons,
            app_db::db_save_ui_setting,
            app_db::db_get_ui_setting,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
