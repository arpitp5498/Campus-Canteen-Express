const mysql = require('mysql2/promise');

async function setupMySQL() {
  console.log('Connecting to MySQL on localhost:3306 as root...');
  const conn = await mysql.createConnection({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '',
    multipleStatements: true
  });

  console.log('✔ Connected to MySQL successfully.');

  // Create database campus_canteen
  console.log('Creating database campus_canteen with utf8mb4...');
  await conn.query('CREATE DATABASE IF NOT EXISTS campus_canteen CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  console.log('✔ Database campus_canteen created.');

  // Create user campuscanteen and grant privileges
  console.log("Configuring user 'campuscanteen'@'localhost'...");
  await conn.query(`
    CREATE USER IF NOT EXISTS 'campuscanteen'@'localhost' IDENTIFIED BY 'campuscanteen';
    ALTER USER 'campuscanteen'@'localhost' IDENTIFIED BY 'campuscanteen';
    GRANT ALL PRIVILEGES ON campus_canteen.* TO 'campuscanteen'@'localhost';
    GRANT ALL PRIVILEGES ON *.* TO 'campuscanteen'@'localhost' WITH GRANT OPTION;
    CREATE USER IF NOT EXISTS 'campuscanteen'@'%' IDENTIFIED BY 'campuscanteen';
    ALTER USER 'campuscanteen'@'%' IDENTIFIED BY 'campuscanteen';
    GRANT ALL PRIVILEGES ON campus_canteen.* TO 'campuscanteen'@'%';
    GRANT ALL PRIVILEGES ON *.* TO 'campuscanteen'@'%' WITH GRANT OPTION;
    FLUSH PRIVILEGES;
  `);
  console.log("✔ User 'campuscanteen' configured with password 'campuscanteen' and granted all privileges.");

  await conn.end();

  // Test connecting as campuscanteen user
  console.log("Verifying connection as 'campuscanteen' user...");
  const userConn = await mysql.createConnection({
    host: 'localhost',
    port: 3306,
    user: 'campuscanteen',
    password: 'campuscanteen',
    database: 'campus_canteen'
  });
  const [rows] = await userConn.query('SELECT DATABASE() as db, USER() as user, VERSION() as version');
  console.log('✔ Verified connection:', rows[0]);
  await userConn.end();
}

setupMySQL().then(() => {
  console.log('MySQL Database & User Setup Complete!');
  process.exit(0);
}).catch(err => {
  console.error('❌ Setup failed:', err);
  process.exit(1);
});
