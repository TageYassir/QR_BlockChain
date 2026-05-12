const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

async function main() {
  const artifactPath = path.resolve(__dirname, '../artifacts/backend/contracts/ClaimRegistry.sol/ClaimRegistry.json');
  if (!fs.existsSync(artifactPath)) {
    console.error('Artifact not found at', artifactPath);
    process.exit(1);
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  const abi = artifact.abi;
  const bytecode = artifact.bytecode;

  const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
  console.log('Deploying ClaimRegistry via provider http://127.0.0.1:8545');

  const accounts = await provider.send('eth_accounts', []);
  if (!accounts || accounts.length === 0) {
    console.error('No accounts available from provider');
    process.exit(1);
  }

  const from = accounts[0];

  // Ensure bytecode is prefixed with 0x
  const data = bytecode.startsWith('0x') ? bytecode : '0x' + bytecode;

  const txParams = {
    from,
    data,
    gas: '0x2fefd8' // 3141592
  };

  // Use eth_sendTransaction so Hardhat node signs with unlocked account
  const txHash = await provider.send('eth_sendTransaction', [txParams]);

  console.log('Transaction hash:', txHash);

  const receipt = await provider.waitForTransaction(txHash);
  if (!receipt || !receipt.contractAddress) {
    console.error('Deployment failed or no contractAddress in receipt', receipt);
    process.exit(1);
  }

  console.log('ClaimRegistry deployed to:', receipt.contractAddress);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});