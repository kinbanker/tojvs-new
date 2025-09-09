// backend/migrations/001_add_email_column.js
async function up(db) {
    console.log('Adding email column to users table...');
    
    // 기존 테이블 구조 확인
    const tableInfo = await db.all("PRAGMA table_info(users)");
    const existingColumns = tableInfo.map(col => col.name);
    
    // SQLite에서 UNIQUE 컬럼 추가는 테이블 재생성이 필요
    if (!existingColumns.includes('email')) {
      console.log('Recreating users table with email column...');
      
      await db.run('BEGIN TRANSACTION');
      
      try {
        // 기존 데이터 백업
        await db.run(`
          CREATE TABLE users_backup AS 
          SELECT * FROM users
        `);
        
        // 기존 테이블 삭제
        await db.run('DROP TABLE users');
        
        // 새로운 구조로 테이블 재생성
        await db.run(`
          CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE,
            password TEXT NOT NULL,
            phone TEXT,
            refresh_token TEXT,
            marketing_consent BOOLEAN DEFAULT 0,
            is_active BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);
        
        // 데이터 복원 (새 컬럼들은 기본값으로)
        await db.run(`
          INSERT INTO users (id, username, password, phone)
          SELECT id, username, password, phone
          FROM users_backup
        `);
        
        // 기존 사용자들의 기본값 설정
        await db.run(`
          UPDATE users 
          SET is_active = 1, 
              marketing_consent = 0,
              created_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE is_active IS NULL OR created_at IS NULL
        `);
        
        // 백업 테이블 삭제
        await db.run('DROP TABLE users_backup');
        
        await db.run('COMMIT');
        console.log('Users table recreated with email column successfully');
        
      } catch (error) {
        await db.run('ROLLBACK');
        throw error;
      }
    } else {
      console.log('Email column already exists');
      
      // 다른 필요한 컬럼들만 추가 (UNIQUE 제약 없이)
      const columnsToAdd = [
        { name: 'refresh_token', sql: 'ALTER TABLE users ADD COLUMN refresh_token TEXT' },
        { name: 'marketing_consent', sql: 'ALTER TABLE users ADD COLUMN marketing_consent BOOLEAN DEFAULT 0' },
        { name: 'is_active', sql: 'ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT 1' },
        { name: 'created_at', sql: 'ALTER TABLE users ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP' },
        { name: 'updated_at', sql: 'ALTER TABLE users ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP' }
      ];
      
      for (const column of columnsToAdd) {
        if (!existingColumns.includes(column.name)) {
          console.log(`Adding column: ${column.name}`);
          await db.run(column.sql);
        }
      }
    }
    
    console.log('Email column migration completed');
  }
  
  async function down(db) {
    console.log('Removing email column and related columns...');
    
    await db.run('BEGIN TRANSACTION');
    
    try {
      // 기존 데이터 백업 (원래 컬럼들만)
      await db.run(`
        CREATE TABLE users_backup AS 
        SELECT id, username, password, phone 
        FROM users
      `);
      
      // 기존 테이블 삭제
      await db.run('DROP TABLE users');
      
      // 원래 구조로 테이블 재생성
      await db.run(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          phone TEXT
        )
      `);
      
      // 데이터 복원
      await db.run(`
        INSERT INTO users (id, username, password, phone)
        SELECT id, username, password, phone
        FROM users_backup
      `);
      
      // 백업 테이블 삭제
      await db.run('DROP TABLE users_backup');
      
      await db.run('COMMIT');
      console.log('Email column rollback completed');
      
    } catch (error) {
      await db.run('ROLLBACK');
      throw error;
    }
  }
  
  module.exports = { up, down };