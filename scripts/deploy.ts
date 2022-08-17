import { ethers } from "hardhat";
const PRICE = 10;
const INTERVAL = 60 * 60; //1 hour
// Binance USD on testnet
const TOKEN_ADDRESS = "0xeD24FC36d5Ee211Ea25A80239Fb8C4Cfd80f12Ee";

async function main() {
  const Subscrypto = await ethers.getContractFactory("Subscrypto");
  const subscrypto = await Subscrypto.deploy(TOKEN_ADDRESS, PRICE, INTERVAL);

  await subscrypto.deployed();

  console.log("Subscrypto deployed to:", subscrypto.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
