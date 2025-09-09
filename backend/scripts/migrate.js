// backend/scripts/migrate.js
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const fs = require('fs').promises;
const path = require('path');

class MigrationRunner {
  constructor() {
    this.dbPath = path.join(__dirname, '../database.db');
    this.migrationsPath = path.join(__dirname, '../migrations');
  }

  async init() {
    this.db = await open({
      filename: this.dbPath,
      driver: sqlite3.Database
    });

    // 마이그레이션 테이블 생성
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT UNIQUE NOT NULL,
        executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  async getExecutedMigrations() {
    const rows = await this.db.all('SELECT filename FROM migrations ORDER BY id');
    return rows.map(row => row.filename);
  }

  async getMigrationFiles() {
    try {
      const files = await fs.readdir(this.migrationsPath);
      return files
        .filter(file => file.endsWith('.js'))
        .sort();
    } catch (error) {
      console.warn('Migrations directory not found, creating...');
      await fs.mkdir(this.migrationsPath, { recursive: true });
      return [];
    }
  }

  async runMigration(filename) {
    const migrationPath = path.join(this.migrationsPath, filename);
    const migration = require(migrationPath);
    
    console.log(`Running migration: ${filename}`);
    
    await this.db.run('BEGIN TRANSACTION');
    
    try {
      await migration.up(this.db);
      await this.db.run('INSERT INTO migrations (filename) VALUES (?)', filename);
      await this.db.run('COMMIT');
      console.log(`✅ Migration completed: ${filename}`);
    } catch (error) {
      await this.db.run('ROLLBACK');
      console.error(`❌ Migration failed: ${filename}`, error);
      throw error;
    }
  }

  async run() {
    await this.init();
    
    const executedMigrations = await this.getExecutedMigrations();
    const migrationFiles = await this.getMigrationFiles();
    
    const pendingMigrations = migrationFiles.filter(
      file => !executedMigrations.includes(file)
    );

    if (pendingMigrations.length === 0) {
      console.log('No pending migrations');
      return;
    }

    console.log(`Found ${pendingMigrations.length} pending migrations`);
    
    for (const migration of pendingMigrations) {
      await this.runMigration(migration);
    }
    
    await this.db.close();
    console.log('All migrations completed successfully!');
  }
}

// 스크립트 실행
if (require.main === module) {
  const runner = new MigrationRunner();
  runner.run().catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
}

module.exports = MigrationRunner;