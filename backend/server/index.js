require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const { session } = require('./neo4j');
const { ensureStorage } = require('./utils/files');

const app = express();
const uploadsDir = path.join(__dirname, 'uploads');
const storageDir = path.join(__dirname, 'storage');
const upload = multer({ dest: uploadsDir });

// ensure storage folder exists
ensureStorage(uploadsDir);
ensureStorage(storageDir);

// allow simple CORS for dev (adjust for production)
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
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`Invalid JSON payload: ${error.message}`);
  }
}

function serializeCaseRecord(record) {
  const metadata = record.metadata ? parseJsonField(record.metadata, {}) : {};
  const createdAt = record.createdAt && typeof record.createdAt.toString === 'function'
    ? record.createdAt.toString()
    : record.createdAt || null;
  const location = record.location || null;

  return {
    caseId: record.caseId,
    policyId: record.policyId || metadata.policyId || '',
    category: record.category || metadata.category || 'unknown',
    status: record.status || 'pending',
    comment: record.comment || '',
    reporter: record.reporter || '',
    evidenceHash: record.evidenceHash || '',
    qrData: record.qrData || '',
    qr: record.qr || '',
    metadata,
    photos: record.photos || [],
    evidences: record.evidences || [],
    evidenceCount: record.evidenceCount || (Array.isArray(record.evidences) ? record.evidences.length : 0),
    createdAt,
    location,
  };
}

app.post('/api/claims', upload.array('photos', 20), async (req, res) => {
  const caseId = req.body.caseId || uuidv4();
  const policyId = req.body.policyId || '';
  const category = req.body.category || 'unknown';
  const parsedLat = parseFloat(req.body.lat);
  const parsedLng = parseFloat(req.body.lng);
  const lat = Number.isNaN(parsedLat) ? null : parsedLat;
  const lng = Number.isNaN(parsedLng) ? null : parsedLng;
  const comment = req.body.comment || '';
  const reporter = req.body.reporter || 'anonymous';
  const actorAddress = req.get('x-user-address') || '';
  const evidenceHash = req.body.evidenceHash || '';
  let metadata;

  if (!normalizeAddress(actorAddress)) {
    return res.status(401).json({ ok: false, error: 'Wallet connection required' });
  }

  if (normalizeAddress(actorAddress) !== normalizeAddress(reporter)) {
    return res.status(403).json({ ok: false, error: 'Reporter must match connected wallet' });
  }

  try {
    metadata = parseJsonField(req.body.metadata, {});
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message });
  }

  try {
    // Create Case node with extended metadata
    const s = session();
    try {
      await s.writeTransaction(tx => tx.run(
        `MERGE (c:Case {caseId: $caseId})
         SET c.policyId=$policyId,
             c.category=$category,
             c.comment=$comment,
             c.reporter=$reporter,
             c.evidenceHash=$evidenceHash,
           c.status='pending',
             c.metadata=$metadata,
             c.createdAt=coalesce(c.createdAt, datetime())
         RETURN c`,
        { caseId, policyId, category, comment, reporter, evidenceHash, metadata: JSON.stringify(metadata) }
      ));

      // save photos and create Photo nodes
      const files = req.files || [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const filename = `${Date.now()}-${f.originalname}`;
        const dest = path.join(storageDir, filename);
        fs.renameSync(f.path, dest); // move to storage
        const url = `/storage/${filename}`; // serve statically or upload to S3

        // parse meta if present
        const metaKey = `meta[${i}]`;
        const meta = parseJsonField(req.body[metaKey], {});

        // Extract hash from clientHashes array if available
        const clientHash = metadata.clientHashes && metadata.clientHashes[i] ? metadata.clientHashes[i].hash : '';

        await s.writeTransaction(tx => tx.run(
          `MATCH (c:Case {caseId: $caseId})
           CREATE (p:Photo {id: $id, url: $url, filename:$filename, meta:$meta, fileHash:$fileHash})
           CREATE (c)-[:HAS_PHOTO]->(p)
           RETURN p`,
          { caseId, id: uuidv4(), url, filename, meta: JSON.stringify(meta), fileHash: clientHash }
        ));
      }

      // attach geolocation as a node (optional)
      if (lat !== null && lng !== null) {
        await s.writeTransaction(tx => tx.run(
          `MATCH (c:Case {caseId: $caseId})
           MERGE (loc:Location {lat: $lat, lng: $lng})
           MERGE (c)-[:AT_LOCATION]->(loc)`, { caseId, lat, lng }
        ));
      }

      // generate QR containing case link or id
      const origin = req.get('origin') || `${req.protocol}://${req.get('host')}` || 'http://localhost:5173';
      const qrData = `${origin}/?evidence=${caseId}`;
      const qr = await QRCode.toDataURL(qrData);

      await s.writeTransaction(tx => tx.run(
        `MATCH (c:Case {caseId: $caseId})
         SET c.qrData = $qrData,
             c.qr = $qr,
             c.updatedAt = datetime()
         RETURN c`,
        { caseId, qrData, qr }
      ));

      // persist a simple JSON record for fallback / debugging
      try {
        const claimsFile = path.join(storageDir, 'claims.json');
        let existing = [];
        if (fs.existsSync(claimsFile)) {
          const raw = fs.readFileSync(claimsFile, 'utf8');
          try { existing = JSON.parse(raw) || []; } catch (e) { existing = []; }
        }

        const claimRecord = {
          caseId,
          policyId,
          category,
          comment,
          reporter,
          evidenceHash,
          status: 'pending',
          metadata,
          qrData,
          qr,
          photos: (req.files || []).map((f, i) => ({ filename: `${Date.now()}-${f.originalname}`, index: i })),
          createdAt: new Date().toISOString(),
          location: lat !== null && lng !== null ? { lat, lng } : null,
          evidences: [],
        };

        existing.push(claimRecord);
        fs.writeFileSync(claimsFile, JSON.stringify(existing, null, 2), 'utf8');
      } catch (persistErr) {
        console.warn('Failed to persist local claim record:', persistErr.message);
      }

      res.json({ ok: true, caseId, policyId, qr, qrData });
    } finally {
      await s.close();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/claims/:id/evidence', upload.array('photos', 20), async (req, res) => {
  const claimId = req.params.id;
  const actorAddress = req.get('x-user-address') || '';
  const reporter = req.body.reporter || '';
  const comment = req.body.comment || '';
  const parsedLat = parseFloat(req.body.lat);
  const parsedLng = parseFloat(req.body.lng);
  const lat = Number.isNaN(parsedLat) ? null : parsedLat;
  const lng = Number.isNaN(parsedLng) ? null : parsedLng;
  const evidenceId = uuidv4();
  const files = req.files || [];

  if (!normalizeAddress(actorAddress)) {
    return res.status(401).json({ ok: false, error: 'Wallet connection required' });
  }

  if (normalizeAddress(actorAddress) !== normalizeAddress(reporter)) {
    return res.status(403).json({ ok: false, error: 'Reporter must match connected wallet' });
  }

  if (!files.length) {
    return res.status(400).json({ ok: false, error: 'At least one evidence photo is required' });
  }

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
      const ownerResult = await s.readTransaction((tx) => tx.run(
        `MATCH (c:Case {caseId: $claimId}) RETURN c.reporter AS reporter LIMIT 1`,
        { claimId }
      ));

      if (!ownerResult.records.length) {
        return res.status(404).json({ ok: false, error: 'Claim not found' });
      }

      const claimReporter = ownerResult.records[0].get('reporter') || '';
      if (normalizeAddress(claimReporter) !== normalizeAddress(actorAddress)) {
        return res.status(403).json({ ok: false, error: 'Only claim owner can add evidence' });
      }

      await s.writeTransaction((tx) => tx.run(
        `MATCH (c:Case {caseId: $claimId})
         CREATE (e:Evidence {
           evidenceId: $evidenceId,
           submittedBy: $submittedBy,
           comment: $comment,
           status: 'accepted',
           photos: $photos,
           lat: $lat,
           lng: $lng,
           createdAt: datetime()
         })
         CREATE (c)-[:HAS_EVIDENCE]->(e)
         SET c.status = 'accepted',
             c.updatedAt = datetime()
         RETURN e`,
        {
          claimId,
          evidenceId,
          submittedBy: actorAddress,
          comment,
          photos: savedPhotos,
          lat,
          lng,
        }
      ));

      return res.json({ ok: true, claimId, evidenceId, status: 'accepted' });
    } finally {
      await s.close();
    }
  } catch (err) {
    // Fallback to local file when Neo4j is unavailable
    try {
      const claimsFile = path.join(storageDir, 'claims.json');
      if (!fs.existsSync(claimsFile)) {
        return res.status(404).json({ ok: false, error: 'Claim store not found' });
      }

      const raw = fs.readFileSync(claimsFile, 'utf8');
      const parsed = JSON.parse(raw || '[]');
      const claim = parsed.find((c) => c.caseId === claimId || c.caseId === decodeURIComponent(claimId));
      if (!claim) {
        return res.status(404).json({ ok: false, error: 'Claim not found' });
      }

      if (normalizeAddress(claim.reporter || '') !== normalizeAddress(actorAddress)) {
        return res.status(403).json({ ok: false, error: 'Only claim owner can add evidence' });
      }

      if (!Array.isArray(claim.evidences)) claim.evidences = [];
      claim.evidences.push({
        evidenceId,
        submittedBy: actorAddress,
        comment,
        photos: savedPhotos,
        location: lat !== null && lng !== null ? { lat, lng } : null,
        status: 'accepted',
        createdAt: new Date().toISOString(),
      });
      claim.status = 'accepted';

      fs.writeFileSync(claimsFile, JSON.stringify(parsed, null, 2), 'utf8');
      return res.json({ ok: true, claimId, evidenceId, status: 'accepted' });
    } catch (fallbackErr) {
      return res.status(500).json({ ok: false, error: 'Database unavailable' });
    }
  }
});

// List claims (from local storage fallback)
app.get('/api/claims', async (req, res) => {
  try {
    const s = session();
    try {
      const reporterFilter = req.query.reporter || '';
      const result = await s.readTransaction(tx => tx.run(
        `MATCH (c:Case)
         OPTIONAL MATCH (c)-[:HAS_PHOTO]->(p:Photo)
         OPTIONAL MATCH (c)-[:AT_LOCATION]->(loc:Location)
         OPTIONAL MATCH (c)-[:HAS_EVIDENCE]->(e:Evidence)
         WHERE $reporterFilter = '' OR c.reporter = $reporterFilter
         WITH c,
              collect(DISTINCT p.url) AS photos,
              head(collect(DISTINCT loc)) AS location,
              count(DISTINCT e) AS evidenceCount
         RETURN c.caseId AS caseId,
                c.policyId AS policyId,
                c.category AS category,
              c.status AS status,
                c.comment AS comment,
                c.reporter AS reporter,
                c.evidenceHash AS evidenceHash,
                c.qrData AS qrData,
                c.qr AS qr,
                c.metadata AS metadata,
                location.lat AS lat,
                location.lng AS lng,
                evidenceCount AS evidenceCount,
                photos AS photos,
                c.createdAt AS createdAt
         ORDER BY createdAt DESC`,
        { reporterFilter }
      ));
      const claims = result.records.map(r => serializeCaseRecord({
        caseId: r.get('caseId'),
        policyId: r.get('policyId'),
        category: r.get('category'),
        status: r.get('status') || 'pending',
        comment: r.get('comment'),
        reporter: r.get('reporter'),
        evidenceHash: r.get('evidenceHash'),
        qrData: r.get('qrData'),
        qr: r.get('qr'),
        metadata: r.get('metadata'),
        evidenceCount: Number(r.get('evidenceCount') || 0),
        location: r.get('lat') !== null && r.get('lng') !== null ? { lat: r.get('lat'), lng: r.get('lng') } : null,
        photos: r.get('photos') || [],
        createdAt: r.get('createdAt')
      }));
      return res.json({ ok: true, claims });
    } finally { await s.close(); }
  } catch (err) {
    // Neo4j is unavailable; use fallback to local file
    try {
      const claimsFile = path.join(storageDir, 'claims.json');
      if (fs.existsSync(claimsFile)) {
        const raw = fs.readFileSync(claimsFile, 'utf8');
        const parsed = JSON.parse(raw || '[]');
        const claims = parsed.reverse().map((item) => ({
          ...item,
          status: item.status || 'pending',
          evidences: Array.isArray(item.evidences) ? item.evidences : [],
          evidenceCount: Array.isArray(item.evidences) ? item.evidences.length : 0,
        }));
        return res.json({ ok: true, claims });
      }
    } catch (fallbackErr) {
      // fallback also failed
    }

    res.status(500).json({ ok: false, error: 'Database unavailable' });
  }
});

// Get single claim by id
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
         WITH c,
              collect(DISTINCT p.url) AS photos,
              head(collect(DISTINCT loc)) AS location,
              collect(DISTINCT e {
                .evidenceId,
                .submittedBy,
                .comment,
                .status,
                .photos,
                .lat,
                .lng,
                createdAt: toString(e.createdAt)
              }) AS evidences
         RETURN c.caseId AS caseId,
                c.policyId AS policyId,
                c.category AS category,
              c.status AS status,
                c.comment AS comment,
                c.reporter AS reporter,
                c.evidenceHash AS evidenceHash,
                c.qrData AS qrData,
                c.qr AS qr,
                c.metadata AS metadata,
                location.lat AS lat,
                location.lng AS lng,
                evidences AS evidences,
                photos AS photos,
                c.createdAt AS createdAt`, { id }
      ));
      if (result.records.length === 0) return res.status(404).json({ ok: false, error: 'Not found' });
      const rec = result.records[0];
      return res.json({ ok: true, claim: serializeCaseRecord({
        caseId: rec.get('caseId'),
        policyId: rec.get('policyId'),
        category: rec.get('category'),
        status: rec.get('status') || 'pending',
        comment: rec.get('comment'),
        reporter: rec.get('reporter'),
        evidenceHash: rec.get('evidenceHash'),
        qrData: rec.get('qrData'),
        qr: rec.get('qr'),
        metadata: rec.get('metadata'),
        location: rec.get('lat') !== null && rec.get('lng') !== null ? { lat: rec.get('lat'), lng: rec.get('lng') } : null,
        evidences: (rec.get('evidences') || []).filter((e) => e && e.evidenceId),
        photos: rec.get('photos') || [],
        createdAt: rec.get('createdAt')
      }) });
    } finally { await s.close(); }
  } catch (err) {
    // Neo4j is unavailable; use fallback to local file
    try {
      const claimsFile = path.join(storageDir, 'claims.json');
      if (fs.existsSync(claimsFile)) {
        const raw = fs.readFileSync(claimsFile, 'utf8');
        const parsed = JSON.parse(raw || '[]');
        const found = parsed.find(c => c.caseId === id || c.caseId === decodeURIComponent(id));
        if (found) {
          return res.json({
            ok: true,
            claim: {
              ...found,
              status: found.status || 'pending',
              evidences: Array.isArray(found.evidences) ? found.evidences : [],
            },
          });
        }
      }
    } catch (fallbackErr) {
      // fallback also failed
    }

    res.status(500).json({ ok: false, error: 'Database unavailable' });
  }
});

// Global ledger view of public claim records
app.get('/api/ledger', async (req, res) => {
  try {
    const s = session();
    try {
      const result = await s.readTransaction(tx => tx.run(
        `MATCH (c:Case)
         OPTIONAL MATCH (c)-[:HAS_PHOTO]->(p:Photo)
         WITH c, collect(DISTINCT p.url) AS photos
         RETURN c.caseId AS caseId,
                c.policyId AS policyId,
                c.evidenceHash AS txHash,
                c.createdAt AS createdAt,
                photos AS photos
         ORDER BY createdAt DESC`
      ));

      const ledger = result.records.map((record) => ({
        txHash: record.get('txHash') || record.get('caseId'),
        caseId: record.get('caseId'),
        timestamp: record.get('createdAt') && typeof record.get('createdAt').toString === 'function'
          ? record.get('createdAt').toString()
          : record.get('createdAt') || '',
        policyId: record.get('policyId') || '',
        photos: record.get('photos') || [],
      }));

      return res.json({ ok: true, ledger });
    } finally {
      await s.close();
    }
  } catch (err) {
    // Neo4j is unavailable; use fallback to local file
    try {
      const claimsFile = path.join(storageDir, 'claims.json');
      if (fs.existsSync(claimsFile)) {
        const raw = fs.readFileSync(claimsFile, 'utf8');
        const parsed = JSON.parse(raw || '[]');
        const ledger = parsed.map((item) => ({
          txHash: item.evidenceHash || item.caseId,
          caseId: item.caseId,
          timestamp: item.createdAt || '',
          policyId: item.policyId || '',
          photos: item.photos || [],
        }));
        return res.json({ ok: true, ledger });
      }
    } catch (fallbackErr) {
      // fallback also failed
    }

    res.status(500).json({ ok: false, error: 'Database unavailable' });
  }
});

// Serve storage folder static (for demo)
app.use('/storage', express.static(storageDir));

app.listen(process.env.PORT || 4001, () => console.log(`Server started on port ${process.env.PORT || 4001}`));