require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const { session } = require('./neo4j');
const { ensureStorage } = require('./utils/files');
const { submitClaimOnChain, addEvidenceOnChain, policyInfo, registerPolicyOnChain } = require('./contractClient');

const app = express();
const uploadsDir = path.join(__dirname, 'uploads');
const storageDir = path.join(__dirname, 'storage');
const upload = multer({ dest: uploadsDir });

ensureStorage(uploadsDir);
ensureStorage(storageDir);

// simple CORS for dev
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.get('origin') || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-user-address');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

function normalizeAddress(value = '') {
  return String(value || '').trim().toLowerCase();
}

function parseJsonField(value, fallback = {}) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch (e) { throw new Error(`Invalid JSON payload: ${e.message}`); }
}

function serializeCaseRecord(record) {
  const metadata = record.metadata ? parseJsonField(record.metadata, {}) : {};
  const createdAt = record.createdAt && typeof record.createdAt.toString === 'function'
    ? record.createdAt.toString()
    : record.createdAt || null;
  return {
    caseId: record.caseId,
    policyId: record.policyId || metadata.policyId || '',
    category: record.category || metadata.category || 'unknown',
    status: record.status || 'pending',
    comment: record.comment || '',
    reporter: record.reporter || '',
    acceptorAddress: record.acceptorAddress || metadata.acceptorAddress || '',
    evidenceHash: record.evidenceHash || '',
    qrData: record.qrData || '',
    qr: record.qr || '',
    metadata,
    photos: record.photos || [],
    evidences: record.evidences || [],
    evidenceCount: record.evidenceCount || (Array.isArray(record.evidences) ? record.evidences.length : 0),
    createdAt,
    location: record.location || null,
  };
}

// Create claim
app.post('/api/claims', upload.array('photos', 20), async (req, res) => {
  const caseId = req.body.caseId || uuidv4();
  const policyId = req.body.policyId || '';
  const category = req.body.category || 'unknown';
  const parsedLat = parseFloat(req.body.lat);
  const parsedLng = parseFloat(req.body.lng);
  const lat = Number.isNaN(parsedLat) ? null : parsedLat;
  const lng = Number.isNaN(parsedLng) ? null : parsedLng;
  const comment = req.body.comment || '';
  const actorAddress = req.get('x-user-address') || '';
  const acceptorAddress = req.body.acceptorAddress || '';
  const evidenceHash = req.body.evidenceHash || '';
  let metadata = {};

  if (!normalizeAddress(actorAddress)) return res.status(401).json({ ok: false, error: 'Wallet connection required' });

  try {
    metadata = parseJsonField(req.body.metadata, {});
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }

  if (!normalizeAddress(acceptorAddress)) return res.status(400).json({ ok: false, error: 'Acceptor wallet address is required' });
  if (!/^0x[a-f0-9]{40}$/.test(String(acceptorAddress).trim().toLowerCase())) return res.status(400).json({ ok: false, error: 'Acceptor wallet address is invalid' });

  // persist in Neo4j
  try {
    const s = session();
    try {
      await s.writeTransaction(tx => tx.run(
        `MERGE (c:Case {caseId: $caseId})
         SET c.policyId=$policyId,
             c.category=$category,
             c.comment=$comment,
             c.reporter=$reporter,
             c.acceptorAddress=$acceptorAddress,
             c.evidenceHash=$evidenceHash,
             c.status='pending',
             c.metadata=$metadata,
             c.createdAt=coalesce(c.createdAt, datetime())
         RETURN c`,
        { caseId, policyId, category, comment, reporter: normalizeAddress(actorAddress), acceptorAddress: normalizeAddress(acceptorAddress), evidenceHash, metadata: JSON.stringify(metadata) }
      ));

      // handle uploaded photos
      const files = req.files || [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const filename = `${Date.now()}-${f.originalname}`;
        const dest = path.join(storageDir, filename);
        fs.renameSync(f.path, dest);
        const url = `/storage/${filename}`;
        const metaKey = `meta[${i}]`;
        const meta = parseJsonField(req.body[metaKey], {});
        const clientHash = metadata.clientHashes && metadata.clientHashes[i] ? metadata.clientHashes[i].hash : '';
        await s.writeTransaction(tx => tx.run(
          `MATCH (c:Case {caseId: $caseId})
           CREATE (p:Photo {id: $id, url: $url, filename:$filename, meta:$meta, fileHash:$fileHash})
           CREATE (c)-[:HAS_PHOTO]->(p)
           RETURN p`,
          { caseId, id: uuidv4(), url, filename, meta: JSON.stringify(meta), fileHash: clientHash }
        ));
      }

      if (lat !== null && lng !== null) {
        await s.writeTransaction(tx => tx.run(
          `MATCH (c:Case {caseId: $caseId})
           MERGE (loc:Location {lat: $lat, lng: $lng})
           MERGE (c)-[:AT_LOCATION]->(loc)`, { caseId, lat, lng }
        ));
      }

      const origin = req.get('origin') || `${req.protocol}://${req.get('host')}` || 'http://localhost:5173';
      const qrData = `${origin}/?evidence=${caseId}`;
      const qr = await QRCode.toDataURL(qrData);

      await s.writeTransaction(tx => tx.run(
        `MATCH (c:Case {caseId: $caseId})
         SET c.qrData = $qrData, c.qr = $qr, c.updatedAt = datetime()
         RETURN c`, { caseId, qrData, qr }
      ));

      // attempt to publish minimal claim info on-chain
      try {
        const chainResp = await submitClaimOnChain({ caseId, policyId, evidenceHash, ipfsCid: '', acceptor: normalizeAddress(acceptorAddress) });
        console.log('Submitted claim on-chain:', chainResp);
        // optionally store tx hash in Neo4j
        await s.writeTransaction(tx => tx.run(
          `MATCH (c:Case {caseId: $caseId}) SET c.txHash = $txHash RETURN c`, { caseId, txHash: chainResp.txHash }
        ));
      } catch (chainErr) {
        console.warn('Failed to publish claim on-chain:', chainErr && chainErr.message ? chainErr.message : chainErr);
      }

      return res.json({ ok: true, caseId, policyId, qr, qrData });
    } finally { await s.close(); }
  } catch (err) {
    console.error('Neo4j error when creating claim:', err && err.message ? err.message : err);
    return res.status(503).json({ ok: false, error: 'Database unavailable — please connect to Neo4j' });
  }
});

// Add evidence
app.post('/api/claims/:id/evidence', upload.array('photos', 20), async (req, res) => {
  const claimId = req.params.id;
  const actorAddress = req.get('x-user-address') || '';
  const comment = req.body.comment || '';
  const linkedEvidenceId = req.body.linkedEvidenceId || '';
  const parsedLat = parseFloat(req.body.lat);
  const parsedLng = parseFloat(req.body.lng);
  const lat = Number.isNaN(parsedLat) ? null : parsedLat;
  const lng = Number.isNaN(parsedLng) ? null : parsedLng;
  const evidenceId = uuidv4();
  const files = req.files || [];

  if (!normalizeAddress(actorAddress)) return res.status(401).json({ ok: false, error: 'Wallet connection required' });
  if (!files.length && !String(comment || '').trim()) return res.status(400).json({ ok: false, error: 'Add a comment or at least one evidence photo' });

  const savedPhotos = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const filename = `${Date.now()}-${f.originalname}`;
    const dest = path.join(storageDir, filename);
    fs.renameSync(f.path, dest);
    savedPhotos.push(`/storage/${filename}`);
  }

  try {
    const s = session();
    try {
      const ownerResult = await s.readTransaction(tx => tx.run(
        `MATCH (c:Case {caseId: $claimId})
         OPTIONAL MATCH (c)-[:HAS_EVIDENCE]->(prev:Evidence {evidenceId: $linkedEvidenceId})
         RETURN c.reporter AS reporter, c.acceptorAddress AS acceptorAddress, prev.evidenceId AS prevEvidenceId LIMIT 1`,
        { claimId, linkedEvidenceId }
      ));

      if (!ownerResult.records.length) return res.status(404).json({ ok: false, error: 'Claim not found' });

      const acceptorAddress = ownerResult.records[0].get('acceptorAddress') || '';
      const claimReporter = ownerResult.records[0].get('reporter') || '';
      const prevEvidenceId = ownerResult.records[0].get('prevEvidenceId') || '';

      if (!normalizeAddress(acceptorAddress)) return res.status(403).json({ ok: false, error: 'This claim has no acceptor configured' });
      if (normalizeAddress(acceptorAddress) !== normalizeAddress(actorAddress)) return res.status(403).json({ ok: false, error: 'Only the configured acceptor wallet can add decision evidence' });
      if (normalizeAddress(acceptorAddress) === normalizeAddress(claimReporter)) return res.status(403).json({ ok: false, error: 'Acceptor wallet cannot be the original claim reporter' });
      if (linkedEvidenceId && !prevEvidenceId) return res.status(404).json({ ok: false, error: 'Linked evidence not found on this claim' });

      await s.writeTransaction(tx => tx.run(
        `MATCH (c:Case {caseId: $claimId})
         CREATE (e:Evidence { evidenceId: $evidenceId, submittedBy: $submittedBy, comment: $comment, status: 'accepted', photos: $photos, lat: $lat, lng: $lng, linkedEvidenceId: $linkedEvidenceId, createdAt: datetime() })
         CREATE (c)-[:HAS_EVIDENCE]->(e)
         WITH c, e
         OPTIONAL MATCH (c)-[:HAS_EVIDENCE]->(prev:Evidence {evidenceId: $linkedEvidenceId})
         FOREACH (_ IN CASE WHEN prev IS NULL OR $linkedEvidenceId = '' THEN [] ELSE [1] END | CREATE (e)-[:LINKED_TO]->(prev))
         SET c.status = 'accepted', c.updatedAt = datetime()
         RETURN e`,
        { claimId, evidenceId, submittedBy: normalizeAddress(actorAddress), comment, photos: savedPhotos, lat, lng, linkedEvidenceId }
      ));

      // generate QR for evidence
      try {
        const origin = req.get('origin') || `${req.protocol}://${req.get('host')}` || 'http://localhost:5173';
        const qrData = `${origin}/?evidence=${evidenceId}&claim=${claimId}`;
        const qr = await QRCode.toDataURL(qrData);
        await s.writeTransaction(tx => tx.run(
          `MATCH (e:Evidence {evidenceId: $evidenceId}) SET e.qrData = $qrData, e.qr = $qr RETURN e`, { evidenceId, qrData, qr }
        ));
      } catch (qrErr) {
        console.warn('Failed to generate evidence QR:', qrErr && qrErr.message ? qrErr.message : qrErr);
      }

      // attempt to publish evidence on-chain
      try {
        const chainResp = await addEvidenceOnChain({ caseId: claimId, evidenceId, evidenceHash: req.body.evidenceHash || '', ipfsCid: '', linkedEvidenceId });
        console.log('Submitted evidence on-chain:', chainResp);
        await s.writeTransaction(tx => tx.run(`MATCH (e:Evidence {evidenceId: $evidenceId}) SET e.txHash = $txHash RETURN e`, { evidenceId, txHash: chainResp.txHash }));
      } catch (chainErr) {
        console.warn('Failed to publish evidence on-chain:', chainErr && chainErr.message ? chainErr.message : chainErr);
      }

      return res.json({ ok: true, claimId, evidenceId, status: 'accepted' });
    } finally { await s.close(); }
  } catch (err) {
    console.error('Neo4j error when creating evidence:', err && err.message ? err.message : err);
    return res.status(503).json({ ok: false, error: 'Database unavailable — please connect to Neo4j' });
  }
});

// List claims
app.get('/api/claims', async (req, res) => {
  // enforce connected wallet and scope claims to that wallet
  const actorAddress = req.get('x-user-address') || req.query.reporter || '';
  if (!normalizeAddress(actorAddress)) return res.status(401).json({ ok: false, error: 'Wallet connection required' });
  const reporterFilter = normalizeAddress(actorAddress);
  try {
    const s = session();
    try {
      const result = await s.readTransaction(tx => tx.run(
        `MATCH (c:Case)
         OPTIONAL MATCH (c)-[:HAS_PHOTO]->(p:Photo)
         OPTIONAL MATCH (c)-[:AT_LOCATION]->(loc:Location)
         OPTIONAL MATCH (c)-[:HAS_EVIDENCE]->(e:Evidence)
         WHERE $reporterFilter = '' OR toLower(c.reporter) = toLower($reporterFilter)
         WITH c, collect(DISTINCT p.url) AS photos, head(collect(DISTINCT loc)) AS location, collect(DISTINCT e { .evidenceId, .submittedBy, .comment, .status, .photos, .lat, .lng, .linkedEvidenceId, .qrData, .qr, createdAt: toString(e.createdAt) }) AS evidences, count(DISTINCT e) AS evidenceCount
         RETURN c.caseId AS caseId, c.policyId AS policyId, c.category AS category, c.status AS status, c.comment AS comment, c.reporter AS reporter, c.acceptorAddress AS acceptorAddress, c.evidenceHash AS evidenceHash, c.qrData AS qrData, c.qr AS qr, c.metadata AS metadata, location.lat AS lat, location.lng AS lng, evidenceCount AS evidenceCount, photos AS photos, evidences AS evidences, c.createdAt AS createdAt ORDER BY createdAt DESC`,
        { reporterFilter }
      ));

      const claims = result.records.map(r => serializeCaseRecord({
        caseId: r.get('caseId'), policyId: r.get('policyId'), category: r.get('category'), status: r.get('status') || 'pending', comment: r.get('comment'), reporter: r.get('reporter'), acceptorAddress: r.get('acceptorAddress'), evidenceHash: r.get('evidenceHash'), qrData: r.get('qrData'), qr: r.get('qr'), metadata: r.get('metadata'), evidenceCount: Number(r.get('evidenceCount') || 0), evidences: r.get('evidences') || [], location: r.get('lat') !== null && r.get('lng') !== null ? { lat: r.get('lat'), lng: r.get('lng') } : null, photos: r.get('photos') || [], createdAt: r.get('createdAt')
      }));

      return res.json({ ok: true, claims });
    } finally { await s.close(); }
  } catch (err) {
    console.error('Neo4j error when listing claims:', err && err.message ? err.message : err);
    return res.status(503).json({ ok: false, error: 'Database unavailable — please connect to Neo4j' });
  }
});

// Get single claim
app.get('/api/claims/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const s = session();
    try {
      const result = await s.readTransaction(tx => tx.run(
        `MATCH (c:Case {caseId: $id})
         OPTIONAL MATCH (c)-[:HAS_PHOTO]->(p:Photo)
         OPTIONAL MATCH (c)-[:AT_LOCATION]->(loc:Location)
         OPTIONAL MATCH (c)-[:HAS_EVIDENCE]->(e:Evidence)
         WITH c, collect(DISTINCT p.url) AS photos, head(collect(DISTINCT loc)) AS location, collect(DISTINCT e { .evidenceId, .submittedBy, .comment, .status, .photos, .lat, .lng, .linkedEvidenceId, .qrData, .qr, createdAt: toString(e.createdAt) }) AS evidences
         RETURN c.caseId AS caseId, c.policyId AS policyId, c.category AS category, c.status AS status, c.comment AS comment, c.reporter AS reporter, c.acceptorAddress AS acceptorAddress, c.evidenceHash AS evidenceHash, c.qrData AS qrData, c.qr AS qr, c.metadata AS metadata, location.lat AS lat, location.lng AS lng, evidences AS evidences, photos AS photos, c.createdAt AS createdAt`,
        { id }
      ));

      if (result.records.length === 0) return res.status(404).json({ ok: false, error: 'Not found' });
      const rec = result.records[0];
      return res.json({ ok: true, claim: serializeCaseRecord({ caseId: rec.get('caseId'), policyId: rec.get('policyId'), category: rec.get('category'), status: rec.get('status') || 'pending', comment: rec.get('comment'), reporter: rec.get('reporter'), acceptorAddress: rec.get('acceptorAddress'), evidenceHash: rec.get('evidenceHash'), qrData: rec.get('qrData'), qr: rec.get('qr'), metadata: rec.get('metadata'), location: rec.get('lat') !== null && rec.get('lng') !== null ? { lat: rec.get('lat'), lng: rec.get('lng') } : null, evidences: (rec.get('evidences') || []).filter((e) => e && e.evidenceId), photos: rec.get('photos') || [], createdAt: rec.get('createdAt') }) });
    } finally { await s.close(); }
  } catch (err) {
    console.error('Neo4j error when getting claim:', err && err.message ? err.message : err);
    return res.status(503).json({ ok: false, error: 'Database unavailable — please connect to Neo4j' });
  }
});

// List evidences submitted by a wallet
app.get('/api/evidences', async (req, res) => {
  const actorAddress = req.get('x-user-address') || req.query.submittedBy || '';
  if (!normalizeAddress(actorAddress)) return res.status(401).json({ ok: false, error: 'Wallet connection required' });
  try {
    const s = session();
    try {
      const result = await s.readTransaction(tx => tx.run(
        `MATCH (c:Case)-[:HAS_EVIDENCE]->(e:Evidence)
         WHERE toLower(e.submittedBy) = toLower($submittedBy)
         RETURN c.caseId AS caseId,
                e.evidenceId AS evidenceId,
                e.comment AS comment,
                e.photos AS photos,
                e.lat AS lat,
                e.lng AS lng,
                e.linkedEvidenceId AS linkedEvidenceId,
                e.qr AS qr,
                e.qrData AS qrData,
                toString(e.createdAt) AS createdAt
         ORDER BY createdAt DESC`,
        { submittedBy: normalizeAddress(actorAddress) }
      ));

      const evidences = result.records.map(r => ({
        evidenceId: r.get('evidenceId'),
        claimId: r.get('caseId'),
        comment: r.get('comment') || '',
        photos: r.get('photos') || [],
        lat: r.get('lat') || null,
        lng: r.get('lng') || null,
        linkedEvidenceId: r.get('linkedEvidenceId') || '',
        qr: r.get('qr') || '',
        qrData: r.get('qrData') || '',
        createdAt: r.get('createdAt') || ''
      }));

      return res.json({ ok: true, evidences });
    } finally { await s.close(); }
  } catch (err) {
    console.error('Neo4j error when listing evidences:', err && err.message ? err.message : err);
    return res.status(503).json({ ok: false, error: 'Database unavailable — please connect to Neo4j' });
  }
});

// Global ledger
app.get('/api/ledger', async (req, res) => {
  try {
    const s = session();
    try {
      const result = await s.readTransaction(tx => tx.run(
        `MATCH (c:Case)
         OPTIONAL MATCH (c)-[:HAS_PHOTO]->(p:Photo)
         WITH c, collect(DISTINCT p.url) AS photos
         RETURN c.caseId AS caseId, c.policyId AS policyId, c.evidenceHash AS txHash, c.createdAt AS createdAt, photos AS photos ORDER BY createdAt DESC`
      ));

      const ledger = result.records.map((record) => ({ txHash: record.get('txHash') || record.get('caseId'), caseId: record.get('caseId'), timestamp: record.get('createdAt') && typeof record.get('createdAt').toString === 'function' ? record.get('createdAt').toString() : record.get('createdAt') || '', policyId: record.get('policyId') || '', photos: record.get('photos') || [] }));
      return res.json({ ok: true, ledger });
    } finally { await s.close(); }
  } catch (err) {
    console.error('Neo4j error when fetching ledger:', err && err.message ? err.message : err);
    return res.status(503).json({ ok: false, error: 'Database unavailable — please connect to Neo4j' });
  }
});

// Serve storage folder static
app.use('/storage', express.static(storageDir));

// Expose current contract address for frontend/runtime discovery
app.get('/api/contract-address', (req, res) => {
  // priority: env var, then deployments.json
  const fromEnv = process.env.CONTRACT_ADDRESS;
  if (fromEnv && String(fromEnv).trim()) return res.json({ ok: true, address: String(fromEnv).trim() });
  try {
    const p = path.join(__dirname, '..', 'deployments.json');
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (data && data.ClaimRegistry) return res.json({ ok: true, address: data.ClaimRegistry });
    }
  } catch (e) {
    console.warn('Failed to read deployments.json', e && e.message ? e.message : e);
  }
  return res.status(404).json({ ok: false, error: 'Contract address not available' });
});

// Query on-chain policy info by policyId (string)
app.get('/api/policies/:policyId', async (req, res) => {
  const policyId = req.params.policyId;
  if (!policyId) return res.status(400).json({ ok: false, error: 'policyId required' });
  try {
    const info = await policyInfo(policyId);
    return res.json({ ok: true, policy: info });
  } catch (err) {
    console.error('Error fetching policy info:', err && err.message ? err.message : err);
    return res.status(500).json({ ok: false, error: 'Failed to read policy info' });
  }
});

// Register a policy on-chain via relayer/private key. Requires x-user-address header as caller identity.
app.post('/api/policies', express.json(), async (req, res) => {
  const caller = req.get('x-user-address') || '';
  if (!normalizeAddress(caller)) return res.status(401).json({ ok: false, error: 'Wallet connection required' });
  const { policyId, owner, metadataHash } = req.body || {};
  if (!policyId || !owner) return res.status(400).json({ ok: false, error: 'policyId and owner are required' });
  try {
    const result = await registerPolicyOnChain({ policyId, owner: normalizeAddress(owner), metadataHash: metadataHash || undefined });
    return res.json({ ok: true, result });
  } catch (err) {
    console.error('Failed to register policy on-chain:', err && err.message ? err.message : err);
    return res.status(500).json({ ok: false, error: err && err.message ? err.message : String(err) });
  }
});

app.listen(process.env.PORT || 4001, () => console.log(`Server started on port ${process.env.PORT || 4001}`));
