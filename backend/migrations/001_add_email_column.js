// migrations/001_add_email_column.js
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');

async function up(db) {
  // 컬럼 추가 로직
  await db.run('ALTER TABLE users ADD COLUMN email TEXT UNIQUE');
  // 다른 필요한 컬럼들도 추가...
}

async function down(db) {
  // 롤백 로직
  await db.run('ALTER TABLE users DROP COLUMN email');
}

module.exports = { up, down };