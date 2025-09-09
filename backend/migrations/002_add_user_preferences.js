// backend/migrations/002_add_user_preferences.js
async function up(db) {
    console.log('Creating user_preferences table...');
    
    await db.run(`
      CREATE TABLE IF NOT EXISTS user_preferences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        preference_key TEXT NOT NULL,
        preference_value TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        UNIQUE(user_id, preference_key)
      )
    `);
    
    // 인덱스 생성
    await db.run(`
      CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id 
      ON user_preferences(user_id)
    `);
    
    await db.run(`
      CREATE INDEX IF NOT EXISTS idx_user_preferences_key 
      ON user_preferences(user_id, preference_key)
    `);
    
    // 기본 설정값들 추가
    const defaultPreferences = [
      { key: 'theme', value: 'light' },
      { key: 'language', value: 'ko' },
      { key: 'notifications_enabled', value: 'true' },
      { key: 'voice_commands_enabled', value: 'true' },
      { key: 'auto_refresh_interval', value: '30' }
    ];
    
    // 모든 기존 사용자에게 기본 설정 추가
    const users = await db.all('SELECT id FROM users');
    
    for (const user of users) {
      for (const pref of defaultPreferences) {
        await db.run(`
          INSERT OR IGNORE INTO user_preferences (user_id, preference_key, preference_value)
          VALUES (?, ?, ?)
        `, [user.id, pref.key, pref.value]);
      }
    }
    
    console.log('User preferences table created and populated');
  }
  
  async function down(db) {
    console.log('Dropping user_preferences table...');
    
    await db.run('DROP TABLE IF EXISTS user_preferences');
    
    console.log('User preferences table dropped');
  }
  
  module.exports = { up, down };