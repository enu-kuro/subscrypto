import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { Subscrypto, ERC20Mock } from "../typechain-types";

const PRICE = 10;
const INTERVAL = 86400 * 30; // 30日
const SUBSCRIBER_TOKEN_AMOUNT = 10000000;

export async function deploy(contractName: string, ...args: any[]) {
  const Factory = await ethers.getContractFactory(contractName);
  const instance = await Factory.deploy(...args);
  return instance.deployed();
}

describe("Subscrypto", function () {
  async function deployFixture() {
    const [
      owner,
      account1,
      account2,
      account3,
      account4,
      account5,
      chainlinkAccount,
    ] = await ethers.getSigners();

    const token = (await deploy(
      "ERC20Mock",
      "MockToken",
      "MKT",
      account1.address,
      SUBSCRIBER_TOKEN_AMOUNT
    )) as ERC20Mock;
    await token.mint(account2.address, SUBSCRIBER_TOKEN_AMOUNT);
    await token.mint(account3.address, SUBSCRIBER_TOKEN_AMOUNT);
    await token.mint(account4.address, SUBSCRIBER_TOKEN_AMOUNT);
    await token.mint(chainlinkAccount.address, SUBSCRIBER_TOKEN_AMOUNT);

    const subscrypto = (await deploy(
      "Subscrypto",
      token.address,
      PRICE,
      INTERVAL
    )) as Subscrypto;

    return {
      subscrypto,
      token,
      owner,
      account1,
      account2,
      account3,
      account4,
      account5,
      chainlinkAccount,
    };
  }

  it("Subscribe", async function () {
    const { subscrypto, token, account1 } = await loadFixture(deployFixture);

    // require unlimited token allowance...
    await token
      .connect(account1)
      .approve(subscrypto.address, ethers.constants.MaxUint256);

    await subscrypto.connect(account1).subscribe();

    expect(await subscrypto.subscriberAddresses(0)).to.equal(account1.address);

    expect((await subscrypto.subscribers(account1.address)).count).to.equal(1);
  });

  it("Subscribe should fail with 'ERC20: insufficient allowance'", async function () {
    const { subscrypto, token, account1 } = await loadFixture(deployFixture);
    await expect(subscrypto.connect(account1).subscribe()).to.be.revertedWith(
      "ERC20: insufficient allowance"
    );
  });

  it("Subscribe should fail with 'ERC20: transfer amount exceeds balance'", async function () {
    const { subscrypto, token, account5 } = await loadFixture(deployFixture);
    await token
      .connect(account5)
      .approve(subscrypto.address, ethers.constants.MaxUint256);
    await expect(subscrypto.connect(account5).subscribe()).to.be.revertedWith(
      "ERC20: transfer amount exceeds balance"
    );
  });

  it("Subscribe should fail with 'Already subscribed'", async function () {
    const { subscrypto, token, account1 } = await loadFixture(deployFixture);

    await token
      .connect(account1)
      .approve(subscrypto.address, ethers.constants.MaxUint256);
    await subscrypto.connect(account1).subscribe();

    await expect(subscrypto.connect(account1).subscribe()).to.be.revertedWith(
      "Already subscribed"
    );
  });

  it("ExecutePayment", async function () {
    const { subscrypto, token, owner, account1 } = await loadFixture(
      deployFixture
    );

    await token
      .connect(account1)
      .approve(subscrypto.address, ethers.constants.MaxUint256);

    const beforeBalance = await token
      .connect(account1)
      .balanceOf(account1.address);

    await subscrypto.connect(account1).subscribe();

    const timestamp = await time.latest();
    await time.increaseTo(timestamp + INTERVAL);

    await subscrypto.connect(owner).executePayment([account1.address]);

    await time.increaseTo(timestamp + INTERVAL * 2);

    await subscrypto.connect(owner).executePayment([account1.address]);

    const afterBalance = await token
      .connect(account1)
      .balanceOf(account1.address);

    expect(beforeBalance.sub(afterBalance).toNumber()).to.equal(PRICE * 3);
  });

  it("ExecutePayment should fail with 'Already paid'", async function () {
    const { subscrypto, token, owner, account1 } = await loadFixture(
      deployFixture
    );

    await token
      .connect(account1)
      .approve(subscrypto.address, ethers.constants.MaxUint256);

    await subscrypto.connect(account1).subscribe();

    const timestamp = await time.latest();
    await time.increaseTo(timestamp + INTERVAL);

    await subscrypto.connect(owner).executePayment([account1.address]);
    // 課金有効化1秒前
    await time.increaseTo(timestamp + INTERVAL * 2 - 1);

    await expect(
      subscrypto.connect(owner).executePayment([account1.address])
    ).to.be.revertedWith("Already paid");
  });

  it("ExecutePayment should fail with 'user not found'", async function () {
    const { subscrypto, token, owner, account1, account2 } = await loadFixture(
      deployFixture
    );

    await token
      .connect(account1)
      .approve(subscrypto.address, ethers.constants.MaxUint256);

    await subscrypto.connect(account1).subscribe();

    const timestamp = await time.latest();
    await time.increaseTo(timestamp + INTERVAL);

    // subscribeしていないaddressに対して課金実行
    await expect(
      subscrypto.connect(owner).executePayment([account2.address])
    ).to.be.revertedWith("user not found");
  });

  it("GetPaymentTargets", async function () {
    const { subscrypto, token, owner, account1, account2, account3 } =
      await loadFixture(deployFixture);

    await token
      .connect(account1)
      .approve(subscrypto.address, ethers.constants.MaxUint256);
    await token
      .connect(account2)
      .approve(subscrypto.address, ethers.constants.MaxUint256);

    await subscrypto.connect(account1).subscribe();
    await subscrypto.connect(account2).subscribe();

    const timestamp = await time.latest();
    // +1しないとaccount2がtargetにならない。test時のblocktimeの細かい挙動が不明。
    await time.increaseTo(timestamp + INTERVAL + 1);

    await token
      .connect(account3)
      .approve(subscrypto.address, ethers.constants.MaxUint256);
    await subscrypto.connect(account3).subscribe();

    const targets = await subscrypto.connect(owner).getPaymentTargets();

    expect(targets.length).to.equal(2);

    await subscrypto.connect(owner).executePayment(targets);

    const targets2 = (
      await subscrypto.connect(owner).getPaymentTargets()
    ).filter((target) => target !== ethers.constants.AddressZero);

    expect(targets2.length).to.equal(0);
  });

  it("CancelSubscription", async function () {
    const { subscrypto, token, account1 } = await loadFixture(deployFixture);
    await token
      .connect(account1)
      .approve(subscrypto.address, ethers.constants.MaxUint256);

    await subscrypto.connect(account1).subscribe();
    expect(await subscrypto.subscriberAddresses(0)).to.equal(account1.address);

    await subscrypto.connect(account1).cancelSubscription(account1.address);
    expect(await subscrypto.subscriberAddresses(0)).to.equal(
      ethers.constants.AddressZero
    );
    // revoke
    await token.connect(account1).approve(subscrypto.address, 0);
  });

  it("CancelSubscription should fail with 'only sbscriber or owner can cencel subscriptions", async function () {
    const { subscrypto, token, account1, account2 } = await loadFixture(
      deployFixture
    );
    await token
      .connect(account1)
      .approve(subscrypto.address, ethers.constants.MaxUint256);

    await subscrypto.connect(account1).subscribe();

    await expect(
      subscrypto.connect(account2).cancelSubscription(account1.address)
    ).to.be.revertedWith("only sbscriber or owner can cencel subscriptions");
  });

  it("WithdrawToken", async function () {
    const { subscrypto, token, owner, account1, account2 } = await loadFixture(
      deployFixture
    );

    await token
      .connect(account1)
      .approve(subscrypto.address, ethers.constants.MaxUint256);
    await token
      .connect(account2)
      .approve(subscrypto.address, ethers.constants.MaxUint256);

    await subscrypto.connect(account1).subscribe();
    await subscrypto.connect(account2).subscribe();

    const balance = await token.balanceOf(subscrypto.address);
    await subscrypto.connect(owner).withdrawToken(balance);

    expect(await token.balanceOf(owner.address)).to.equal(PRICE * 2);
  });

  it("WithdrawToken should fail with 'Ownable: caller is not the owner'", async function () {
    const { subscrypto, token, owner, account1, account2, account3 } =
      await loadFixture(deployFixture);
    await token
      .connect(account1)
      .approve(subscrypto.address, ethers.constants.MaxUint256);
    await subscrypto.connect(account1).subscribe();

    const balance = await token.balanceOf(subscrypto.address);
    await expect(
      subscrypto.connect(account1).withdrawToken(balance)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("Chainlink keepers", async function () {
    const { subscrypto, token, owner, account1, chainlinkAccount } =
      await loadFixture(deployFixture);

    const beforeBalance = await token
      .connect(account1)
      .balanceOf(account1.address);

    await token
      .connect(account1)
      .approve(subscrypto.address, ethers.constants.MaxUint256);
    await subscrypto.connect(account1).subscribe();

    const [upkeepNeededFalse] = await subscrypto
      .connect(chainlinkAccount)
      .checkUpkeep([]);
    expect(upkeepNeededFalse).to.be.false;

    const timestamp = await time.latest();
    // ここも+1しないと課金有効にならない？
    await time.increaseTo(timestamp + INTERVAL + 1);

    const [upkeepNeeded, performData] = await subscrypto
      .connect(chainlinkAccount)
      .checkUpkeep([]);

    expect(upkeepNeeded).to.be.true;

    if (upkeepNeeded) {
      await subscrypto.connect(chainlinkAccount).performUpkeep(performData);
    }

    const afterBalance = await token
      .connect(account1)
      .balanceOf(account1.address);

    expect(beforeBalance.sub(afterBalance).toNumber()).to.equal(PRICE * 2);
  });
});
