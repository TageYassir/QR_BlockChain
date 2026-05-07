import React, { useState, useEffect } from 'react';

export default function GlobalClaimsPage() {
  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    // Mock global transactions on blockchain. No private data is exposed.
    setTimeout(() => {
      setTransactions([
        { txHash: '0xabc123...456', caseId: 'C-001', timestamp: '2026-05-01 10:00 AM' },
        { txHash: '0xdef456...789', caseId: 'C-002', timestamp: '2026-05-05 02:30 PM' },
        { txHash: '0xghi789...012', caseId: 'C-003', timestamp: '2026-05-06 09:15 AM' },
      ]);
    }, 500);
  }, []);

  return (
    <div className="w-full max-w-5xl mx-auto bg-white p-6 sm:p-8 rounded-2xl shadow-lg mt-4">
      <h2 className="text-2xl font-bold text-gray-800 mb-2">Global Claims Ledger</h2>
      <p className="text-gray-500 mb-6 text-sm">Public blockchain transactions for claims verification. Private content is not shown.</p>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-100 text-gray-700 text-sm uppercase tracking-wider">
              <th className="p-4 border-b">Transaction Hash</th>
              <th className="p-4 border-b">Case ID (Linked to QR)</th>
              <th className="p-4 border-b">Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx, idx) => (
              <tr key={idx} className="hover:bg-gray-50 border-b last:border-0 transition-colors">
                <td className="p-4 text-indigo-600 font-mono text-sm">{tx.txHash}</td>
                <td className="p-4 font-semibold text-gray-700">{tx.caseId}</td>
                <td className="p-4 text-sm text-gray-500">{tx.timestamp}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
