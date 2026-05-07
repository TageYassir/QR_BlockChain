import React, { useState, useEffect } from 'react';

export default function EvidencePage({ claimId: initialClaimId }) {
  const [searchInput, setSearchInput] = useState(initialClaimId || '');
  const [evidence, setEvidence] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function extractCaseId(input) {
    const value = String(input || '').trim();
    if (!value) return '';

    try {
      const url = new URL(value, window.location.origin);
      const fromQuery = url.searchParams.get('evidence');
      if (fromQuery) return fromQuery;
      const fromPath = url.pathname.split('/').filter(Boolean).pop();
      if (fromPath && /^C-/i.test(fromPath)) return fromPath;
    } catch (error) {
      // fall through to raw value
    }

    const match = value.match(/(?:evidence=|caseId=|cases\/)(C-[A-Za-z0-9-]+)/i);
    return match ? match[1] : value;
  }

  useEffect(() => {
    if (initialClaimId) fetchEvidence(initialClaimId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialClaimId]);

  async function fetchEvidence(id) {
    const caseId = extractCaseId(id);
    if (!caseId) return;
    setLoading(true);
    setError('');
    setEvidence(null);
    try {
      const API_BASE = import.meta.env.VITE_API_BASE || '';
      const res = await fetch(`${API_BASE}/api/claims/${encodeURIComponent(caseId)}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch: ${res.statusText}`);
      }
      const body = await res.json();
      if (!body.ok) throw new Error(body.error || 'Invalid response');
      const claim = body.claim || body;
      setEvidence(claim);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to fetch evidence');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-3xl bg-white p-6 md:p-8 rounded-2xl shadow-lg">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Evidence Viewer</h2>

      <div className="space-y-4">
        <div className="flex gap-2">
          <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Enter Case ID or scan QR"
            className="flex-1 border border-gray-300 rounded-lg px-4 py-2" />
          <button onClick={() => fetchEvidence(searchInput)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg">Search</button>
        </div>

        {loading && <div className="text-sm text-gray-500">Loading evidence...</div>}
        {error && <div className="text-sm text-red-600">{error}</div>}

        {evidence && (
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="font-mono text-sm text-gray-600">Case ID: {evidence.caseId}</div>
            <div className="mt-2 font-semibold">Policy ID: <span className="font-mono text-sm">{evidence.policyId || 'N/A'}</span></div>
            <div className="mt-2 font-semibold">Reporter: <span className="font-mono text-sm">{evidence.reporter}</span></div>
            <div className="mt-2">Category: {evidence.category}</div>
            <div className="mt-2">Status: <span className="capitalize font-semibold">{evidence.status || 'pending'}</span></div>
            <div className="mt-2 text-sm text-gray-700">{evidence.comment}</div>
            {evidence.evidenceHash && <div className="mt-2 text-xs text-gray-500 font-mono break-all">Evidence Hash: {evidence.evidenceHash}</div>}
            {evidence.qrData && <div className="mt-2 text-xs text-gray-500 break-all">QR Data: {evidence.qrData}</div>}
            {Array.isArray(evidence.photos) && evidence.photos.length > 0 && (
              <div className="mt-4">
                <div className="text-sm font-semibold text-gray-700 mb-2">Stored Photos</div>
                <ul className="space-y-1 text-sm text-gray-600">
                  {evidence.photos.map((photo, index) => (
                    <li key={`${photo}-${index}`} className="break-all">{typeof photo === 'string' ? photo : photo.url || photo.filename || JSON.stringify(photo)}</li>
                  ))}
                </ul>
              </div>
            )}
            {Array.isArray(evidence.evidences) && evidence.evidences.length > 0 && (
              <div className="mt-4 border-t pt-4">
                <div className="text-sm font-semibold text-gray-700 mb-2">Linked Evidence Records</div>
                <ul className="space-y-2 text-sm text-gray-700">
                  {evidence.evidences.map((item, index) => (
                    <li key={`${item.evidenceId || 'e'}-${index}`} className="rounded bg-gray-50 p-2">
                      <div>ID: {item.evidenceId || `E-${index + 1}`}</div>
                      <div>Status: <span className="capitalize">{item.status || 'accepted'}</span></div>
                      {item.createdAt && <div>Submitted: {new Date(item.createdAt).toLocaleString()}</div>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
