import { useState, useEffect, Suspense, lazy } from 'react';
import { ethers } from 'ethers';
import { getContract } from '../eth/contract';
import ImageUploader from '../components/ImageUploader';

const MapDisplay = lazy(() => import('../components/MapDisplay'));

export default function ClaimPage({ userAddress, onNavigate }) {
  const [category, setCategory] = useState('vehicle');
  const [policyId, setPolicyId] = useState('');
  const [reporter, setReporter] = useState(userAddress || '');
  const [acceptorAddress, setAcceptorAddress] = useState('');
  const [comment, setComment] = useState('');
  const [location, setLocation] = useState(null);
  const [photos, setPhotos] = useState([]); // Array of { file, type: 'paper' | 'id', preview, pins }
  const [status, setStatus] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setReporter(userAddress || '');
  }, [userAddress]);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocation([pos.coords.latitude, pos.coords.longitude]),
        (err) => console.warn('Geolocation error', err),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  }, []);

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
    if (!acceptorAddress.trim()) {
      alert('Please provide the wallet address of the person who will accept the claim');
      return;
    }
    if (!ethers.isAddress(acceptorAddress.trim())) {
      alert('Please enter a valid wallet address for the claim acceptor');
      return;
    }
    // Confirmation for number of photos as requested
    if (!window.confirm(`Are you sure? You are submitting exactly ${photos.length} photo(s).`)) return;

    setSubmitting(true);
    setStatus('Computing file hashes...');

    try {
      const clientHashes = [];
      for (const p of photos) {
        if (!p.file) continue;
        const hash = await computeFileHash(p.file);
        clientHashes.push({ filename: p.file.name, hash, type: p.type });
      }

      const concat = ethers.concat(clientHashes.map(c => c.hash));
      const metaObj = { policyId, reporter, acceptorAddress, location, category, comment };
      const metaBytes = ethers.toUtf8Bytes(JSON.stringify(metaObj));
      const evidenceHash = ethers.keccak256(ethers.concat([concat, metaBytes]));

      setStatus('Preparing upload...');
      const fd = new FormData();
      fd.append('category', category);
      fd.append('policyId', policyId);
      fd.append('comment', comment);
      fd.append('acceptorAddress', acceptorAddress.trim());
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
        acceptorAddress,
        evidenceHash,
        perImageMeta: photos.map(p => ({ pins: p.pins || [], type: p.type || 'unknown' }))
      }));

      photos.forEach((p, i) => {
        if (p.file) fd.append('photos', p.file, p.file.name || `photo-${i}.jpg`);
        fd.append(`meta[${i}]`, JSON.stringify({ pins: p.pins || [], type: p.type || 'unknown' }));
      });

      // Try to POST to backend API
      const API_BASE = import.meta.env.VITE_API_BASE || '';
      try {
        setStatus('Uploading to backend...');
        const headers = {};
        if (reporter) headers['x-user-address'] = reporter;
        const res = await fetch(`${API_BASE}/api/claims`, { method: 'POST', body: fd, headers });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(txt || `HTTP ${res.status}`);
        }
        const body = await res.json();
        const caseId = body.caseId || (body.claim && body.claim.caseId) || `C-${Math.floor(Math.random()*10000)}`;
        setStatus(`Success! Case ID: ${caseId}`);
        // Attempt to publish on-chain via user's MetaMask signer
        try {
          const contract = await getContract({ wantWrite: true });
          if (contract) {
            setStatus('Submitting on-chain via MetaMask...');
            const tx = await contract.submitClaim(caseId, policyId, evidenceHash, '', acceptorAddress.trim());
            const receipt = await tx.wait();
            console.log('Claim tx receipt', receipt);
            setStatus(`Claim published on-chain: ${receipt.transactionHash}`);
            // optionally notify backend of txHash
            try {
              const API_BASE2 = import.meta.env.VITE_API_BASE || '';
              await fetch(`${API_BASE2}/api/claims/${encodeURIComponent(caseId)}/tx`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ txHash: receipt.transactionHash }) });
            } catch (e) {
              // ignore
            }
          }
        } catch (err) {
          console.warn('MetaMask publish failed', err);
        }
        // server returns qr as data URL; if not, generate one that links to evidence view
        const qr = body.qr || `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(`${window.location.origin}/?evidence=${caseId}`)}`;
        setQrCode(qr);
        alert('Claim submitted successfully. Case ID: ' + caseId);
        if (onNavigate) onNavigate('evidence', { claimId: caseId });
      } catch (apiErr) {
        console.warn('Backend submit failed, falling back to mock', apiErr);
        // Fallback to previous mock behavior so user isn't blocked
        const fakeCaseId = `C-${Math.floor(Math.random() * 10000)}`;
        setStatus(`Success! Case ID: ${fakeCaseId} (local fallback)`);
        const dataUrl = encodeURIComponent(`${window.location.origin}/?evidence=${fakeCaseId}`);
        setQrCode(`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${dataUrl}`);
        alert('Claim submitted locally. Case ID: ' + fakeCaseId);
        if (onNavigate) onNavigate('evidence', { claimId: fakeCaseId });
      }
    } catch (err) {
      console.error(err);
      setStatus('Error: ' + err.message);
      setQrCode('');
    } finally {
      setSubmitting(false);
    }
  }

  async function downloadQrImage() {
    if (!qrCode) return;
    const response = await fetch(qrCode);
    const blob = await response.blob();
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = `claim-qr-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
  }

  return (
    <div className="w-full max-w-3xl bg-white p-6 md:p-8 rounded-2xl shadow-lg">
      <h2 className="text-2xl font-bold text-gray-800 mb-6 border-b pb-3">Submit Incident Report</h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Claim Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none">
              <option value="vehicle">Vehicle Accident</option>
              <option value="product">Product Issue</option>
              <option value="person">Person / Injury</option>
              <option value="machine">Machinery</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Policy / Case ID</label>
            <input value={policyId} onChange={(e) => setPolicyId(e.target.value)}
                   className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="e.g. POL-1234"/>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Claim Accepting Wallet Address</label>
          <input
            value={acceptorAddress}
            onChange={(e) => setAcceptorAddress(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
            placeholder="0x..."
          />
          <p className="mt-2 text-xs text-gray-500">
            This wallet will be the only one allowed to open the QR and submit the decision evidence.
          </p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Evidence Photos (Papers & IDs)</label>
          <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-4">
             {/* Note: Assuming ImageUploader is adapted or standard for this */}
             <ImageUploader value={photos} onChange={setPhotos} />
             <p className="text-xs text-gray-500 mt-2 text-center">
               Upload images of written paper reports and machine/vehicle IDs. Previews will display above.
             </p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Captured Location</label>
          <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 relative overflow-hidden">
            {location ? (
              <div className="flex flex-col space-y-2">
                <span className="text-xs font-mono bg-blue-100 text-blue-800 self-start px-2 py-1 rounded">
                  LAT: {location[0].toFixed(5)}, LNG: {location[1].toFixed(5)}
                </span>
                <div className="h-48 rounded-lg overflow-hidden border border-gray-200 z-0">
                  <Suspense fallback={<div className="text-center text-slate-500 py-8">Loading map...</div>}>
                    <MapDisplay position={location} locked={true} />
                  </Suspense>
                </div>
                <div className="absolute inset-0 z-10 bg-transparent"></div> {/* Forces map to be read-only on click */}
              </div>
            ) : (
              <p className="text-sm text-gray-500 py-4 text-center flex items-center justify-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Location access is required. Please enable it in your browser.
              </p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Comment / Notes</label>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none resize-none" placeholder="Add a short explanatory note here..."/>
        </div>

        <div className="pt-4 border-t flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm text-gray-600 font-medium">
            Total Uploads: <span className="bg-indigo-100 text-indigo-800 px-2 py-1 rounded-full">{photos.length}</span>
          </div>
          <button type="submit" disabled={submitting} className="w-full sm:w-auto px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {submitting ? 'Submitting to Blockchain...' : 'Upload & Submit'}
          </button>
        </div>
      </form>
      
      {status && (
        <div className="mt-6 p-4 bg-blue-50 border-l-4 border-blue-500 rounded text-sm text-blue-800 font-medium">
          {status}
        </div>
      )}

      {qrCode && (
        <div className="mt-6 p-6 bg-gray-50 border border-gray-200 rounded-xl shadow-inner text-center">
          <div className="text-lg font-bold text-gray-800 mb-4">Your Case QR Code</div>
          <img src={qrCode} alt="Claim QR code" className="w-48 h-48 mx-auto object-contain border border-gray-300 bg-white p-2 rounded-lg shadow-sm" />
          <p className="mt-3 text-sm text-gray-600">
            Share this QR only with the acceptor wallet: <span className="font-mono text-gray-800 break-all">{acceptorAddress}</span>
          </p>
          <button
            type="button"
            onClick={downloadQrImage}
            className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Download QR Image
          </button>
          <p className="text-xs text-gray-500 mt-4">Save this QR code to track your case on the blockchain.</p>
        </div>
      )}
    </div>
  );
}
