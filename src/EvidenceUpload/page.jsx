import React, { useState } from 'react';
import ImageUploader from '../components/ImageUploader';

export default function EvidenceUploadPage({ onNavigate, userAddress, claimId }) {
  const [targetClaimId, setTargetClaimId] = useState(claimId || '');
  const [photos, setPhotos] = useState([]);
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

    if (!photos.length) {
      setError('Upload at least one QR photo.');
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
      formData.append('comment', 'QR evidence uploaded by connected reporter');
      formData.append('lat', String(location.lat));
      formData.append('lng', String(location.lng));

      photos.forEach((photo, index) => {
        if (photo.file) {
          formData.append('photos', photo.file, photo.file.name || `evidence-${index}.jpg`);
          formData.append(`meta[${index}]`, JSON.stringify({ type: photo.type || 'qr', uploadedAt: new Date().toISOString() }));
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
      <p className="text-sm text-gray-500 mb-6">Upload a QR photo for an existing claim. Only the connected reporter wallet can submit evidence.</p>

      {!userAddress && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          You must login with MetaMask first.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Connected Reporter Address</label>
          <input
            value={userAddress || ''}
            readOnly
            placeholder="Connect wallet first"
            className="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Claim ID To Update</label>
          <input
            value={targetClaimId}
            onChange={(e) => setTargetClaimId(e.target.value)}
            placeholder="Paste claim ID"
            className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
          <label className="block text-sm font-semibold text-gray-700 mb-2">QR Photo</label>
          <ImageUploader value={photos} onChange={setPhotos} />
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