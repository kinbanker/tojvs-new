// backend/migrations/003_create_audit_log.js
async function up(db) {
    console.log('Creating audit_log table...');
    
    await db.run(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        action TEXT NOT NULL,
        table_name TEXT NOT NULL,
        record_id INTEGER,
        old_values TEXT,
        new_values TEXT,
        ip_address TEXT,
        user_agent TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
      )
    `);
    
    // 인덱스 생성
    await db.run(`
      CREATE INDEX IF NOT EXISTS idx_audit_log_user_id 
      ON audit_log(user_id)
    `);
    
    await db.run(`
      CREATE INDEX IF NOT EXISTS idx_audit_log_created_at 
      ON audit_log(created_at DESC)
    `);
    
    await db.run(`
      CREATE INDEX IF NOT EXISTS idx_audit_log_action 
      ON audit_log(action, table_name)
    `);
    
    console.log('Audit log table created');
  }
  
  async function down(db) {
    console.log('Dropping audit_log table...');
    
    await db.run('DROP TABLE IF EXISTS audit_log');
    
    console.log('Audit log table dropped');
  }
  
  module.exports = { up, down };