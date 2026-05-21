const fs = require("fs");
const path = require("path");

const dbFile = path.join(process.cwd(), "bloomlink.db");
const backupDir = path.join(process.cwd(), "backups");

if (!fs.existsSync(dbFile)) {
  console.error("Database file not found: bloomlink.db");
  process.exit(1);
}

fs.mkdirSync(backupDir, { recursive: true });

const now = new Date();
const timestamp = [
  now.getFullYear(),
  String(now.getMonth() + 1).padStart(2, "0"),
  String(now.getDate()).padStart(2, "0")
].join("-") + "-" + [
  String(now.getHours()).padStart(2, "0"),
  String(now.getMinutes()).padStart(2, "0")
].join("");

const backupPath = path.join(backupDir, `bloomlink-${timestamp}.db`);

fs.copyFileSync(dbFile, backupPath);

console.log(`Database backup created: ${backupPath}`);
