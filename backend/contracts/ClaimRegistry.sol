// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

/// @title ClaimRegistry - stores minimal hashes & emits events for immutable evidence
/// @notice Keep on-chain storage minimal: bytes32 hashes and small fields, full media off-chain (IPFS/S3)
contract ClaimRegistry {
    struct Policy {
        address owner;
        uint256 issuedAt;
        bytes32 metadataHash;
        bool active;
    }

    struct Claim {
        bytes32 policyHash;   // keccak256(policyId string)
        address reporter;
        bytes32 evidenceHash; // minimal evidence hash (e.g., keccak256 of IPFS CID or file hash)
        uint256 timestamp;
        address acceptor;     // acceptor wallet for this claim
        bool exists;
    }

    // Minimal mapping keyed by keccak256(caseId string)
    mapping(bytes32 => Policy) public policies;
    mapping(bytes32 => Claim) public claims;
    // optionally, track evidence existence by keccak256(evidenceId string)
    mapping(bytes32 => bool) public evidenceExists;

    event PolicyRegistered(string policyId, bytes32 indexed policyHash, address indexed owner, bytes32 metadataHash, uint256 timestamp);
    event PolicyRevoked(string policyId, bytes32 indexed policyHash, uint256 timestamp);

    // Emit original IDs (strings) for easy off-chain indexing and include hashed keys for on-chain queries.
    event ClaimSubmitted(
        string caseId,
        string policyId,
        bytes32 indexed caseHash,
        bytes32 indexed policyHash,
        address indexed reporter,
        bytes32 evidenceHash,
        uint256 timestamp,
        string ipfsCid,
        address acceptor
    );

    event EvidenceAdded(
        string evidenceId,
        string caseId,
        bytes32 indexed caseHash,
        address indexed submittedBy,
        bytes32 evidenceHash,
        uint256 timestamp,
        string ipfsCid,
        string linkedEvidenceId
    );

    /// @notice Register a new policy by ID string. No access control (public) as requested.
    function registerPolicy(string calldata policyId, address owner, bytes32 metadataHash) external {
        bytes32 policyHash = keccak256(bytes(policyId));
        require(policies[policyHash].issuedAt == 0, "Policy already exists");
        policies[policyHash] = Policy(owner, block.timestamp, metadataHash, true);
        emit PolicyRegistered(policyId, policyHash, owner, metadataHash, block.timestamp);
    }

    /// @notice Revoke a policy (public - no restriction)
    function revokePolicy(string calldata policyId) external {
        bytes32 policyHash = keccak256(bytes(policyId));
        require(policies[policyHash].issuedAt != 0, "Policy does not exist");
        policies[policyHash].active = false;
        emit PolicyRevoked(policyId, policyHash, block.timestamp);
    }

    /// @notice Submit a claim referencing a policy. Accepts readable IDs (strings) and keeps hashes on-chain
    /// @param caseId original case UUID/string used by backend (emitted for indexing)
    /// @param policyId original policy id string used by backend
    /// @param evidenceHash minimal bytes32 hash representing evidence (e.g. keccak256 of IPFS CID or file hash)
    /// @param ipfsCid optional IPFS CID emitted for off-chain lookups
    /// @param acceptor wallet allowed to add evidence/decisions for this claim
    function submitClaim(
        string calldata caseId,
        string calldata policyId,
        bytes32 evidenceHash,
        string calldata ipfsCid,
        address acceptor
    ) external returns (bytes32) {
        bytes32 caseHash = keccak256(bytes(caseId));
        require(!claims[caseHash].exists, "Claim already exists");

        bytes32 policyHash = keccak256(bytes(policyId));
        require(policies[policyHash].issuedAt != 0 && policies[policyHash].active, "Invalid or inactive policy");

        claims[caseHash] = Claim({
            policyHash: policyHash,
            reporter: msg.sender,
            evidenceHash: evidenceHash,
            timestamp: block.timestamp,
            acceptor: acceptor,
            exists: true
        });

        emit ClaimSubmitted(caseId, policyId, caseHash, policyHash, msg.sender, evidenceHash, block.timestamp, ipfsCid, acceptor);
        return caseHash;
    }

    /// @notice Add evidence for an existing claim. If this is a decision-evidence, only the stored acceptor can call it.
    /// @param caseId original case UUID/string
    /// @param evidenceId original evidence UUID/string
    /// @param evidenceHash bytes32 hash of the evidence (IPFS hash or keccak of the file)
    /// @param ipfsCid optional IPFS CID string
    /// @param linkedEvidenceId optional original evidenceId string this evidence links to
    function addEvidence(
        string calldata caseId,
        string calldata evidenceId,
        bytes32 evidenceHash,
        string calldata ipfsCid,
        string calldata linkedEvidenceId
    ) external returns (bytes32) {
        bytes32 caseHash = keccak256(bytes(caseId));
        require(claims[caseHash].exists, "Claim not found");

        // enforce acceptor-only for this on-chain evidence submission (backend must ensure wallet is connected)
        address acceptor = claims[caseHash].acceptor;
        require(acceptor != address(0), "No acceptor configured");
        require(msg.sender == acceptor, "Only configured acceptor can add on-chain evidence");

        bytes32 evidenceKey = keccak256(bytes(evidenceId));
        require(!evidenceExists[evidenceKey], "Evidence already added on-chain");
        evidenceExists[evidenceKey] = true;

        emit EvidenceAdded(evidenceId, caseId, caseHash, msg.sender, evidenceHash, block.timestamp, ipfsCid, linkedEvidenceId);
        return evidenceKey;
    }

    /// @notice Helper view: returns minimal claim info by original string hashed caseId
    function getClaimByCaseId(string calldata caseId) external view returns (bytes32 policyHash, address reporter, bytes32 evidenceHash, uint256 timestamp, address acceptor, bool exists) {
        bytes32 caseHash = keccak256(bytes(caseId));
        Claim memory c = claims[caseHash];
        return (c.policyHash, c.reporter, c.evidenceHash, c.timestamp, c.acceptor, c.exists);
    }

    /// @notice Helper view: check if evidence was published on chain by evidenceId
    function evidencePublished(string calldata evidenceId) external view returns (bool) {
        bytes32 evidenceKey = keccak256(bytes(evidenceId));
        return evidenceExists[evidenceKey];
    }
}