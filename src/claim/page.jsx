import { useState, useEffect, Suspense, lazy } from 'react';
import { ethers } from 'ethers';
import ImageUploader from '../components/ImageUploader';

const MapDisplay = lazy(() => import('../components/MapDisplay'));

export default function ClaimPage() {
  const [category, setCategory] = useState('vehicle');
  const [policyId, setPolicyId] = useState('');
  const [reporter, setReporter] = useState('');
  const [comment, setComment] = useState('');
  const [location, setLocation] = useState(null);
  const [photos, setPhotos] = useState([]); // images + annotations
  const [status, setStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // attempt to capture location once (user must allow)
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocation([pos.coords.latitude, pos.coords.longitude]),
        (err) => console.warn('Geolocation error', err),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  }, []);

  // Compute SHA256/Keccak256 hash of file content
  async function computeFileHash(file) {
    const ab = await file.arrayBuffer();
    return ethers.keccak256(new Uint8Array(ab));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!photos.length) {
      alert('Please upload at least one photo');
      return;
    }
    if (!confirm(`You are about to submit ${photos.length} photo(s). Continue?`)) return;

    setSubmitting(true);
    setStatus('Computing file hashes...');

    try {
      // Compute hashes for all files
      const clientHashes = [];
      for (const p of photos) {
        if (!p.file) continue;
        const hash = await computeFileHash(p.file);
        clientHashes.push({ filename: p.file.name, hash });
      }

      // Build evidence hash: concat(file_hashes) + metadata
      const concat = ethers.concat(clientHashes.map(c => c.hash));
      const metaObj = { policyId, reporter, location, category, comment };
      const metaBytes = ethers.toUtf8Bytes(JSON.stringify(metaObj));
      const evidenceHash = ethers.keccak256(ethers.concat([concat, metaBytes]));

      setStatus('Preparing upload...');

      // Prepare form data with files and metadata
      const fd = new FormData();
      fd.append('category', category);
      fd.append('policyId', policyId);
      fd.append('comment', comment);
      if (location) {
        fd.append('lat', location[0]);
        fd.append('lng', location[1]);
      }
      fd.append('reporter', reporter);
      fd.append('evidenceHash', evidenceHash);
      fd.append('metadata', JSON.stringify({
        clientHashes,
        policyId,
        reporter,
        evidenceHash,
        perImageMeta: photos.map(p => ({ pins: p.pins || [], type: p.type || 'unknown' }))
      }));

      photos.forEach((p, i) => {
        if (p.file) fd.append('photos', p.file, p.file.name || `photo-${i}.jpg`);
        fd.append(`meta[${i}]`, JSON.stringify({ pins: p.pins || [], type: p.type || 'unknown' }));
      });

      setStatus('Uploading to backend...');
      const res = await fetch('/api/claims', { method: 'POST', body: fd });
      
      if (res.ok) {
        const body = await res.json();
        setStatus(`Success! Case ID: ${body.caseId}`);
        alert('Claim submitted successfully. Case ID: ' + body.caseId);
        // redirect to history or show QR
        setTimeout(() => {
          window.location.href = '/claims/history';
        }, 1500);
      } else {
        const errorText = await res.text();
        setStatus('Upload failed: ' + errorText);
        alert('Failed to submit claim: ' + errorText);
      }
    } catch (err) {
      console.error(err);
      setStatus('Error: ' + err.message);
      alert('Error: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <h2 className="text-xl font-semibold mb-3">Submit Incident Report</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium">Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)}
                  className="mt-1 block w-full border rounded px-3 py-2">
            <option value="vehicle">Vehicle</option>
            <option value="product">Product</option>
            <option value="person">Person/ID</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium">Policy / Case ID (optional)</label>
          <input value={policyId} onChange={(e) => setPolicyId(e.target.value)}
                 className="mt-1 block w-full border rounded px-3 py-2" placeholder="Policy or reference id"/>
        </div>

        <div>
          <label className="block text-sm font-medium">Reporter Address (optional)</label>
          <input value={reporter} onChange={(e) => setReporter(e.target.value)}
                 className="mt-1 block w-full border rounded px-3 py-2" placeholder="Blockchain address or identifier"/>
        </div>

        <div>
          <label className="block text-sm font-medium">Photos (IDs, handwritten notes, scene)</label>
          <ImageUploader value={photos} onChange={setPhotos} />
          <p className="text-xs text-slate-500 mt-1">Upload multiple images. You can preview and add pins to each image.</p>
        </div>

        <div>
          <label className="block text-sm font-medium">Location</label>
          <div className="mt-2 border rounded p-2 bg-slate-50">
            {location ? (
              <div>
                <p className="text-sm text-slate-700 mb-2">Captured coordinates: {location[0].toFixed(6)}, {location[1].toFixed(6)}</p>
                <div className="h-48">
                  <Suspense fallback={<div className="text-center text-slate-500 py-8">Loading map...</div>}>
                    <MapDisplay position={location} locked />
                  </Suspense>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Location not available — ask user to enable location in their browser.</p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium">Comment (small note)</label>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3}
                    className="mt-1 block w-full border rounded px-3 py-2" placeholder="Add a short note..."/>
        </div>

        <div className="flex items-center justify-between">
          <button type="submit" disabled={submitting} className="px-4 py-2 bg-indigo-600 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed">
            {submitting ? 'Submitting...' : 'Upload & Submit'}
          </button>
          <div className="text-sm text-slate-500">Photos: <strong>{photos.length}</strong></div>
        </div>
      </form>
      
      {status && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
          <strong>Status:</strong> {status}
        </div>
      )}
    </div>
  );
}