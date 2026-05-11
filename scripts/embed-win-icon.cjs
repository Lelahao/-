"use strict";

// electron-builder afterPack hook: 把 build/icons/icon.ico 嵌入 Windows 解包后的主 exe。
// 直接 spawn node_modules/rcedit/bin/rcedit-x64.exe 写 PE 资源，绕过 electron-builder 默认
// signAndEditExecutable 路径（后者在本机会触发 winCodeSign 解压失败：darwin 符号链接 →
// 非管理员/未启用 Developer Mode），同时避开 rcedit npm 包 5.x 的 ESM-only export。

const path = require("node:path");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") return;

  const productFilename = context.packager.appInfo.productFilename;
  const exePath = path.join(context.appOutDir, `${productFilename}.exe`);
  const projectDir = context.packager.info.projectDir;
  const iconPath = path.join(projectDir, "build", "icons", "icon.ico");
  const rceditExe = path.join(
    projectDir,
    "node_modules",
    "rcedit",
    "bin",
    "rcedit-x64.exe",
  );

  if (!fs.existsSync(exePath)) {
    console.warn(`[embed-win-icon] exe not found, skipping: ${exePath}`);
    return;
  }
  if (!fs.existsSync(iconPath)) {
    console.warn(`[embed-win-icon] icon not found, skipping: ${iconPath}`);
    return;
  }
  if (!fs.existsSync(rceditExe)) {
    console.warn(`[embed-win-icon] rcedit binary missing, skipping: ${rceditExe}`);
    return;
  }

  const copyright = context.packager.appInfo.copyright || "";
  const version = context.packager.appInfo.version || "";
  const fileVersion = /^\d+(\.\d+){0,3}$/.test(version) ? version : "";

  const args = [
    exePath,
    "--set-icon", iconPath,
    "--set-version-string", "ProductName", productFilename,
    "--set-version-string", "FileDescription", productFilename,
    "--set-version-string", "CompanyName", "paizuo",
    "--set-version-string", "LegalCopyright", copyright,
  ];
  if (fileVersion) {
    args.push("--set-file-version", fileVersion);
    args.push("--set-product-version", fileVersion);
  }

  console.log(`[embed-win-icon] patching: ${exePath}  <-  ${iconPath}`);
  execFileSync(rceditExe, args, { stdio: "inherit" });
  console.log("[embed-win-icon] done");
};
