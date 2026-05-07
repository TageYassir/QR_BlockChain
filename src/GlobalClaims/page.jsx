import React, { useState, useEffect } from 'react';

export default function GlobalClaimsPage({ onNavigate, userAddress }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadLedger() {
      setLoading(true);
      setError('');
      try {
        const API_BASE = import.meta.env.VITE_API_BASE || '';
        const res = await fetch(`${API_BASE}/api/ledger`);
        if (!res.ok) {
          throw new Error(await res.text());
        }

        const body = await res.json();
        if (!body.ok) throw new Error(body.error || 'Failed to load ledger');

        const ledger = (body.ledger || []).map((row) => ({
          txHash: row.txHash || row.caseId,
          caseId: row.caseId,
          timestamp: row.timestamp ? new Date(row.timestamp).toLocaleString() : '',
        }));
        setTransactions(ledger);
      } catch (err) {
        console.error('Ledger load error', err);
        setError(err.message || 'Failed to load ledger');
      } finally {
        setLoading(false);
      }
    }

    loadLedger();
  }, []);

  return (
    <div className="w-full max-w-5xl mx-auto bg-white p-6 sm:p-8 rounded-2xl shadow-lg mt-4">
      <h2 className="text-2xl font-bold text-gray-800 mb-2">Global Claims Ledger</h2>
      <p className="text-gray-500 mb-4 text-sm">Public claim records stored in the backend ledger. Private content is not shown.</p>
      {userAddress && (
        <button
          type="button"
          onClick={() => onNavigate && onNavigate('evidence-upload')}
          className="mb-6 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Add Evidence
        </button>
      )}

      {loading && <div className="text-sm text-gray-500 mb-4">Loading ledger...</div>}
      {error && <div className="text-sm text-red-600 mb-4">{error}</div>}
      
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
            {!loading && transactions.length === 0 ? (
              <tr>
                <td colSpan={3} className="p-4 text-sm text-gray-500">No ledger entries found.</td>
              </tr>
            ) : transactions.map((tx, idx) => (
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
