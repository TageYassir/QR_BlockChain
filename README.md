## 🤝 Contributors

| Avatar | Contributor |
| :---: | :--- |
| <img src="https://github.com/TageYassir.png" width="40px;"/> | **Yassir Tagemouati** [@TageYassir](https://github.com/TageYassir) |

---

# QR_BlockChain (ChainClaim)

A QR-code + blockchain backed system for **tamper-evident incident/claim tracking**. The project generates QR codes that reference immutable records (claims + evidence) so anyone can verify integrity [...]

> This README is written and maintained by the project owner (single contributor listed above).

## Table of contents
- [Project overview](#project-overview)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Getting started (quick)](#getting-started-quick)
- [Usage examples](#usage-examples)
- [Smart contract notes](#smart-contract-notes)
- [Development & testing](#development--testing)
- [Security & privacy](#security--privacy)
- [Contributing](#contributing)
- [License](#license)
- [Contact](#contact)

## Project overview
QR_BlockChain provides a minimal, auditable pipeline to create (mint) and verify QR codes tied to immutable records. Typical uses:
- Product authenticity labels
- Event tickets
- Certifications / diplomas
- **Supply-chain / incident reporting** (claims + evidence) with verifiable QR references

Core idea
- **Mint / Create record:** compute a content hash (and optional metadata), store the hash + issuer on-chain (or emit an event), and generate a QR payload that encodes a verifiable reference (id, tx h[...]
- **Verify:** scan the QR, extract the reference, recompute/validate the hash or signature, and query the blockchain to confirm the record.

## Features
- Deterministic QR payload containing an on-chain reference and checksum.
- Minimal Solidity registry contract (id → record) with events for indexing.
- Offline-capable verifier flow: scan → compute → query RPC → show status.
- Example web UI (React) and CLI tooling (Node.js/TypeScript) for minting and verifying.
- IPFS integration pattern for storing richer metadata while committing only the content hash on-chain.
- **Claim workflow UI** for creating claims, uploading evidence, and viewing a global ledger of records.

## Tech stack
- Frontend: React (Vite) — verifier / claim UI (PWA-ready)
- Backend / API: Node.js + TypeScript
- Smart contracts: Solidity (Hardhat)
- Blockchain: Ethereum-compatible (local Hardhat, testnets, mainnet, or private chain)
- Storage: filesystem / object storage (and optional IPFS) for attachments & richer metadata
- QR libraries: qrcode, qrcode.react (or equivalents)
- Database (optional/implementation-specific): **Neo4j** for graph relationships (claims ↔ evidence ↔ locations)

## Architecture
1. Minting / record creation
   - Create metadata JSON and canonicalize it.
   - Compute `contentHash = keccak256(canonicalJSON)` (or SHA256 per your choice).
   - Submit a transaction to the Registry contract: `registerRecord(contentHash, metadataCID)`.
   - Generate a QR that includes `{chain, contract, recordId or txHash, signature}`.
2. Verification
   - Scan QR → parse payload.
   - Optionally fetch asset and recompute the hash.
   - Query the Registry contract to retrieve the stored `contentHash` and `issuer`.
   - Compare hashes and display result (**VALID / INVALID / NOT FOUND**).

## Getting started (quick)
Prerequisites
- Node.js 18+ and npm or yarn
- Hardhat (for local chain & contract development)
- An Ethereum JSON-RPC provider (Infura/Alchemy) for testnets or mainnet

Clone
```bash
git clone https://github.com/TageYassir/QR_BlockChain.git
cd QR_BlockChain
```

Install
```bash
npm install
# or
# yarn install
```

Environment
- Copy templates and set secrets in `.env` or `backend/.env` as needed.

Example `.env` entries
```bash
RPC_URL=https://eth-goerli.example
PRIVATE_KEY=0x...
INFURA_API_KEY=...
```

Run locally (recommended flow)
```bash
# start a local Hardhat node
npx hardhat node

# deploy contracts to local node
npx hardhat run --network localhost scripts/deploy.ts

# start backend (if applicable)
npm --prefix backend run start

# start web UI
npm --prefix packages/web run dev
```

## Usage examples
Minting (CLI example)
```bash
# build/compile scripts
npm run build

# run mint CLI (example path)
node dist/cli/mint.js --file ./assets/product.jpg --issuer "MyCompany"
```

Outputs
- PNG or data-URI of the QR code
- Transaction hash / on-chain record id
- Local metadata JSON written to `./out`

Verifying (web)
- Open the verifier app (`packages/web`)
- Use camera or upload to scan QR
- App queries the blockchain and shows a clear verification result with provenance details

## Smart contract notes
Minimal recommended `Record` struct (Solidity)
```solidity
struct Record {
  address issuer;
  bytes32 contentHash;
  uint256 timestamp;
  string metadataCID; // optional (IPFS)
}
```

Best practices
- Store only content hashes and small references on-chain; keep full metadata in IPFS.
- Emit events to enable efficient off-chain indexing (TheGraph or a simple indexer).
- Provide read-only view functions to fetch record details.

## Development & testing
Project layout (suggested)
- `/contracts` — Solidity contracts
- `/scripts` — deploy & helper scripts
- `/packages/web` — React verifier UI
- `/packages/cli` — CLI mint/verify tools

Run tests
```bash
npx hardhat test
```

Run lints
```bash
npm run lint
```

## Security & privacy
- Never commit private keys — use `.env` and secret managers.
- Canonicalize JSON metadata before hashing to avoid mismatches.
- Consider signing QR payloads with an issuer key to allow signature-based verification in addition to on-chain checks.
- Be mindful of PII: avoid storing personal data on-chain. Encrypt off-chain if required.
- Audit contracts before mainnet deployment.

## Contributing
This repository is maintained by a single contributor (listed at the top). If you fork or submit a PR I will review it. When opening PRs, include tests and update documentation.

## License
Choose a license for the repo (suggested: MIT). Add a `LICENSE` file to the repository.

## Contact
Yassir Tagemouati — https://github.com/TageYassir
