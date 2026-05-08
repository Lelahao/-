# 桌面安装包图标

electron-builder 读取 **`icon.ico`**（Windows）。请将 256×256 或含多尺寸的 `.ico` 放在本目录，文件名为：

- `icon.ico` — 必填（正式打包前）；亦可从 Git 历史中恢复的 `archive/src-tauri/icons/` 拷贝（若曾提交过 PNG/ICO）。

未放置 `icon.ico` 时，`npm run dist:win` 可能使用默认 Electron 图标或报错，请以交付说明为准。
