// hardhat.config.cjs
require("@nomiclabs/hardhat-ethers");

module.exports = {
  solidity: "0.8.17",
  paths: {
    // point Hardhat to your contracts folder
    sources: "backend/contracts",
    artifacts: "backend/artifacts"
  },
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545"
    }
  }
};