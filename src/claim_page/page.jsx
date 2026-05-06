// migrated from app/ui/claim_page/page.jsx
import React, { useState } from "react";
import { ethers } from "ethers";

export default function ClaimPage() {
  const [files, setFiles] = useState([]);
  const [position, setPosition] = useState(null);
  const [policyId, setPolicyId] = useState("");
  const [reporter, setReporter] = useState("");
  const [status, setStatus] = useState("");

  async function handleFiles(e) {
    setFiles(Array.from(e.target.files || []));
  }

  function getGeolocation() {
    if (!navigator.geolocation) {
      alert("Geolocation not supported");
      return;
    }
    navigator.geolocation.getCurrentPosition((pos) => {
      setPosition({ lat: pos.coords.latitude, lon: pos.coords.longitude, ts: pos.timestamp });
    }, (err) => {
      console.error(err);
      alert("Geolocation error");
    }, { enableHighAccuracy: true });
  }

  async function computeFileHash(file) {
    const ab = await file.arrayBuffer();
    const hash = ethers.utils.keccak256(new Uint8Array(ab));
    return hash;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!files.length) { alert("Select files"); return; }
    setStatus("Computing hashes...");

    const clientHashes = [];
    for (const f of files) {
      const h = await computeFileHash(f);
      clientHashes.push({ filename: f.name, hash: h });
    }

    const concat = ethers.utils.hexConcat(clientHashes.map(c => c.hash));
    const metaBytes = ethers.utils.toUtf8Bytes(JSON.stringify({ policyId, reporter, position }));
    const evidenceHash = ethers.utils.keccak256(ethers.utils.hexConcat([concat, ethers.utils.hexlify(metaBytes)]));

    setStatus("Uploading files...");
    const form = new FormData();
    form.append("metadata", JSON.stringify({ clientHashes, policy_id: policyId, reporter }));
    for (const f of files) {
      form.append("files", f, f.name);
    }

    try {
      const uploadResp = await fetch("/api/v1/upload-evidence", {
        method: "POST",
        body: form
      });
      const uploadData = await uploadResp.json();
      const cids = uploadData.cids || [];
      setStatus("Submitting claim on-chain...");
      const submitResp = await fetch("/api/v1/submit-claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          policy_id: policyId,
          evidence_hash: evidenceHash,
          ipfs_cid: cids.length ? cids[0].cid : null,
          reporter
        })
      });
      const submitData = await submitResp.json();
      setStatus("Done: tx " + (submitData.tx_hash || JSON.stringify(submitData)));
    } catch (err) {
      console.error(err);
      setStatus("Error: " + (err?.message || String(err)));
    }
  }

  return (
    <div style={{ padding: 12 }}>
      <h2>Report Accident / Submit Claim</h2>
      <form onSubmit={handleSubmit}>
        <label>Policy ID: <input value={policyId} onChange={(e)=>setPolicyId(e.target.value)} required /></label><br/>
        <label>Your blockchain address (optional): <input value={reporter} onChange={(e)=>setReporter(e.target.value)} /></label><br/>
        <label>Photos (camera preferred): <input type="file" accept="image/*" capture="environment" multiple onChange={handleFiles} /></label><br/>
        <button type="button" onClick={getGeolocation}>Capture Location</button>
        {position && <div>Location: {position.lat}, {position.lon}</div>}
        <div style={{ marginTop: 12 }}>
          <button type="submit">Upload & Submit Claim</button>
        </div>
      </form>
      <div style={{ marginTop: 12 }}>
        <strong>Status:</strong> {status}
      </div>
    </div>
  );
}
