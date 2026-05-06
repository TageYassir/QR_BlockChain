// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

/// @title ClaimRegistry - stores minimal hashes & emits events for immutable evidence
/// @notice Keep on-chain storage minimal: bytes32 hashes and small uints, full media off-chain (IPFS/S3)
contract ClaimRegistry {
    struct Policy {
        address owner;
        uint256 issuedAt;
        bytes32 metadataHash;
        bool active;
    }

    struct Claim {
        uint256 policyId;
        address reporter;
        bytes32 evidenceHash;
        uint256 timestamp;
        // ipfsCid stored in event only (string is expensive on-chain)
    }

    mapping(uint256 => Policy) public policies;
    mapping(uint256 => Claim) public claims;
    uint256 public nextClaimId;

    event PolicyRegistered(uint256 indexed policyId, address indexed owner, bytes32 metadataHash, uint256 timestamp);
    event ClaimSubmitted(uint256 indexed claimId, uint256 indexed policyId, address indexed reporter, bytes32 evidenceHash, uint256 timestamp, string ipfsCid);
    event PolicyRevoked(uint256 indexed policyId, uint256 timestamp);

    /// @notice Register a new policy ID on-chain once by agent
    function registerPolicy(uint256 policyId, address owner, bytes32 metadataHash) external {
        require(policies[policyId].issuedAt == 0, "Policy already exists");
        policies[policyId] = Policy(owner, block.timestamp, metadataHash, true);
        emit PolicyRegistered(policyId, owner, metadataHash, block.timestamp);
    }

    /// @notice Submit a claim referencing a policy. ipfsCid is emitted for off-chain lookup.
    function submitClaim(uint256 policyId, bytes32 evidenceHash, string calldata ipfsCid) external returns (uint256) {
        require(policies[policyId].issuedAt != 0 && policies[policyId].active, "Invalid or inactive policy");
        nextClaimId += 1;
        uint256 claimId = nextClaimId;
        claims[claimId] = Claim(policyId, msg.sender, evidenceHash, block.timestamp);
        emit ClaimSubmitted(claimId, policyId, msg.sender, evidenceHash, block.timestamp, ipfsCid);
        return claimId;
    }

    /// @notice Revoke a policy (simple example). In production, restrict to authorized role.
    function revokePolicy(uint256 policyId) external {
        require(policies[policyId].issuedAt != 0, "Policy does not exist");
        policies[policyId].active = false;
        emit PolicyRevoked(policyId, block.timestamp);
    }

    /// @notice View helper (optional): returns owner and issuedAt
    function getPolicy(uint256 policyId) external view returns (address owner, uint256 issuedAt, bytes32 metadataHash, bool active) {
        Policy memory p = policies[policyId];
        return (p.owner, p.issuedAt, p.metadataHash, p.active);
    }
}