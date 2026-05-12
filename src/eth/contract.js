import { ethers } from "ethers";
import ClaimRegistryArtifact from "../abi/ClaimRegistry.json";

const RPC_URL = import.meta.env.VITE_RPC_URL || "http://127.0.0.1:8545";
const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;

export function getRpcProvider() {
  // Support ethers v6 (top-level JsonRpcProvider) and ethers v5 (ethers.providers.JsonRpcProvider)
  if (typeof ethers.JsonRpcProvider !== 'undefined') {
    return new ethers.JsonRpcProvider(RPC_URL);
  }
  if (ethers.providers && typeof ethers.providers.JsonRpcProvider !== 'undefined') {
    return new ethers.providers.JsonRpcProvider(RPC_URL);
  }
  // Fallback: if a BrowserProvider is available (e.g. MetaMask), use it for read-only calls
  if (typeof window !== 'undefined' && window.ethereum && typeof ethers.BrowserProvider !== 'undefined') {
    return new ethers.BrowserProvider(window.ethereum);
  }
  // Last resort: try getDefaultProvider if available
  if (typeof ethers.getDefaultProvider === 'function') {
    return ethers.getDefaultProvider(RPC_URL);
  }
  throw new Error('No JSON-RPC provider available (check ethers version)');
}

// Prefer MetaMask provider if available
export function getWeb3Provider() {
  if (typeof window !== "undefined" && window.ethereum) {
    // Support ethers v6 (BrowserProvider) and v5 (providers.Web3Provider)
    if (typeof ethers.BrowserProvider !== 'undefined') {
      return new ethers.BrowserProvider(window.ethereum);
    }
    if (ethers.providers && typeof ethers.providers.Web3Provider !== 'undefined') {
      return new ethers.providers.Web3Provider(window.ethereum, 'any'); // "any" avoids auto network switch errors
    }
    // Fallback: return null so callers can use window.ethereum directly
  }
  return null;
}

// Return the active signer (MetaMask) if available, otherwise null
export async function getSigner() {
  const web3 = getWeb3Provider();
  if (!web3) return null;
  // Use window.ethereum.request when possible for consistent behavior
  if (typeof window !== 'undefined' && window.ethereum && typeof window.ethereum.request === 'function') {
    await window.ethereum.request({ method: 'eth_requestAccounts' });
    return web3.getSigner();
  }
  // Otherwise try provider send
  if (typeof web3.send === 'function') {
    await web3.send('eth_requestAccounts', []);
    return web3.getSigner();
  }
  return null;
}

// Return contract instance using signer if wantWrite=true, otherwise a read-only contract via RPC
export async function getContract({ wantWrite = true } = {}) {
  if (!CONTRACT_ADDRESS) throw new Error("VITE_CONTRACT_ADDRESS not set");

  if (wantWrite) {
    const signer = await getSigner();
    if (signer) {
      return new ethers.Contract(CONTRACT_ADDRESS, ClaimRegistryArtifact.abi, signer);
    }
    // fallback to RPC read-only contract if no signer
  }
  const rpcProvider = getRpcProvider();
  return new ethers.Contract(CONTRACT_ADDRESS, ClaimRegistryArtifact.abi, rpcProvider);
}

// Helpers for UI / debugging
export async function getChainIdHex() {
  // Prefer window.ethereum.request for chain id
  if (typeof window !== 'undefined' && window.ethereum && typeof window.ethereum.request === 'function') {
    try {
      return await window.ethereum.request({ method: 'eth_chainId' });
    } catch (err) {
      // fallback to RPC
    }
  }
  const network = await getRpcProvider().getNetwork();
  return '0x' + network.chainId.toString(16);
}

export async function getAccounts() {
  // Prefer window.ethereum.request for accounts
  if (typeof window !== 'undefined' && window.ethereum && typeof window.ethereum.request === 'function') {
    try {
      return await window.ethereum.request({ method: 'eth_accounts' });
    } catch (err) {
      return [];
    }
  }
  // fallback: try provider
  const rpc = getRpcProvider();
  try {
    return await rpc.listAccounts();
  } catch (err) {
    return [];
  }
}

// Prompt MetaMask to switch/add the Hardhat local chain (chainId 31337 => 0x7A69)
export async function ensureHardhatNetworkInWallet() {
  if (!window.ethereum) throw new Error("MetaMask not available");
  const hardhatChainId = "0x7A69";
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hardhatChainId }]
    });
    return { switched: true };
  } catch (switchError) {
    // If the chain is not added, try to add it
    if (switchError.code === 4902 || switchError.message?.includes("Unrecognized chain ID")) {
      try {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: hardhatChainId,
            chainName: "Hardhat Local",
            rpcUrls: [RPC_URL],
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }
          }]
        });
        return { added: true };
      } catch (addError) {
        throw addError;
      }
    }
    throw switchError;
  }
}
