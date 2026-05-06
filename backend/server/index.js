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

app.post('/api/claims', upload.array('photos', 20), async (req, res) => {
  const caseId = req.body.policyId || uuidv4();
  const category = req.body.category || 'unknown';
  const parsedLat = parseFloat(req.body.lat);
  const parsedLng = parseFloat(req.body.lng);
  const lat = Number.isNaN(parsedLat) ? null : parsedLat;
  const lng = Number.isNaN(parsedLng) ? null : parsedLng;
  const comment = req.body.comment || '';
  const reporter = req.body.reporter || 'anonymous';
  const evidenceHash = req.body.evidenceHash || '';
  let metadata;

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
         SET c.category=$category, c.comment=$comment, c.reporter=$reporter,
             c.evidenceHash=$evidenceHash, c.metadata=$metadata, c.createdAt=datetime()
         RETURN c`,
        { caseId, category, comment, reporter, evidenceHash, metadata: JSON.stringify(metadata) }
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
      const qrData = `https://yourapp.example/cases/${caseId}`; // or raw caseId
      const qr = await QRCode.toDataURL(qrData);

      res.json({ ok: true, caseId, qr });
    } finally {
      await s.close();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Serve storage folder static (for demo)
app.use('/storage', express.static(storageDir));

app.listen(process.env.PORT || 4000, () => console.log('Server started on port 4000'));