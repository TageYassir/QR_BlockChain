# QR Blockchain (React + Express + Hardhat)

Quick starter with React (Vite), an Express backend, and Hardhat + Solidity.

Commands:

 - Install frontend deps: `npm install`
 - Install backend deps: `npm --prefix backend install`
- Run React dev server: `npm run dev`
- Run backend server: `npm run backend:start`
 - Run tests: `npm run test` (uses Hardhat)
 - Use Hardhat CLI: `npx hardhat compile|test|node`

VS Code extensions recommended are listed in `.vscode/extensions.json`.

## Environment variables

The live backend reads `backend/.env` when you start it from the `backend` folder. Use `backend/.env.example` as the template and copy it to `backend/.env` for local development.

- `PORT`: Backend port. Defaults to `4000`.
- `NEO4J_URI`: URI for the Neo4j database, for example `neo4j://127.0.0.1:7687`.
- `NEO4J_USER`: Neo4j username.
- `NEO4J_PASSWORD`: Neo4j password.

Security note: Keep real secrets out of example files and source control. Use a secrets manager or a local untracked `.env` file for actual credentials.
