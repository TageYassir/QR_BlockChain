const { createWorker } = require('tesseract.js');

let worker = null;
async function getWorker() {
  if (!worker) {
    worker = createWorker();
    await worker.load();
    await worker.loadLanguage('eng');
    await worker.initialize('eng');
  }
  return worker;
}

async function recognize(buffer) {
  const w = await getWorker();
  const { data } = await w.recognize(buffer);
  return data;
}

module.exports = { getWorker, recognize };
