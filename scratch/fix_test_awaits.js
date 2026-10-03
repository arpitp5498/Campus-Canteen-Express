const fs = require('fs');
const path = require('path');

function processDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      processDir(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.test.js')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let modified = false;

      // Replace `seedTestDb(` not preceded by `await `
      content = content.replace(/(?<!await\s+)seedTestDb\(/g, (m) => {
        modified = true;
        return 'await seedTestDb(';
      });

      // Replace `cleanTestDb(` not preceded by `await `
      content = content.replace(/(?<!await\s+)cleanTestDb\(/g, (m) => {
        modified = true;
        return 'await cleanTestDb(';
      });

      // Replace `resetTestDb(` not preceded by `await `
      content = content.replace(/(?<!await\s+)resetTestDb\(/g, (m) => {
        modified = true;
        return 'await resetTestDb(';
      });

      // Ensure beforeAll / beforeEach has async if it contains await
      content = content.replace(/beforeAll\(\s*\(\s*\)\s*=>\s*\{/g, (m) => {
        modified = true;
        return 'beforeAll(async () => {';
      });
      content = content.replace(/beforeEach\(\s*\(\s*\)\s*=>\s*\{/g, (m) => {
        modified = true;
        return 'beforeEach(async () => {';
      });

      if (modified) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`Updated: ${fullPath}`);
      }
    }
  }
}

processDir(path.join(__dirname, '..', 'tests'));
