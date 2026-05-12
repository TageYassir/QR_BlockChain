import React, { useState } from "react";
import { getContract, getAccounts, getChainIdHex, ensureHardhatNetworkInWallet } from "../eth/contract";

export default function TestClaimRegistry() {
  const [status, setStatus] = useState("");
  const [contractAddr, setContractAddr] = useState("");
  const [policyInfo, setPolicyInfo] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [privateKeyInput, setPrivateKeyInput] = useState('');

  async function handleConnect() {
    try {
      setStatus("Connecting...");
      const contract = await getContract({ wantWrite: true });
      setContractAddr(contract.target ?? contract.address);
      setStatus("Connected");
    } catch (err) {
      setStatus("Error: " + (err.message || err));
    }
  }

  async function switchToLocal() {
    try {
      const res = await ensureHardhatNetworkInWallet();
      setStatus(res.switched ? 'Switched to Hardhat' : res.added ? 'Added Hardhat network' : 'Network ensured');
      const cid = await getChainIdHex();
      setChainId(cid);
    } catch (err) {
      setStatus('Network add/switch failed: ' + (err.message || err));
    }
  }

  async function showAccounts() {
    try {
      const accs = await getAccounts();
      setAccounts(accs || []);
      setStatus('Got accounts');
    } catch (err) {
      setStatus('Error getting accounts: ' + (err.message || err));
    }
  }

  async function copyPrivateKey() {
    if (!privateKeyInput) return setStatus('Paste a private key first');
    try {
      await navigator.clipboard.writeText(privateKeyInput);
      setStatus('Private key copied to clipboard. Import into MetaMask > Import Account');
    } catch (err) {
      setStatus('Copy failed: ' + (err.message || err));
    }
  }

  async function handleGetPolicy() {
    try {
      setStatus("Querying policy 1...");
      const contract = await getContract({ wantWrite: false });
      const p = await contract.getPolicy(1);
      // p = [owner, issuedAt, metadataHash, active]
      setPolicyInfo({
        owner: p[0],
        issuedAt: new Date(Number(p[1]) * 1000).toString(),
        metadataHash: p[2],
        active: p[3].toString()
      });
      setStatus("Policy loaded");
    } catch (err) {
      setStatus("Error: " + (err.message || err));
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <h3>Test ClaimRegistry</h3>
      <div>Status: {status}</div>
      <div>ChainId: {chainId || 'unknown'}</div>
      <div>Accounts: {accounts.length ? accounts.join(', ') : 'none'}</div>
      <div>Contract: {contractAddr || "not connected"}</div>
      <div style={{ marginTop: 8 }}>
        <button
          onClick={switchToLocal}
          style={{ backgroundColor: '#4CAF50', color: 'white', marginRight: 8, padding: '8px 12px', border: 'none', borderRadius: 6 }}
        >
          Switch/Add Hardhat Local
        </button>
        <button
          onClick={showAccounts}
          style={{ backgroundColor: '#2196F3', color: 'white', marginRight: 8, padding: '8px 12px', border: 'none', borderRadius: 6 }}
        >
          Show Accounts
        </button>
        <button
          onClick={handleConnect}
          style={{ backgroundColor: '#FF9800', color: 'white', marginRight: 8, padding: '8px 12px', border: 'none', borderRadius: 6 }}
        >
          Connect & Get Contract
        </button>
        <button
          onClick={handleGetPolicy}
          style={{ backgroundColor: '#9C27B0', color: 'white', padding: '8px 12px', border: 'none', borderRadius: 6 }}
        >
          Get Policy #1
        </button>
      </div>

      <div style={{ marginTop: 12 }}>
        <h4>Import Hardhat Private Key</h4>
        <div style={{ marginBottom: 6 }}>
          <input
            placeholder="Paste private key here (0x...)"
            value={privateKeyInput}
            onChange={(e) => setPrivateKeyInput(e.target.value)}
            style={{ width: '60%' }}
          />
          <button onClick={copyPrivateKey} style={{ marginLeft: 8, backgroundColor: '#f44336', color: 'white', padding: '8px 12px', border: 'none', borderRadius: 6 }}>Copy to clipboard</button>
        </div>
        <div style={{ fontSize: 12, color: '#666' }}>
          Paste one of the private keys printed by your running `npx hardhat node` terminal, then click "Copy to clipboard" and import it in MetaMask: Account → Import Account.
        </div>
      </div>

      {policyInfo && (
        <div style={{ marginTop: 12 }}>
          <div>Owner: {policyInfo.owner}</div>
          <div>IssuedAt: {policyInfo.issuedAt}</div>
          <div>MetadataHash: {policyInfo.metadataHash}</div>
          <div>Active: {policyInfo.active}</div>
        </div>
      )}
    </div>
  );
}
