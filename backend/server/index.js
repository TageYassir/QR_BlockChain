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
const upload = multer({ dest: path.join(__dirname, 'uploads/') });

// ensure storage folder exists
ensureStorage(path.join(__dirname, 'storage'));

app.post('/api/claims', upload.array('photos', 20), async (req, res) => {
  const caseId = req.body.policyId || uuidv4();
  const category = req.body.category || 'unknown';
  const lat = parseFloat(req.body.lat) || null;
  const lng = parseFloat(req.body.lng) || null;
  const comment = req.body.comment || '';

  try {
    // Create Case node
    const s = session();
    await s.writeTransaction(tx => tx.run(
      `MERGE (c:Case {caseId: $caseId})
       SET c.category=$category, c.comment=$comment, c.createdAt=datetime()
       RETURN c`, { caseId, category, comment }
    ));

    // save photos and create Photo nodes
    const files = req.files || [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const filename = `${Date.now()}-${f.originalname}`;
      const dest = path.join(__dirname, 'storage', filename);
      fs.renameSync(f.path, dest); // move to storage
      const url = `/storage/${filename}`; // serve statically or upload to S3

      // parse meta if present
      const metaKey = `meta[${i}]`;
      const meta = req.body[metaKey] ? JSON.parse(req.body[metaKey]) : {};

      await s.writeTransaction(tx => tx.run(
        `MATCH (c:Case {caseId: $caseId})
         CREATE (p:Photo {id: $id, url: $url, filename:$filename, meta:$meta})
         CREATE (c)-[:HAS_PHOTO]->(p)
         RETURN p`, { caseId, id: uuidv4(), url, filename, meta: JSON.stringify(meta) }
      ));
    }

    // attach geolocation as a node (optional)
    if (lat && lng) {
      await s.writeTransaction(tx => tx.run(
        `MATCH (c:Case {caseId: $caseId})
         MERGE (loc:Location {lat: $lat, lng: $lng})
         MERGE (c)-[:AT_LOCATION]->(loc)`, { caseId, lat, lng }
      ));
    }

    await s.close();
    // generate QR containing case link or id
    const qrData = `https://yourapp.example/cases/${caseId}`; // or raw caseId
    const qr = await QRCode.toDataURL(qrData);

    res.json({ ok: true, caseId, qr });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Serve storage folder static (for demo)
app.use('/storage', express.static(path.join(__dirname, 'storage')));

app.listen(process.env.PORT || 4000, () => console.log('Server started on port 4000'));