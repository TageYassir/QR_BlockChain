const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const ARTIFACT = path.resolve(__dirname, '../artifacts/backend/contracts/ClaimRegistry.sol/ClaimRegistry.json');
const DEFAULT_PROVIDER = process.env.HARDHAT_URL || process.env.WEB3_PROVIDER || 'http://127.0.0.1:8545';
let CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || null;
const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY || null;

function loadArtifact() {
  if (!fs.existsSync(ARTIFACT)) throw new Error(`Artifact not found: ${ARTIFACT}`);
  return JSON.parse(fs.readFileSync(ARTIFACT, 'utf8'));
}

async function createContract() {
  const artifact = loadArtifact();
  const provider = new ethers.JsonRpcProvider(DEFAULT_PROVIDER);
  // determine signer: prefer relayer private key (recommended), then provider unlocked account, then no signer
  let signer = null;
  if (RELAYER_PRIVATE_KEY) {
    try {
      signer = new ethers.Wallet(RELAYER_PRIVATE_KEY, provider);
      console.log('contractClient: using RELAYER_PRIVATE_KEY signer', await signer.getAddress());
    } catch (e) {
      console.warn('contractClient: invalid RELAYER_PRIVATE_KEY', e && e.message ? e.message : e);
      signer = null;
    }
  }

  if (!signer) {
    try {
      const accounts = await provider.send('eth_accounts', []);
      if (accounts && accounts.length) {
        signer = provider.getSigner(accounts[0]);
        console.log('contractClient: using provider unlocked account', accounts[0]);
      }
    } catch (e) {
      // ignore
    }
  }

  if (!CONTRACT_ADDRESS) {
    // try to read deployments.json next to scripts
    try {
      const p = path.resolve(__dirname, '..', 'deployments.json');
      if (fs.existsSync(p)) {
        const d = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (d && d.ClaimRegistry) CONTRACT_ADDRESS = d.ClaimRegistry;
      }
    } catch (e) {
      // ignore
    }
  }

  if (!CONTRACT_ADDRESS) throw new Error('CONTRACT_ADDRESS not set in environment and deployments.json not found');
  const contract = new ethers.Contract(CONTRACT_ADDRESS, artifact.abi, signer || provider);
  return { contract, provider, signer };
}

async function submitClaimOnChain({ caseId, policyId, evidenceHash, ipfsCid = '', acceptor }) {
  const { contract, provider, signer } = await createContract();
  // convert evidenceHash (hex or bytes32) to bytes32
  let evidence;
  if (typeof evidenceHash === 'string' && evidenceHash.startsWith('0x') && evidenceHash.length === 66) {
    evidence = evidenceHash;
  } else {
    evidence = ethers.id(String(evidenceHash || ''));
  }

  // verify policy exists and active
  try {
    const policyHash = ethers.keccak256(ethers.toUtf8Bytes(String(policyId || '')));
    const p = await contract.policies(policyHash).catch(() => null);
    if (!p || !p.issuedAt || p.issuedAt == 0 || !p.active) {
      const msg = `Policy not found or inactive for policyId=${policyId} (policyHash=${policyHash})`;
      console.error('submitClaimOnChain validation failed:', msg);
      throw new Error(msg);
    }
  } catch (checkErr) {
    // bubble up
    throw checkErr;
  }

  try {
    const tx = await contract.submitClaim(caseId, policyId, evidence, ipfsCid, acceptor);
    const receipt = await tx.wait();
    return { txHash: receipt.transactionHash, receipt };
  } catch (err) {
    console.error('submitClaimOnChain error:', err && err.message ? err.message : err);
    throw err;
  }
}

async function policyInfo(policyId) {
  const { contract } = await createContract();
  const policyHash = ethers.keccak256(ethers.toUtf8Bytes(String(policyId || '')));
  const p = await contract.policies(policyHash);
  return { policyHash, owner: p.owner, issuedAt: p.issuedAt, metadataHash: p.metadataHash, active: p.active };
}

async function registerPolicyOnChain({ policyId, owner, metadataHash = ethers.ZeroHash }) {
  const { contract } = await createContract();
  try {
    const tx = await contract.registerPolicy(policyId, owner, metadataHash);
    const receipt = await tx.wait();
    return { txHash: receipt.transactionHash, receipt };
  } catch (err) {
    console.error('registerPolicyOnChain error:', err && err.message ? err.message : err);
    throw err;
  }
}

async function addEvidenceOnChain({ caseId, evidenceId, evidenceHash, ipfsCid = '', linkedEvidenceId = '' }) {
  const { contract, provider, signer } = await createContract();
  let evidence;
  if (typeof evidenceHash === 'string' && evidenceHash.startsWith('0x') && evidenceHash.length === 66) {
    evidence = evidenceHash;
  } else {
    evidence = ethers.id(String(evidenceHash || ''));
  }

  try {
    const tx = await contract.addEvidence(caseId, evidenceId, evidence, ipfsCid, linkedEvidenceId);
    const receipt = await tx.wait();
    return { txHash: receipt.transactionHash, receipt };
  } catch (err) {
    console.error('addEvidenceOnChain error:', err && err.message ? err.message : err);
    throw err;
  }
}

module.exports = { submitClaimOnChain, addEvidenceOnChain, createContract, policyInfo, registerPolicyOnChain };
