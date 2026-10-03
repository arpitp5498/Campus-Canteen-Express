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

      // Replace `db.prepare(` not preceded by `await `
      content = content.replace(/(?<!await\s+)db\.prepare\(/g, (m) => {
        modified = true;
        return 'await db.prepare(';
      });

      // Ensure test functions are async if they contain await
      content = content.replace(/(test|it)\((['"][^'"]+['"]),\s*\(\)\s*=>\s*\{/g, (m, fn, name) => {
        modified = true;
        return `${fn}(${name}, async () => {`;
      });

      if (modified) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`Updated: ${fullPath}`);
      }
    }
  }
}

processDir(path.join(__dirname, '..', 'tests'));
