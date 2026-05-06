const fs = require('fs');

function ensureStorage(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

module.exports = { ensureStorage };
