const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, '../database/canteen.db');
const db = new Database(dbPath);

console.log('--- TABLES IN SQLITE ---');
const tables = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();

for (const t of tables) {
  const count = db.prepare(`SELECT COUNT(*) as c FROM ${t.name}`).get().c;
  console.log(`\nTable: ${t.name} (${count} rows)`);
  console.log('SQL:', t.sql);
  const cols = db.prepare(`PRAGMA table_info(${t.name})`).all();
  console.log('Columns:', cols.map(c => `${c.name} (${c.type}, notnull=${c.notnull}, dflt=${c.dflt_value}, pk=${c.pk})`));
  const fks = db.prepare(`PRAGMA foreign_key_list(${t.name})`).all();
  if (fks.length > 0) console.log('Foreign Keys:', fks);
}

const customIndexes = db.prepare("SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'").all();
console.log('\n--- CUSTOM INDEXES ---');
console.log(customIndexes);
