import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import ImageUploader from '../components/ImageUploader';
const MapDisplay = dynamic(() => import('../components/MapDisplay'), { ssr: false });

export default function ClaimPage() {
  const [category, setCategory] = useState('vehicle');
  const [policyId, setPolicyId] = useState('');
  const [comment, setComment] = useState('');
  const [location, setLocation] = useState(null);
  const [photos, setPhotos] = useState([]); // images + annotations

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

  async function handleSubmit(e) {
    e.preventDefault();
    if (!confirm(`You are about to submit ${photos.length} photo(s). Continue?`)) return;

    // prepare form data
    const fd = new FormData();
    fd.append('category', category);
    fd.append('policyId', policyId);
    fd.append('comment', comment);
    if (location) fd.append('lat', location[0]), fd.append('lng', location[1]);
    photos.forEach((p, i) => {
      // if still File object
      if (p.file) fd.append('photos', p.file, p.file.name || `photo-${i}.jpg`);
      // include per-image metadata (pins)
      fd.append(`meta[${i}]`, JSON.stringify({ pins: p.pins || [], type: p.type || 'unknown' }));
    });

    const res = await fetch('/api/claims', { method: 'POST', body: fd });
    if (res.ok) {
      const body = await res.json();
      alert('Claim submitted. Case ID: ' + body.caseId);
      // redirect to history or show QR
      window.location.href = '/claims/history';
    } else {
      alert('Failed to submit claim');
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
                  <MapDisplay position={location} locked />
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
          <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded">Upload & Submit</button>
          <div className="text-sm text-slate-500">Photos: <strong>{photos.length}</strong></div>
        </div>
      </form>
    </div>
  );
}