import React, { useState } from 'react';

export default function LoginPage({ onNavigate, onLogin }) {
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    if (!address || !password) {
      alert("Please enter both Blockchain Address and Password.");
      return;
    }
    // In a real dApp, you might use MetaMask or verify a signature.
    onLogin(address);
    onNavigate('welcome');
  };

  return (
    <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-lg mx-auto mt-10">
      <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">Login with Blockchain</h2>
      <form onSubmit={handleLogin} className="space-y-5">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Blockchain Address (0x...)</label>
          <input 
            type="text" 
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition" 
            placeholder="0x1234...abcd" 
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Password</label>
          <input 
            type="password" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition" 
            placeholder="••••••••" 
          />
        </div>
        <button 
          type="submit" 
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-md transition-colors"
        >
          Connect & Login
        </button>
      </form>
    </div>
  );
}
