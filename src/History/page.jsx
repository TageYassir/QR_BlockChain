import React, { useState, useEffect } from 'react';

export default function HistoryPage({ userAddress, onNavigate }) {
  const [claims, setClaims] = useState([]);
  const [evidences, setEvidences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState('claims'); // 'claims' or 'evidence'

  async function downloadQrImage(qrSrc, caseId) {
    try {
      const response = await fetch(qrSrc);
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = `claim-${caseId}-qr.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
    } catch (err) {
      console.error('QR download failed', err);
      setError('Failed to download QR image');
    }
  }
  useEffect(() => {
    async function load() {
      if (!userAddress || !String(userAddress).trim()) {
        setClaims([]);
        setEvidences([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:4000';
      try {
        const addr = String(userAddress || '').trim().toLowerCase();
        const res = await fetch(`${API_BASE}/api/claims`, {
          headers: { 'x-user-address': addr }
        });
        if (!res.ok) {
          throw new Error(await res.text());
        }

        const body = await res.json();
        const list = body.claims || [];
        const normalized = list.map((c) => ({
          id: c.caseId || c.id || '',
          category: c.category || (c.metadata && c.metadata.category) || 'unknown',
          policyId: c.policyId || (c.metadata && c.metadata.policyId) || 'N/A',
          status: c.status || 'pending',
          acceptorAddress: c.acceptorAddress || (c.metadata && c.metadata.acceptorAddress) || '',
          evidenceCount: Number(c.evidenceCount || (Array.isArray(c.evidences) ? c.evidences.length : 0)),
          date: c.createdAt ? new Date(c.createdAt).toISOString().slice(0, 10) : (c.date || ''),
          qr: c.qr || `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(c.caseId || c.id || '')}`,
          location: c.location || null,
          reporter: c.reporter || (c.metadata && c.metadata.reporter) || ''
        }));
        // additionally ensure client-side that only claims from the connected wallet are shown
        const filtered = normalized.filter((c) => String(c.reporter || '').toLowerCase() === addr);
        setClaims(filtered);
        // load evidences submitted by this wallet (scoped endpoint)
        try {
          const evRes = await fetch(`${API_BASE}/api/evidences`, {
            headers: { 'x-user-address': String(userAddress || '').trim().toLowerCase() }
          });
          if (evRes.ok) {
            const evBody = await evRes.json();
            setEvidences(evBody.evidences || []);
          }
        } catch (innerErr) {
          console.warn('Failed to load evidences for user', innerErr);
        }
      } catch (err) {
        console.error('History fetch error', err);
        setError(err.message || 'Failed to load claims');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [userAddress]);

  if (!userAddress) {
    return <div className="text-center text-red-500 mt-10">Please login to view your history.</div>;
  }

  return (
    <div className="w-full max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Your Submitted Claims</h2>
      <div className="mb-4 flex items-center justify-end">
        <div className="text-sm font-mono text-gray-700">Connected wallet: {userAddress}</div>
      </div>
      <div className="mb-4 flex gap-2">
        <button onClick={() => setView('claims')} className={`px-3 py-1 rounded ${view==='claims' ? 'bg-indigo-600 text-white' : 'bg-white border'}`}>Claims</button>
        <button onClick={() => setView('evidence')} className={`px-3 py-1 rounded ${view==='evidence' ? 'bg-indigo-600 text-white' : 'bg-white border'}`}>Evidence</button>
      </div>
      {view === 'evidence' && (
        <div className="bg-white p-4 rounded-lg shadow-sm mb-6">
          <h3 className="font-semibold mb-3">Evidence Submitted By You</h3>
          {evidences.length === 0 ? (
            <div className="text-sm text-gray-500">No evidence found submitted by your wallet.</div>
          ) : (
            <div className="space-y-3">
              {evidences.map((e) => (
                <div key={e.evidenceId} className="border p-3 rounded flex items-center justify-between">
                  <div>
                    <div className="font-mono text-sm">Evidence ID: {e.evidenceId}</div>
                    <div className="text-sm text-gray-600">Claim: {e.claimId}</div>
                    <div className="text-sm text-gray-700">{e.comment}</div>
                  </div>
                  <div>
                    <img src={e.qr || `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`${window.location.origin}/?evidence=${e.evidenceId}&claim=${e.claimId}`)}`} alt="evidence-qr" className="w-24 h-24" />
                    <div className="mt-2 text-right">
                      <button onClick={() => {
                        const src = e.qr || `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(`${window.location.origin}/?evidence=${e.evidenceId}&claim=${e.claimId}`)}`;
                        fetch(src).then(r => r.blob()).then(blob => {
                          const href = URL.createObjectURL(blob);
                          const a = document.createElement('a'); a.href = href; a.download = `evidence-${e.evidenceId}.png`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(href);
                        });
                      }} className="rounded bg-indigo-600 px-2 py-1 text-white text-sm">Download QR</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
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
              <div className="flex-grow min-w-0">
                <h3 className="font-bold text-lg text-indigo-700">Case ID: {claim.id}</h3>
                <p className="text-sm text-gray-600"><strong>Policy:</strong> {claim.policyId}</p>
                <p className="text-sm text-gray-600"><strong>Category:</strong> <span className="capitalize">{claim.category}</span></p>
                <p className="text-sm text-gray-600"><strong>Status:</strong> <span className="capitalize">{claim.status}</span></p>
                <p className="text-xs text-gray-500 break-all"><strong>Acceptor:</strong> {claim.acceptorAddress || 'N/A'}</p>
                <p className="text-xs text-gray-500">Evidence Linked: {claim.evidenceCount}</p>
                {claim.location && (
                  <p className="text-xs text-gray-500 mt-1">Lat: {claim.location.lat}, Long: {claim.location.lng}</p>
                )}
                <p className="text-xs text-gray-400 mt-2">Submitted on {claim.date}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => downloadQrImage(claim.qr, claim.id)}
                    className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                  >
                    Download QR
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
