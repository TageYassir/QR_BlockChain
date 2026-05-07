import React, { useState, useEffect } from 'react';

export default function HistoryPage({ userAddress }) {
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Mock fetch for history claims. In reality, query Neo4j or smart contract by userAddress.
    setTimeout(() => {
      setClaims([
        { id: 'C-001', category: 'vehicle', policyId: 'POL-123', date: '2026-05-01', qr: 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=C-001' },
        { id: 'C-002', category: 'person', policyId: 'POL-456', date: '2026-05-05', qr: 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=C-002' },
      ]);
      setLoading(false);
    }, 800);
  }, [userAddress]);

  if (!userAddress) {
    return <div className="text-center text-red-500 mt-10">Please login to view your history.</div>;
  }

  return (
    <div className="w-full max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Your Submitted Claims</h2>
      {loading ? (
        <div className="text-center text-gray-500">Loading your history...</div>
      ) : claims.length === 0 ? (
        <div className="text-center text-gray-500 bg-white p-8 rounded-xl shadow-sm">No claims found. Start a new claim!</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {claims.map((claim) => (
            <div key={claim.id} className="bg-white p-5 rounded-2xl shadow-md border border-gray-100 flex items-center space-x-4">
              <div className="flex-shrink-0">
                <img src={claim.qr} alt={`QR for ${claim.id}`} className="w-24 h-24 rounded shadow-sm border border-gray-200" />
              </div>
              <div className="flex-grow">
                <h3 className="font-bold text-lg text-indigo-700">Case ID: {claim.id}</h3>
                <p className="text-sm text-gray-600"><strong>Policy:</strong> {claim.policyId}</p>
                <p className="text-sm text-gray-600"><strong>Category:</strong> <span className="capitalize">{claim.category}</span></p>
                <p className="text-xs text-gray-400 mt-2">Submitted on {claim.date}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
