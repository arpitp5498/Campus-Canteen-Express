const mysql = require('mysql2/promise');
require('dotenv').config();

const passwordsToTry = [
  process.env.DB_PASSWORD,
  process.env.MYSQL_PASSWORD,
  '',
  'campuscanteen',
  'password',
  'root',
  'Admin@123',
  'Admin@12345'
];

const usersToTry = [
  process.env.DB_USER || 'campuscanteen',
  'campuscanteen',
  'root'
];

async function tryConnect() {
  console.log('Testing MySQL connections on localhost:3306...');
  
  for (const user of [...new Set(usersToTry)]) {
    for (const pass of [...new Set(passwordsToTry)]) {
      const displayPass = pass ? '********' : '(empty)';
      try {
        const conn = await mysql.createConnection({
          host: process.env.DB_HOST || 'localhost',
          port: Number(process.env.DB_PORT) || 3306,
          user: user,
          password: pass || ''
        });
        console.log(`\n✔ SUCCESS! Connected to MySQL as user: '${user}' with password: ${displayPass}`);
        const [rows] = await conn.query('SELECT VERSION() as version, USER() as current_user');
        console.log('Server Info:', rows[0]);
        await conn.end();
        return { user, password: pass || '' };
      } catch (err) {
        // silent retry
      }
    }
  }
  
  console.log('❌ Could not connect with tested credentials.');
  return null;
}

tryConnect().then(res => {
  if (!res) process.exit(1);
  process.exit(0);
});
