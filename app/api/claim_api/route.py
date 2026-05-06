# app/api/claim_api/route.py
import os
import json
import hashlib
import uuid
from flask import Blueprint, request, jsonify, current_app
from werkzeug.utils import secure_filename
from web3 import Web3
from eth_account import Account
import requests
from datetime import datetime

from app.api.neo4j_driver.driver import get_driver

claim_bp = Blueprint("claim_api", __name__, url_prefix="/api/v1")

# Helpers
def keccak256_bytes(data: bytes) -> str:
    return Web3.keccak(data).hex()

def load_contract(web3: Web3):
    addr = current_app.config.get("CONTRACT_ADDRESS")
    abi_path = current_app.config.get("CONTRACT_ABI_PATH")
    if not addr or not abi_path or not os.path.exists(abi_path):
        return None
    with open(abi_path) as f:
        abi = json.load(f)
    return web3.eth.contract(address=Web3.toChecksumAddress(addr), abi=abi)

def send_relay_transaction(function_name, args):
    """
    Build, sign and send transaction using relayer private key.
    Returns the transaction receipt (web3.py Receipt).
    """
    provider = current_app.config["WEB3_PROVIDER"]
    w3 = Web3(Web3.HTTPProvider(provider))
    contract = load_contract(w3)
    if contract is None:
        raise RuntimeError("Contract not configured or ABI missing")

    relayer_key = current_app.config.get("RELAYER_PRIVATE_KEY", "")
    if not relayer_key:
        raise RuntimeError("Relayer private key not set")

    acct = Account.from_key(relayer_key)
    func = getattr(contract.functions, function_name)(*args)
    nonce = w3.eth.get_transaction_count(acct.address)
    tx = func.buildTransaction({
        "from": acct.address,
        "nonce": nonce,
        "gas": 800000,
        "gasPrice": w3.toWei("10", "gwei")
    })
    signed = acct.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.rawTransaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
    return receipt

# Neo4j helpers for data operations
def create_or_update_policy_node(tx, policy_id: int, owner: str, metadata_hash: str):
    cypher = """
    MERGE (p:Policy {policy_id: $policy_id})
    SET p.owner = $owner, p.metadata_hash = $metadata_hash, p.issued_at = datetime(), p.active = true
    RETURN p.policy_id AS policy_id, p.owner AS owner, p.metadata_hash AS metadata_hash, p.issued_at AS issued_at, p.active AS active
    """
    return tx.run(cypher, policy_id=int(policy_id), owner=owner, metadata_hash=metadata_hash).single()

def create_claim_node(tx, claim_internal_id: str, policy_id: int, evidence_hash: str, ipfs_cid: str, reporter: str):
    cypher = """
    MATCH (p:Policy {policy_id: $policy_id})
    CREATE (c:Claim {
        claim_internal_id: $claim_internal_id,
        evidence_hash: $evidence_hash,
        ipfs_cid: $ipfs_cid,
        tx_hash: "",
        reporter: $reporter,
        created_at: datetime()
    })
    CREATE (c)-[:AGAINST]->(p)
    RETURN c.claim_internal_id AS claim_internal_id, c.evidence_hash AS evidence_hash, c.ipfs_cid AS ipfs_cid, c.reporter AS reporter, c.created_at AS created_at
    """
    return tx.run(cypher,
                  claim_internal_id=claim_internal_id,
                  policy_id=int(policy_id),
                  evidence_hash=evidence_hash,
                  ipfs_cid=ipfs_cid or "",
                  reporter=reporter).single()

def update_claim_tx_hash(tx, claim_internal_id: str, tx_hash: str):
    cypher = """
    MATCH (c:Claim {claim_internal_id: $claim_internal_id})
    SET c.tx_hash = $tx_hash
    RETURN c.claim_internal_id AS claim_internal_id, c.tx_hash AS tx_hash
    """
    return tx.run(cypher, claim_internal_id=claim_internal_id, tx_hash=tx_hash).single()

def get_claim_node(tx, claim_internal_id: str):
    cypher = """
    MATCH (c:Claim {claim_internal_id: $claim_internal_id})-[:AGAINST]->(p:Policy)
    RETURN c.claim_internal_id AS claim_internal_id, c.evidence_hash AS evidence_hash, c.ipfs_cid AS ipfs_cid, c.tx_hash AS tx_hash,
           c.reporter AS reporter, c.created_at AS created_at, p.policy_id AS policy_id, p.owner AS policy_owner
    """
    return tx.run(cypher, claim_internal_id=claim_internal_id).single()

def get_policy_node(tx, policy_id: int):
    cypher = """
    MATCH (p:Policy {policy_id: $policy_id})
    RETURN p.policy_id AS policy_id, p.owner AS owner, p.metadata_hash AS metadata_hash, p.issued_at AS issued_at, p.active AS active
    """
    return tx.run(cypher, policy_id=int(policy_id)).single()

# Routes
@claim_bp.route("/upload-evidence", methods=["POST"])
def upload_evidence():
    """
    Accepts multipart form:
      - files[]: photos
      - metadata: JSON with clientHashes: [{"filename":"a.jpg","hash":"0x..."}], policy_id, reporter, extras...
    Verifies client-provided hashes against uploaded file bytes.
    Optionally pins to web3.storage if WEB3_STORAGE_TOKEN set.
    Returns uploaded_cids list and a server receipt (HMAC-ish).
    """
    if "metadata" not in request.form:
        return jsonify({"error": "metadata missing"}), 400
    metadata = json.loads(request.form["metadata"])
    client_hashes = {item["filename"]: item["hash"] for item in metadata.get("clientHashes", [])}

    uploaded_cids = []
    file_objs = request.files.getlist("files")
    saved_files = []
    for f in file_objs:
        filename = secure_filename(f.filename)
        data = f.read()
        computed = keccak256_bytes(data)
        expected = client_hashes.get(filename)
        if expected and expected.lower().replace("0x", "") != computed.lower().replace("0x", ""):
            return jsonify({"error": f"hash mismatch for {filename}", "computed": computed, "expected": expected}), 400
        os.makedirs("uploads", exist_ok=True)
        path = os.path.join("uploads", filename)
        with open(path, "wb") as fh:
            fh.write(data)
        saved_files.append(path)

        token = current_app.config.get("WEB3_STORAGE_TOKEN")
        if token:
            headers = {"Authorization": f"Bearer {token}"}
            files = {"file": (filename, data)}
            r = requests.post("https://api.web3.storage/upload", headers=headers, files=files)
            if r.status_code in (200, 202):
                j = r.json()
                cid = j.get("cid")
            else:
                cid = None
        else:
            cid = None

        uploaded_cids.append({"filename": filename, "cid": cid, "local_path": path, "hash": computed})

    # create a server receipt (HMAC-like)
    server_secret = current_app.config.get("SECRET_KEY", "dev-secret")
    receipt_payload = {
        "policy_id": metadata.get("policy_id"),
        "reporter": metadata.get("reporter"),
        "files": uploaded_cids,
        "uploaded_at": datetime.utcnow().isoformat()
    }
    receipt_str = json.dumps(receipt_payload, sort_keys=True).encode()
    receipt_hash = hashlib.sha256(receipt_str + server_secret.encode()).hexdigest()
    return jsonify({"cids": uploaded_cids, "server_receipt": {"hash": receipt_hash, "payload": receipt_payload}})

@claim_bp.route("/submit-claim", methods=["POST"])
def submit_claim():
    """
    JSON payload:
    {
      "policy_id": 123,
      "evidence_hash": "0x....",
      "ipfs_cid": "bafy...",
      "reporter": "0x..."
    }
    Creates claim node in Neo4j, relays to chain, then updates claim node with tx_hash.
    Returns claim_internal_id and tx_hash.
    """
    data = request.get_json(force=True)
    policy_id = data.get("policy_id")
    evidence_hash = data.get("evidence_hash")
    ipfs_cid = data.get("ipfs_cid")
    reporter = data.get("reporter", "unknown")

    if not policy_id or not evidence_hash:
        return jsonify({"error": "policy_id and evidence_hash required"}), 400

    driver = get_driver()
    claim_internal_id = str(uuid.uuid4())

    # 1) Create claim node and relationship to policy (requires policy node to exist)
    with driver.session() as session:
        try:
            # ensure policy exists
            policy_node = session.execute_read(get_policy_node, policy_id=int(policy_id))
            if policy_node is None:
                return jsonify({"error": "policy_not_found"}), 404

            created = session.execute_write(create_claim_node, claim_internal_id, int(policy_id), evidence_hash, ipfs_cid, reporter)
            created_dict = dict(created) if created else {}
        except Exception as e:
            current_app.logger.exception("Neo4j create claim failed")
            return jsonify({"error": "neo4j_create_failed", "message": str(e)}), 500

    # 2) Relay to chain
    try:
        # send bytes for bytes32 param: web3 expects bytes-like for solidity bytes32 param if contract expects bytes32
        # Here the contract's submitClaim signature was (uint256 policyId, bytes32 evidenceHash, string ipfsCid)
        receipt = send_relay_transaction("submitClaim", [int(policy_id), Web3.toBytes(hexstr=evidence_hash), ipfs_cid or ""])
        tx_hash = receipt.transactionHash.hex()
    except Exception as e:
        current_app.logger.exception("Relay failed")
        tx_hash = None
        return jsonify({"error": "relay_failed", "message": str(e)}), 500

    # 3) Update claim node with tx_hash
    with driver.session() as session:
        try:
            updated = session.execute_write(update_claim_tx_hash, claim_internal_id, tx_hash)
        except Exception:
            current_app.logger.exception("Neo4j update tx failed")

    return jsonify({"status": "submitted", "claim_internal_id": claim_internal_id, "tx_hash": tx_hash}), 200

@claim_bp.route("/register-policy", methods=["POST"])
def register_policy():
    """
    JSON:
    {
      "policy_id": 123,
      "owner": "0xabc...",
      "metadata_hash": "0x..."
    }
    Creates/merges Policy node in Neo4j and relays registerPolicy to chain.
    """
    data = request.get_json(force=True)
    policy_id = data.get("policy_id")
    owner = data.get("owner")
    metadata_hash = data.get("metadata_hash", "0x0")

    if not policy_id or not owner:
        return jsonify({"error": "policy_id and owner required"}), 400

    driver = get_driver()
    with driver.session() as session:
        try:
            # create or update policy node
            res = session.execute_write(create_or_update_policy_node, int(policy_id), owner, metadata_hash)
            policy_info = dict(res) if res else {}
        except Exception as e:
            current_app.logger.exception("Neo4j policy create failed")
            return jsonify({"error": "neo4j_policy_failed", "message": str(e)}), 500

    # relay to chain
    try:
        receipt = send_relay_transaction("registerPolicy", [int(policy_id), owner, Web3.toBytes(hexstr=metadata_hash)])
        tx_hash = receipt.transactionHash.hex()
        return jsonify({"status": "registered", "tx_hash": tx_hash, "policy": policy_info}), 200
    except Exception as e:
        current_app.logger.exception("register failed")
        return jsonify({"error": "register_failed", "message": str(e)}), 500

@claim_bp.route("/claim/<string:claim_internal_id>", methods=["GET"])
def get_claim(claim_internal_id):
    driver = get_driver()
    with driver.session() as session:
        try:
            res = session.execute_read(get_claim_node, claim_internal_id)
            if not res:
                return jsonify({"error": "not found"}), 404
            row = dict(res)
            # convert datetime objects to ISO strings if necessary
            created_at = row.get("created_at")
            if created_at is not None:
                row["created_at"] = str(created_at)
            return jsonify(row)
        except Exception as e:
            current_app.logger.exception("get_claim failed")
            return jsonify({"error": "neo4j_read_failed", "message": str(e)}), 500

@claim_bp.route("/policy/<int:policy_id>", methods=["GET"])
def get_policy(policy_id):
    driver = get_driver()
    with driver.session() as session:
        try:
            res = session.execute_read(get_policy_node, int(policy_id))
            if not res:
                return jsonify({"error": "not found"}), 404
            row = dict(res)
            issued_at = row.get("issued_at")
            if issued_at is not None:
                row["issued_at"] = str(issued_at)
            return jsonify(row)
        except Exception as e:
            current_app.logger.exception("get_policy failed")
            return jsonify({"error": "neo4j_read_failed", "message": str(e)}), 500