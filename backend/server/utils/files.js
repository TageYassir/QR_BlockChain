const fs = require('fs');
const path = require('path');

function ensureStorage(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

module.exports = { ensureStorage };
