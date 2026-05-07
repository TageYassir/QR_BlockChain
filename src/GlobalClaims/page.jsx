import React, { useState, useEffect } from 'react';

export default function GlobalClaimsPage({ onNavigate, userAddress }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [evidenceHistory, setEvidenceHistory] = useState([]);
  const [view, setView] = useState('ledger'); // ledger | evidence

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
        // also fetch claims to extract evidences for global evidence history
        try {
          const allRes = await fetch(`${API_BASE}/api/claims`);
          if (allRes.ok) {
            const allBody = await allRes.json();
            const allClaims = allBody.claims || [];
            const evList = [];
            allClaims.forEach((c) => {
              (c.evidences || []).forEach((e) => {
                evList.push({ ...e, claimId: c.caseId, policyId: c.policyId || '' });
              });
            });
            setEvidenceHistory(evList.reverse());
          }
        } catch (e) {
          console.warn('Failed to load evidence history', e);
        }
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
      <div className="mb-4 flex gap-2 items-center">
        {userAddress && (
          <button
            type="button"
            onClick={() => onNavigate && onNavigate('evidence-upload')}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Add Evidence
          </button>
        )}
        <div className="ml-auto flex gap-2">
          <button onClick={() => setView('ledger')} className={`px-3 py-1 rounded ${view==='ledger' ? 'bg-indigo-600 text-white' : 'bg-white border'}`}>Ledger</button>
          <button onClick={() => setView('evidence')} className={`px-3 py-1 rounded ${view==='evidence' ? 'bg-indigo-600 text-white' : 'bg-white border'}`}>Evidence History</button>
        </div>
      </div>

      {loading && <div className="text-sm text-gray-500 mb-4">Loading ledger...</div>}
      {error && <div className="text-sm text-red-600 mb-4">{error}</div>}
      
      {view === 'ledger' && (
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
      )}

      {view === 'evidence' && (
        <div className="space-y-4">
          {loading && <div className="text-sm text-gray-500">Loading evidence history...</div>}
          {error && <div className="text-sm text-red-600">{error}</div>}
          {!loading && evidenceHistory.length === 0 ? (
            <div className="text-sm text-gray-500">No evidence history found.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {evidenceHistory.map((e, idx) => (
                <div key={e.evidenceId || idx} className="bg-white border p-4 rounded-lg shadow-sm">
                  <div className="font-mono text-sm text-gray-600">Evidence ID: {e.evidenceId}</div>
                  <div className="mt-1 text-sm text-gray-700">Claim: {e.claimId}</div>
                  <div className="mt-2 text-sm text-gray-600">Submitted: {e.createdAt || ''}</div>
                  <div className="mt-3 flex items-center justify-between">
                    <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`${window.location.origin}/?evidence=${e.evidenceId}&claim=${e.claimId}`)}`} alt="evidence-qr" className="w-24 h-24" />
                    <button onClick={() => {
                      const src = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(`${window.location.origin}/?evidence=${e.evidenceId}&claim=${e.claimId}`)}`;
                      fetch(src).then(r => r.blob()).then(blob => {
                        const href = URL.createObjectURL(blob);
                        const a = document.createElement('a'); a.href = href; a.download = `evidence-${e.evidenceId}.png`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(href);
                      });
                    }} className="rounded bg-indigo-600 px-3 py-2 text-white">Download QR</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
