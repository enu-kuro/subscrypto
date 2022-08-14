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
    const [owner, account1, account2, account3, account4, account5] =
      await ethers.getSigners();

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
    // TODO:
    // const { subscrypto, token, account1 } = await loadFixture(deployFixture);
    // // require unlimited token allowance...
    // await token
    //   .connect(account1)
    //   .approve(subscrypto.address, ethers.constants.MaxUint256);
    // await expect(subscrypto.connect(account1).subscribe()).to.be.revertedWith(
    //   "Already subscribed"
    // );
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

    const targets = (
      await subscrypto.connect(owner).getPaymentTargets()
    ).filter((target) => target !== ethers.constants.AddressZero);

    expect(targets.length).to.equal(2);

    await subscrypto.connect(owner).executePayment(targets);

    const targets2 = (
      await subscrypto.connect(owner).getPaymentTargets()
    ).filter((target) => target !== ethers.constants.AddressZero);

    expect(targets2.length).to.equal(0);
  });
});
