// scripts/deploy.cjs
const hre = require("hardhat");

async function main() {
  console.log("Compiling...");
  await hre.run("compile");

  console.log("Getting contract factory...");
  const ClaimRegistry = await hre.ethers.getContractFactory("ClaimRegistry");

  console.log("Deploying ClaimRegistry...");
  const claimRegistry = await ClaimRegistry.deploy();
  await claimRegistry.deployed();

  console.log("ClaimRegistry deployed to:", claimRegistry.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});