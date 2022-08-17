import { ethers } from "hardhat";

// Binance USD on testnet
const TOKEN_ADDRESS = "0xeD24FC36d5Ee211Ea25A80239Fb8C4Cfd80f12Ee";
const CONTRACT_ADDRESS = "0x71073366a8B61b1b6634554a9e24cd07B31CB7D4";
async function main() {
  const [owner] = await ethers.getSigners();

  const token = await ethers.getContractAt("ERC20Mock", TOKEN_ADDRESS);
  const subscrypto = await ethers.getContractAt("Subscrypto", CONTRACT_ADDRESS);
  await token
    .connect(owner)
    .approve(subscrypto.address, ethers.constants.MaxUint256);
  const subscribeTx = await subscrypto
    .connect(owner)
    .subscribe({ gasLimit: 250000 });
  await subscribeTx.wait();
  console.log("Subscribed!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
