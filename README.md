# QR Blockchain (React + Hardhat)

Quick starter with React (Vite) and Hardhat + Solidity.

Commands:

 - Install deps: `npm install`
 - Run React dev server: `npm run dev`
 - Run tests: `npm run test` (uses Hardhat)
 - Use Hardhat CLI: `npx hardhat compile|test|node`

VS Code extensions recommended are listed in `.vscode/extensions.json`.

## Environment variables

This project uses a `.env` file to store local configuration values used by the backend and deployment scripts. Add the following keys to `.env` when running locally:

- `NEO4J_URI`: URI for the Neo4j database (e.g. `neo4j://127.0.0.1:7687`). Used by the backend to connect to the Neo4j graph database.
- `NEO4J_USER`: Neo4j username. Used for database authentication.
- `NEO4J_PASSWORD`: Neo4j password. Used for database authentication.
- `WEB3_PROVIDER`: JSON-RPC URL for your Ethereum node (e.g. `http://127.0.0.1:8545`). Used by scripts and backend to talk to the blockchain.
- `CONTRACT_ABI_PATH`: Path to the compiled contract ABI/JSON. Used by frontend/backend code that needs the contract ABI.
- `SECRET_KEY`: Flask secret key (32-byte hex). Used to sign sessions and CSRF tokens in the Flask backend — keep this secret and do not commit it.
- `CONTRACT_ADDRESS`: Deployed contract address. Used by the frontend/backend to interact with the deployed `ClaimRegistry` contract.
- `RELAYER_PRIVATE_KEY`: Private key for the relayer account (prefund on your local node). Used to sign and send transactions from the relayer; keep this secret and do not commit it.

Security note: Storing private keys and secret keys in plaintext `.env` files is acceptable for local development only. For production, use a secure secrets manager or KMS.
