const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'database.sqlite');
const BACKUPS_DIR = path.join(__dirname, 'backups');

// Make sure backups directory exists
if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

async function runBackup() {
  console.log('Starting SQLite online backup...');

  if (!fs.existsSync(DB_PATH)) {
    console.error(`Source database file not found at: ${DB_PATH}`);
    process.exit(1);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFileName = `backup-${timestamp}.sqlite`;
  const backupFilePath = path.join(BACKUPS_DIR, backupFileName);

  // Open the database connection
  const db = new sqlite3.Database(DB_PATH);

  // Execute VACUUM INTO to copy database safely without locking concurrent reads/writes
  db.run(`VACUUM INTO ?`, [backupFilePath], function (err) {
    if (err) {
      console.error('Database backup failed:', err);
      db.close();
      process.exit(1);
    } else {
      console.log(`Backup created successfully at: ${backupFilePath}`);
      db.close();
      pruneOldBackups();
    }
  });
}

function pruneOldBackups() {
  console.log('Pruning backups older than 7 days...');
  
  try {
    const files = fs.readdirSync(BACKUPS_DIR);
    const now = Date.now();
    const maxAgeMs = 7 * 24 * 60 * 60 * 1000; // 7 days

    let prunedCount = 0;
    for (const file of files) {
      if (file.startsWith('backup-') && file.endsWith('.sqlite')) {
        const filePath = path.join(BACKUPS_DIR, file);
        const stats = fs.statSync(filePath);
        const ageMs = now - stats.mtimeMs;

        if (ageMs > maxAgeMs) {
          fs.unlinkSync(filePath);
          console.log(`Deleted old backup file: ${file}`);
          prunedCount++;
        }
      }
    }
    console.log(`Pruning finished. ${prunedCount} old backup(s) deleted.`);
  } catch (err) {
    console.error('Failed to prune old backups:', err);
  }
}

// Run if called directly
if (require.main === module) {
  runBackup();
}

module.exports = runBackup;
