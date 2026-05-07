import React, { useEffect, useState } from 'react';

export default function EvidencePage({ claimId: initialClaimId }) {
  const [evidence, setEvidence] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function extractCaseId(input) {
    const value = String(input || '').trim();
    if (!value) return '';

    try {
      const url = new URL(value, window.location.origin);
      const fromQuery = url.searchParams.get('evidence') || url.searchParams.get('caseId');
      if (fromQuery) return fromQuery;
      const fromPath = url.pathname.split('/').filter(Boolean).pop();
      if (fromPath && (/^C-/i.test(fromPath) || /^[0-9a-fA-F\-]{36}$/.test(fromPath))) return fromPath;
    } catch (err) {
      // not a URL, continue to raw matching
    }

    const match = value.match(/(?:evidence=|caseId=|cases\/)?(C-[A-Za-z0-9-]+|[0-9a-fA-F\-]{36})/i);
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

  async function downloadQrImage() {
    if (!evidence) return;
    const src = evidence.qr || (evidence.qrData ? `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(evidence.qrData)}` : null);
    if (!src) return;
    try {
      const response = await fetch(src);
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = `claim-qr-${evidence.caseId || Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
    } catch (err) {
      console.error('QR download failed', err);
      setError('Failed to download QR image');
    }
  }

  return (
    <div className="w-full max-w-3xl bg-white p-6 md:p-8 rounded-2xl shadow-lg">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Evidence Viewer</h2>
      <div className="space-y-4">
        {loading && <div className="text-sm text-gray-500">Loading evidence...</div>}
        {error && <div className="text-sm text-red-600">{error}</div>}

        {evidence && (
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-mono text-sm text-gray-600">Case ID: {evidence.caseId}</div>
                <div className="mt-2 font-semibold">Policy ID: <span className="font-mono text-sm">{evidence.policyId || 'N/A'}</span></div>
                <div className="mt-2 font-semibold">Reporter: <span className="font-mono text-sm">{evidence.reporter}</span></div>
                <div className="mt-2 font-semibold">Acceptor Wallet: <span className="font-mono text-sm break-all">{evidence.acceptorAddress || 'N/A'}</span></div>
                <div className="mt-2">Category: {evidence.category}</div>
                <div className="mt-2">Status: <span className="capitalize font-semibold">{evidence.status || 'pending'}</span></div>
                <div className="mt-2 text-sm text-gray-700">{evidence.comment}</div>
                {evidence.evidenceHash && <div className="mt-2 text-xs text-gray-500 font-mono break-all">Evidence Hash: {evidence.evidenceHash}</div>}
                {evidence.qrData && <div className="mt-2 text-xs text-gray-500 break-all">QR Data: {evidence.qrData}</div>}
              </div>
              <div className="text-center">
                <img src={evidence.qr || (evidence.qrData ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(evidence.qrData)}` : '')} alt="Case QR" className="w-40 h-40 mx-auto object-contain border border-gray-300 bg-white p-2 rounded-lg shadow-sm" />
                <div className="mt-3">
                  <button onClick={downloadQrImage} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white">Download QR Image</button>
                </div>
              </div>
            </div>

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
                      {item.linkedEvidenceId && <div>Linked To: <span className="font-mono break-all">{item.linkedEvidenceId}</span></div>}
                      {item.comment && <div className="mt-1 text-gray-600">Comment: {item.comment}</div>}
                      {Array.isArray(item.photos) && item.photos.length > 0 && <div>Photos: {item.photos.length}</div>}
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
