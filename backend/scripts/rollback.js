// backend/scripts/rollback.js
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const path = require('path');

class RollbackRunner {
  constructor() {
    this.dbPath = path.join(__dirname, '../database.db');
    this.migrationsPath = path.join(__dirname, '../migrations');
  }

  async init() {
    this.db = await open({
      filename: this.dbPath,
      driver: sqlite3.Database
    });
  }

  async getLastMigration() {
    const row = await this.db.get(
      'SELECT filename FROM migrations ORDER BY id DESC LIMIT 1'
    );
    return row ? row.filename : null;
  }

  async rollbackMigration(filename) {
    const migrationPath = path.join(this.migrationsPath, filename);
    const migration = require(migrationPath);
    
    if (!migration.down) {
      throw new Error(`Migration ${filename} does not have a down() method`);
    }
    
    console.log(`Rolling back migration: ${filename}`);
    
    await this.db.run('BEGIN TRANSACTION');
    
    try {
      await migration.down(this.db);
      await this.db.run('DELETE FROM migrations WHERE filename = ?', filename);
      await this.db.run('COMMIT');
      console.log(`✅ Rollback completed: ${filename}`);
    } catch (error) {
      await this.db.run('ROLLBACK');
      console.error(`❌ Rollback failed: ${filename}`, error);
      throw error;
    }
  }

  async run() {
    await this.init();
    
    const lastMigration = await this.getLastMigration();
    
    if (!lastMigration) {
      console.log('No migrations to rollback');
      return;
    }
    
    await this.rollbackMigration(lastMigration);
    await this.db.close();
    console.log('Rollback completed successfully!');
  }
}

// 스크립트 실행
if (require.main === module) {
  const runner = new RollbackRunner();
  runner.run().catch(error => {
    console.error('Rollback failed:', error);
    process.exit(1);
  });
}

module.exports = RollbackRunner;