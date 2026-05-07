import React, { useState } from 'react';
import ImageUploader from '../components/ImageUploader';

export default function EvidenceUploadPage({ onNavigate, userAddress, claimId }) {
  const [targetClaimId, setTargetClaimId] = useState(claimId || '');
  const [claimLocked, setClaimLocked] = useState(Boolean(claimId));
  const [linkedEvidenceId, setLinkedEvidenceId] = useState('');
  const [comment, setComment] = useState('');
  const [claimQrFile, setClaimQrFile] = useState(null); // QR that decodes claim id only
  const [evidenceQrFile, setEvidenceQrFile] = useState(null); // QR that decodes evidence id (and optionally uploaded)
  const [photos, setPhotos] = useState([]); // merged main + extra photos
  const [location, setLocation] = useState(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const apiBase = import.meta.env.VITE_API_BASE || '';

  const captureLocation = () => {
    setError('');
    setStatus('Capturing location...');

    if (!navigator.geolocation) {
      setStatus('');
      setError('Geolocation is not supported by this browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        setLocation(nextLocation);
        setStatus(`Location saved: ${nextLocation.lat.toFixed(6)}, ${nextLocation.lng.toFixed(6)}`);
      },
      (err) => {
        setStatus('');
        setError(err.message || 'Unable to capture location.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (!userAddress) {
      setError('Please connect your wallet before adding evidence.');
      return;
    }

    if (!targetClaimId.trim()) {
      setError('Claim ID is required.');
      return;
    }

    if (!photos.length && !comment.trim()) {
      setError('Add a comment or upload at least one photo.');
      return;
    }

    if (!location) {
      setError('Capture location before submitting.');
      return;
    }

    setLoading(true);
    setStatus('Uploading evidence...');

    try {
      const formData = new FormData();
      formData.append('reporter', userAddress.trim());
      formData.append('comment', comment.trim());
      if (linkedEvidenceId.trim()) {
        formData.append('linkedEvidenceId', linkedEvidenceId.trim());
      }
      formData.append('lat', String(location.lat));
      formData.append('lng', String(location.lng));

      // append evidence QR file first if provided (we treat claim QR as decode-only)
      let fileIndex = 0;
      if (evidenceQrFile && evidenceQrFile.file) {
        formData.append('photos', evidenceQrFile.file, evidenceQrFile.file.name || `evidence-qr-${fileIndex}.jpg`);
        formData.append(`meta[${fileIndex}]`, JSON.stringify({ type: evidenceQrFile.type || 'qr', uploadedAt: new Date().toISOString() }));
        fileIndex++;
      }
      photos.forEach((photo) => {
        if (photo.file) {
          formData.append('photos', photo.file, photo.file.name || `evidence-${fileIndex}.jpg`);
          formData.append(`meta[${fileIndex}]`, JSON.stringify({ type: photo.type || 'photo', uploadedAt: new Date().toISOString() }));
          fileIndex++;
        }
      });

      const response = await fetch(`${apiBase}/api/claims/${encodeURIComponent(targetClaimId.trim())}/evidence`, {
        method: 'POST',
        body: formData,
        headers: {
          'x-user-address': userAddress.trim(),
        },
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const body = await response.json();
      setStatus(`Evidence accepted and linked to claim ${body.claimId}`);
      setPhotos([]);
      setComment('');
      setLinkedEvidenceId('');

      if (onNavigate) {
        onNavigate('evidence', { claimId: body.claimId || targetClaimId.trim() });
      }
    } catch (err) {
      console.error('Evidence upload error', err);
      setError(err.message || 'Failed to upload evidence.');
      setStatus('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto bg-white p-6 md:p-8 rounded-2xl shadow-lg">
      <h2 className="text-2xl font-bold text-gray-800 mb-2">Add Evidence</h2>
      <p className="text-sm text-gray-500 mb-6">Upload a decision note, a photo, or both for an existing claim. Only the assigned acceptor wallet can submit evidence.</p>

      {!userAddress && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          You must login with MetaMask first.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Connected Acceptor Address</label>
          <input
            value={userAddress || ''}
            readOnly
            placeholder="Connect wallet first"
            className="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Claim ID To Update</label>
          <div className="flex gap-2">
            <input
              value={targetClaimId}
              onChange={(e) => setTargetClaimId(e.target.value)}
              placeholder="Paste claim ID or use Get Info"
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              readOnly={claimLocked}
            />
            <button
              type="button"
              onClick={async () => {
                setError('');
                if (!claimQrFile || !claimQrFile.file) {
                  setError('Please upload the Claim QR image first');
                  return;
                }
                setStatus('Decoding Claim QR...');
                try {
                  const fd = new FormData();
                  fd.append('file', claimQrFile.file);
                  const resp = await fetch('https://api.qrserver.com/v1/read-qr-code/', { method: 'POST', body: fd });
                  const data = await resp.json();
                  const decoded = (data && data[0] && data[0].symbol && data[0].symbol[0] && data[0].symbol[0].data) || '';
                  if (!decoded) throw new Error('No QR data found');
                  // extract case id from decoded payload
                  const extracted = (function (value) {
                    const v = String(value || '').trim();
                    try {
                      const url = new URL(v, window.location.origin);
                      const fromQuery = url.searchParams.get('evidence') || url.searchParams.get('caseId');
                      if (fromQuery) return fromQuery;
                      const fromPath = url.pathname.split('/').filter(Boolean).pop();
                      if (fromPath && (/^C-/i.test(fromPath) || /^[0-9a-fA-F\-]{36}$/.test(fromPath))) return fromPath;
                    } catch (e) {}
                    const match = v.match(/(?:evidence=|caseId=|cases\/)(C-[A-Za-z0-9-]+|[0-9a-fA-F\-]{36})/i);
                    return match ? match[1] : v;
                  })(decoded);
                  setTargetClaimId(extracted);
                  setClaimLocked(true);
                  setStatus('Claim QR decoded');
                } catch (err) {
                  console.error('Claim QR decode failed', err);
                  setError(err.message || 'Failed to decode Claim QR');
                  setStatus('');
                }
              }}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white"
            >
              Get Info
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Claim QR Photo (Get Claim ID)</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = (e.target.files && e.target.files[0]) || null;
              if (f) setClaimQrFile({ file: f, preview: f ? URL.createObjectURL(f) : null, type: 'qr' });
              else setClaimQrFile(null);
            }}
            className="w-full rounded-lg"
          />
          <p className="mt-2 text-xs text-gray-500">Upload the Claim QR to extract the Claim ID only. This file is used for decoding and will not be uploaded as evidence.</p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Evidence QR Photo (Get Evidence ID)</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = (e.target.files && e.target.files[0]) || null;
              if (f) setEvidenceQrFile({ file: f, preview: f ? URL.createObjectURL(f) : null, type: 'qr' });
              else setEvidenceQrFile(null);
            }}
            className="w-full rounded-lg"
          />
          <div className="mt-2 flex gap-2">
            <input
              value={linkedEvidenceId}
              onChange={(e) => setLinkedEvidenceId(e.target.value)}
              placeholder="Optional old evidence ID (or use Get Info)"
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              readOnly={claimLocked}
            />
            <button
              type="button"
              onClick={async () => {
                setError('');
                if (!evidenceQrFile || !evidenceQrFile.file) {
                  setError('Please upload the Evidence QR image first');
                  return;
                }
                setStatus('Decoding Evidence QR...');
                try {
                  const fd = new FormData();
                  fd.append('file', evidenceQrFile.file);
                  const resp = await fetch('https://api.qrserver.com/v1/read-qr-code/', { method: 'POST', body: fd });
                  const data = await resp.json();
                  const decoded = (data && data[0] && data[0].symbol && data[0].symbol[0] && data[0].symbol[0].data) || '';
                  if (!decoded) throw new Error('No QR data found');
                  // extract evidence id
                  const extracted = (function (value) {
                    const v = String(value || '').trim();
                    try {
                      const url = new URL(v, window.location.origin);
                      const fromQuery = url.searchParams.get('evidence');
                      if (fromQuery) return fromQuery;
                      const fromPath = url.pathname.split('/').filter(Boolean).pop();
                      if (fromPath && (/^C-/i.test(fromPath) || /^[0-9a-fA-F\-]{36}$/.test(fromPath))) return fromPath;
                    } catch (e) {}
                    const match = v.match(/(?:evidence=|caseId=|cases\/)(C-[A-Za-z0-9-]+|[0-9a-fA-F\-]{36})/i);
                    return match ? match[1] : v;
                  })(decoded);
                  setLinkedEvidenceId(extracted);
                  setClaimLocked(true);
                  setStatus('Evidence QR decoded');
                } catch (err) {
                  console.error('Evidence QR decode failed', err);
                  setError(err.message || 'Failed to decode Evidence QR');
                  setStatus('');
                }
              }}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white"
            >
              Get Info
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-500">Use this to decode an existing Evidence QR. If left empty, a new evidence node will be created.</p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Photos (main + extra)</label>
          <ImageUploader value={photos} onChange={setPhotos} />
          <p className="mt-2 text-xs text-gray-500">Upload main and extra evidence photos here. The Evidence QR (if provided above) will be uploaded first.</p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Decision Comment</label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={4}
            placeholder="Write the decision, note missing items, or explain the review outcome"
            className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold text-blue-900">Location</h3>
              <p className="text-sm text-blue-800">Latitude and longitude will be saved with the evidence record.</p>
            </div>
            <button
              type="button"
              onClick={captureLocation}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Capture GPS
            </button>
          </div>

          {location && (
            <div className="mt-3 text-sm text-blue-900 font-medium">
              Lat: {location.lat.toFixed(6)} | Long: {location.lng.toFixed(6)}
            </div>
          )}
        </div>

        <div>
          <p className="mt-2 text-xs text-gray-500">Photos are optional if you only need to record a decision comment.</p>
        </div>

        {status && <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">{status}</div>}
        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Saving...' : 'Save Evidence'}
          </button>
          <button
            type="button"
            onClick={() => {
              setTargetClaimId(claimId || '');
              setLinkedEvidenceId('');
              setComment('');
              setPhotos([]);
              setLocation(null);
              setStatus('');
              setError('');
            }}
            className="rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"
          >
            Clear
          </button>
        </div>
      </form>
    </div>
  );
}