import React, { useState } from 'react';
import { ethers } from 'ethers';

export default function LoginPage({ onNavigate, onLogin }) {
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function connectMetaMask(e) {
    e && e.preventDefault();
    setError('');
    if (!window.ethereum) {
      setError('MetaMask not detected. Please install MetaMask and try again.');
      return;
    }

    try {
      setLoading(true);
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const acct = accounts && accounts[0];
      if (!acct) throw new Error('No accounts returned');
      setAddress(acct);
      onLogin(acct);
      onNavigate('welcome');
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to connect to MetaMask');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-lg mx-auto mt-10">
      <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">Connect with MetaMask</h2>

      {error && <div className="mb-4 text-sm text-red-600">{error}</div>}

      <form onSubmit={connectMetaMask} className="space-y-5">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Wallet Address</label>
          <input
            type="text"
            value={address}
            readOnly
            placeholder="Not connected"
            className="w-full border border-gray-300 rounded-lg px-4 py-2 bg-gray-50"
          />
        </div>

        <button
          onClick={connectMetaMask}
          disabled={loading}
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-md transition-colors disabled:opacity-50"
        >
          {loading ? 'Connecting...' : 'Connect MetaMask'}
        </button>
      </form>
    </div>
  );
}
