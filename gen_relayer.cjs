// gen_relayer.js (CommonJS)
const fs = require('fs');
const { Wallet } = require('ethers');

const wallet = Wallet.createRandom();
const priv = wallet.privateKey; // 0x...
const addr = wallet.address;

console.log('New relayer wallet created:');
console.log('Address:', addr);
console.log('Private Key:', priv);

// Append to .env
const line = `RELAYER_PRIVATE_KEY=${priv}\n`;
fs.appendFileSync('D:\\QR_BlockChain\\backend\\.env', line);
console.log('.env updated with RELAYER_PRIVATE_KEY');
