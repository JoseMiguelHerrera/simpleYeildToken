import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import hre from "hardhat";

import { Contract } from "ethers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

import { convertToCapital, convertToTokens } from './utils/utils.test'

describe("SimpleYieldToken", function () {
  let simpleYieldToken: Contract;

  const tokenName: String = "testYieldToken";
  const tokenSymbol: String = "USDY"

  //equivalent to 5% APY (that is - after a year)
  const fivePercentApyYieldFactor: BigInt = BigInt(1050000000000000000);

  const PERCENTAGE_FACTOR: BigInt = BigInt("1000000000000000000");

  const ZERO_ADDRESS: string = "0x0000000000000000000000000000000000000000";

  const YIELD_SETTER_ROLE = "0x758bc41875dda4b516e037a65c8a41169b46ef087a6de30515744317f0c5eeac"
  const MINTER_ROLE = "0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6"
  const BURNER_ROLE = "0x3c11d16cbaffd01df69ce1c404f6340ee057498f5f00246190ea54220576a848"

  let contractOwner: HardhatEthersSigner;
  let user1: HardhatEthersSigner;
  let user2: HardhatEthersSigner;

  async function deployAutoYieldToken() {
    const TokenFactory = await hre.ethers.getContractFactory("SimpleYieldToken");
    const [owner, otherAccount] = await hre.ethers.getSigners();
    contractOwner = owner;
    const token = await hre.upgrades.deployProxy(TokenFactory, [tokenName, tokenSymbol, contractOwner.address]);

    user1 = await hre.ethers.getImpersonatedSigner("0x0000000000000000000000000000000000000001");
    user2 = await hre.ethers.getImpersonatedSigner("0x0000000000000000000000000000000000000002");

    contractOwner.sendTransaction({
      to: user1.address,
      value: hre.ethers.WeiPerEther
    })

    contractOwner.sendTransaction({
      to: user2.address,
      value: hre.ethers.WeiPerEther
    })

    return token;
  }

  this.beforeEach(async () => {
    simpleYieldToken = await loadFixture(deployAutoYieldToken);
    await simpleYieldToken.grantRole(YIELD_SETTER_ROLE, contractOwner.address)
    await simpleYieldToken.grantRole(MINTER_ROLE, contractOwner.address)
    await simpleYieldToken.grantRole(BURNER_ROLE, contractOwner.address)
  })

  describe("Setters", function () {
    describe("Success", function () {

      it("Token is deployed successfully", async function () {
        expect(await simpleYieldToken.name()).to.equal(tokenName);
        expect(await simpleYieldToken.symbol()).to.equal(tokenSymbol);
        expect(await simpleYieldToken.yieldFactor()).to.equal(PERCENTAGE_FACTOR);
        expect(await simpleYieldToken.hasRole(await simpleYieldToken.DEFAULT_ADMIN_ROLE(), contractOwner.address)).to.equal(true);
        expect(await simpleYieldToken.totalSupply()).to.equal(0);
        expect(await simpleYieldToken.totalCapital()).to.equal(0);
        expect(await simpleYieldToken.decimals()).to.equal(18);
        expect(await simpleYieldToken.optionalYieldCalculatorOracle()).to.equal(ZERO_ADDRESS);
      })

      it("Successfully sets yield factor ", async function () {
        await simpleYieldToken.setYieldFactor(fivePercentApyYieldFactor);
        expect(await simpleYieldToken.yieldFactor()).to.equal(fivePercentApyYieldFactor);
      })

      it("Successfully adds to yield factor ", async function () {
        //equivalent to 5% APY (that is - after a year)
        const additionalYieldFactor: BigInt = BigInt("50000000000000000")
        await simpleYieldToken.addToYieldFactor(additionalYieldFactor);
        expect(await simpleYieldToken.yieldFactor()).to.equal(BigInt("1050000000000000000"));
      })

      it("Successfully sets optional yield oracle ", async function () {
        await simpleYieldToken.setOptionalYieldOracle(user1.address);
        expect(await simpleYieldToken.optionalYieldCalculatorOracle()).to.equal(user1.address);
      })
    })

    describe("Failure", function () {
      it("fails to add to yield factor -adding zero", async function () {
        //equivalent to 5% APY (that is - after a year)
        const additionalYieldFactor: BigInt = BigInt("0")

        await expect(simpleYieldToken.addToYieldFactor(additionalYieldFactor)).to.revertedWithCustomError(simpleYieldToken, "InvalidYieldFactor")
      })

      it("fails set yield factor - number smaller than 1e18 would be deflation", async function () {
        const yieldFactorTooLow: BigInt = BigInt("500000000000000000")

        await expect(simpleYieldToken.setYieldFactor(yieldFactorTooLow)).to.revertedWithCustomError(simpleYieldToken, "InvalidYieldFactor")
      })
    })
  })

  describe("Convert between token and internal capital", function () {
    //equivalent to 5% APY (that is - after a year)
    const newYieldFactor: BigInt = BigInt("1050000000000000000")

    it("Conversion from token to internal capital works", async function () {
      await simpleYieldToken.setYieldFactor(newYieldFactor);

      const withYield = BigInt("105000000000000000000");
      const initCapital = await simpleYieldToken.convertToCapital(withYield);

      //equivalent to 100$ (CAPITAL) 
      expect(initCapital).to.equal(BigInt("100000000000000000000"));
    })

    it("Conversion from internal capital to token works", async function () {
      await simpleYieldToken.setYieldFactor(newYieldFactor);
      //equivalent to 100$ (CAPITAL)
      const initCapital = BigInt("100000000000000000000");
      const withYield = await simpleYieldToken.convertToTokens(initCapital);

      //equivalent to 105$ (WITH YIELD) 
      expect(withYield).to.equal(BigInt("105000000000000000000"));
    })
  })

  describe("Minting", function () {
    describe("Success", function () {
      it("Minting works as expected", async function () {
        //scenario: user it minting for the first time at a point where rates are 5%
        //equivalent to 100 tokens/100USD
        const tokenMintAmount: BigInt = BigInt("100000000000000000000");
        const expectedCapitalAdded = convertToCapital(tokenMintAmount.valueOf(), fivePercentApyYieldFactor.valueOf());

        await simpleYieldToken.setYieldFactor(fivePercentApyYieldFactor);
        await simpleYieldToken.mint(user1.address, tokenMintAmount)

        expect(await simpleYieldToken.totalCapital()).to.equal(expectedCapitalAdded);
        expect(await simpleYieldToken.capitalOf(user1.address)).to.equal(expectedCapitalAdded);
        const expectedBalanceOfUser = convertToTokens(expectedCapitalAdded, fivePercentApyYieldFactor.valueOf())
        expect(await simpleYieldToken.balanceOf(user1.address)).to.equal(expectedBalanceOfUser);
        expect(await simpleYieldToken.totalSupply()).to.equal(expectedBalanceOfUser);
      })
    })

    describe("Failure", function () {
      it("Minting fails - invalid address passed", async function () {
        const tokenMintAmount: BigInt = BigInt("100000000000000000000");
        await expect(simpleYieldToken.mint(ZERO_ADDRESS, tokenMintAmount)).to.revertedWithCustomError(simpleYieldToken, "InvalidMintReceiver")
      })
    })
  })

  describe("Burning", function () {
    describe("Success", function () {
      it("Burning works as expected", async function () {
        //scenario: user it minting for the first time at a point where rates are 5%
        //equivalent to 100 tokens/100USD
        const tokenMintAmount: BigInt = BigInt("100000000000000000000");
        await simpleYieldToken.setYieldFactor(fivePercentApyYieldFactor);
        await simpleYieldToken.mint(user1.address, tokenMintAmount)

        //assume user decides to burn straight away, right after the mint.
        //simple example - yield factor stays the same for example.

        //equivalent to 50 tokens/50USD
        const tokenBurnAmount: BigInt = BigInt("50000000000000000000");

        const totalCapitalBeforeBurn = await simpleYieldToken.totalCapital();
        const userCapitalBeforeBurn = await simpleYieldToken.capitalOf(user1.address);

        await simpleYieldToken.burn(user1.address, tokenBurnAmount)

        const capitalToBurn = convertToCapital(tokenBurnAmount.valueOf(), fivePercentApyYieldFactor.valueOf());
        expect(await simpleYieldToken.totalCapital()).to.equal(totalCapitalBeforeBurn - capitalToBurn);
        expect(await simpleYieldToken.capitalOf(user1.address)).to.equal(userCapitalBeforeBurn - capitalToBurn);

        expect(await simpleYieldToken.balanceOf(user1.address)).to.equal(convertToTokens(userCapitalBeforeBurn -

 capitalToBurn, fivePercentApyYieldFactor.valueOf()));
        expect(await simpleYieldToken.totalSupply()).to.equal(convertToTokens(userCapitalBeforeBurn - capitalToBurn, fivePercentApyYieldFactor.valueOf()));
      })
    })

    describe("Failure", function () {
      it("Burning fails - not enough capital", async function () {
        //scenario: user it minting for the first time at a point where rates are 5%
        //equivalent to 100 tokens/100USD
        const tokenMintAmount: BigInt = BigInt("100000000000000000000");
        await simpleYieldToken.setYieldFactor(fivePercentApyYieldFactor);
        await simpleYieldToken.mint(user1.address, tokenMintAmount)

        //assume user decides to burn straight away, right after the mint.
        //simple example - yield factor stays the same for example.

        //equivalent to 101 tokens
        const tokenBurnAmount: BigInt = BigInt("100000000000000000001");

        await expect(simpleYieldToken.burn(user1.address, tokenBurnAmount)).to.revertedWithCustomError(simpleYieldToken, "InsufficientBurnBalance")
      })
    })
  })

  describe("Transfers", function () {
    describe("Success", function () {
      it("Transfers work as expected", async function () {
        //100 tokens
        const tokenMintAmount: BigInt = BigInt("100000000000000000000");

        await simpleYieldToken.setYieldFactor(fivePercentApyYieldFactor);
        await simpleYieldToken.mint(user1.address, tokenMintAmount)

        //assume that the transfer happens right away
        //50 tokens
        const tokenTransferAmount: BigInt = BigInt("50000000000000000000");

        const capitalToTransfer = convertToCapital(tokenTransferAmount.valueOf(), fivePercentApyYieldFactor.valueOf())

        const fromCapitalBeforeTransfer = await simpleYieldToken.capitalOf(user1.address);
        const toCapitalBeforeTransfer = await simpleYieldToken.capitalOf(user2.address);

        await (simpleYieldToken.connect(user1) as Contract).transfer(user2.address, tokenTransferAmount)

        expect(await simpleYieldToken.capitalOf(user1.address)).to.be.equal(fromCapitalBeforeTransfer - capitalToTransfer)
        expect(await simpleYieldToken.capitalOf(user2.address)).to.be.equal(toCapitalBeforeTransfer + capitalToTransfer)
      })
    })

    describe("Failure", function () {
      it("Transfers fail - from user has insufficient capital", async function () {
        //100 tokens
        const tokenMintAmount: BigInt = BigInt("100000000000000000000");

        await simpleYieldToken.setYieldFactor(fivePercentApyYieldFactor);
        await simpleYieldToken.mint(user1.address, tokenMintAmount)

        //101 tokens
        const tokenTransferAmount: BigInt = BigInt("101000000000000000000");

        await expect((simpleYieldToken.connect(user1) as Contract).transfer(user2.address, tokenTransferAmount)).to.be.revertedWithCustomError(simpleYieldToken, "ERC20InsufficientBalance")
      })

      it("Transfers fail - invalid to user", async function () {
        //100 tokens
        const tokenMintAmount: BigInt = BigInt("100000000000000000000");

        await simpleYieldToken.setYieldFactor(fivePercentApyYieldFactor);
        await simpleYieldToken.mint(user1.address, tokenMintAmount)

        //50 tokens
        const tokenTransferAmount: BigInt = BigInt("50000000000000000000");

        await expect((simpleYieldToken.connect(user1) as Contract).transfer(ZERO_ADDRESS, tokenTransferAmount)).to.be.revertedWithCustomError(simpleYieldToken, "ERC20InvalidReceiver")
      })
    })
  })

  describe("Approvals & transferFrom", function () {
    describe("Success", function () {
      it("Approve & transferFrom works as expected", async function () {
        //100 tokens
        const tokenMintAmount: BigInt = BigInt("100000000000000000000");

        await simpleYieldToken.setYieldFactor(fivePercentApyYieldFactor);
        await simpleYieldToken.mint(user1.address, tokenMintAmount)

        //assume that the transfer happens right away
        //50 tokens
        const tokenTransferAmount: BigInt = BigInt("50000000000000000000");

        const allowanceBeforeApproval = await simpleYieldToken.allowance(user1.address, contractOwner.address);

        await (simpleYieldToken.connect(user1) as Contract).approve(contractOwner.address, tokenTransferAmount);

        expect(await await simpleYieldToken.allowance(user1.address, contractOwner.address)).to.be.equal(allowanceBeforeApproval + tokenTransferAmount)

        const capitalToTransfer = convertToCapital(tokenTransferAmount.valueOf(), fivePercentApyYieldFactor.valueOf())

        const fromCapitalBeforeTransfer = await simpleYieldToken.capitalOf(user1.address);
        const toCapitalBeforeTransfer = await simpleYieldToken.capitalOf(user2.address);

        const allowanceBeforeTransferFrom = await simpleYieldToken.allowance(user1.address, contractOwner.address);

        await (simpleYieldToken.connect(contractOwner) as Contract).transferFrom(user1.address, user2.address, tokenTransferAmount)

        expect(await await simpleYieldToken.allowance(user1.address, contractOwner.address)).to.be.equal(allowanceBeforeTransferFrom - tokenTransferAmount.valueOf())

        expect(await simpleYieldToken.capitalOf(user1.address)).to.be.equal(fromCapitalBeforeTransfer - capitalToTransfer)
        expect(await simpleYieldToken.capitalOf(user2.address)).to.be.equal(toCapitalBeforeTransfer + capitalToTransfer)
      })

      it("Approve & transferFrom works as expected (infinite allowance)", async function () {
        const infiniteAllowance = BigInt("115792089237316195423570985008687907853269984665640564039457584007913129639935")

        //100 tokens
        const tokenMintAmount: BigInt = BigInt("100000000000000000000");

        await simpleYieldToken.setYieldFactor(fivePercentApyYieldFactor);
        await simpleYieldToken.mint(user1.address, tokenMintAmount)

        //assume that the transfer happens right away
        //50 tokens
        const tokenTransferAmount: BigInt = BigInt("50000000000000000000");

        //approve infinite
        await (simpleYieldToken.connect(user1) as Contract).approve(contractOwner.address, infiniteAllowance);

        expect(await await simpleYieldToken.allowance(user1.address, contractOwner.address)).to.be.equal(infiniteAllowance)

        const capitalToTransfer = convertToCapital(tokenTransferAmount.valueOf(), fivePercentApyYieldFactor.valueOf())

        const fromCapitalBeforeTransfer = await simpleYieldToken.capitalOf(user1.address);
        const toCapitalBeforeTransfer = await simpleYieldToken.capitalOf(user2.address);

        await (simpleYieldToken.connect(contractOwner) as Contract).transferFrom(user1.address, user2.address, tokenTransferAmount)

        //with infinite allowance, it doesn't go down after a transferFrom
        expect(await await simpleYieldToken.allowance(user1.address, contractOwner.address)).to.be.equal(infiniteAllowance)

        expect(await simpleYieldToken.capitalOf(user1.address)).to.be.equal(fromCapitalBeforeTransfer - capitalToTransfer)
        expect(await simpleYieldToken.capitalOf(user2.address)).to.be.equal(toCapitalBeforeTransfer + capitalToTransfer)
      })

      it("Increase/Decrease allowance works as expected", async function () {
        //assume that the transfer happens right away
        //50 tokens
        const allowanceIncreaseAmount: BigInt = BigInt("50000000000000000000");

        const allowanceBeforeApproval = await simpleYieldToken.allowance(user1.address, contractOwner.address);

        await (simpleYieldToken.connect(user1) as Contract).increaseAllowance(contractOwner.address, allowanceIncreaseAmount);

        expect(await await simpleYieldToken.allowance(user1.address, contractOwner.address)).to.be.equal(allowanceBeforeApproval + allowanceIncreaseAmount)

        const allowanceDecreaseAmount: BigInt = BigInt("10000000000000000000");

        await (simpleYieldToken.connect(user1) as Contract).decreaseAllowance(contractOwner.address, allowanceDecreaseAmount);

        expect(await await simpleYieldToken.allowance(user1.address, contractOwner.address)).to.be.equal(allowanceBeforeApproval + allowanceIncreaseAmount - allowanceDecreaseAmount.valueOf())
      })
    })

    describe("Failure", function () {
      it("Approval fails - zero address (spender)", async function () {
        //100 tokens
        const tokenMintAmount: BigInt = BigInt("100000000000000000000");

        await simpleYieldToken.setYieldFactor(fivePercentApyYieldFactor);
        await simpleYieldToken.mint(user1.address, tokenMintAmount)

        //assume that the transfer happens right away
        //50 tokens
        const tokenTransferAmount: BigInt = BigInt("50000000000000000000");

        await expect((simpleYieldToken.connect(user1) as Contract).approve(ZERO_ADDRESS, tokenTransferAmount)).to.revertedWithCustomError(simpleYieldToken, "ERC20InvalidSpender")
      })

      it("transferFrom fails - not enough approved", async function () {
        //100 tokens
        const tokenMintAmount: BigInt = BigInt("100000000000000000000");

        await simpleYieldToken.setYieldFactor(fivePercentApyYieldFactor);
        await simpleYieldToken.mint(user1.address, tokenMintAmount)

        //assume that the transfer happens right away
        //50 tokens
        const tokenTransferAmount: BigInt = BigInt("50000000000000000000");

        await expect((simpleYieldToken.connect(contractOwner) as Contract

).transferFrom(user1.address, user2.address, tokenTransferAmount)).to.revertedWithCustomError(simpleYieldToken, "ERC20InsufficientAllowance")
      })

      it("Decrease fails - underflow detection", async function () {
        //assume that the transfer happens right away
        //50 tokens
        const allowanceIncreaseAmount: BigInt = BigInt("50000000000000000000");

        const allowanceBeforeApproval = await simpleYieldToken.allowance(user1.address, contractOwner.address);

        await (simpleYieldToken.connect(user1) as Contract).increaseAllowance(contractOwner.address, allowanceIncreaseAmount);

        expect(await await simpleYieldToken.allowance(user1.address, contractOwner.address)).to.be.equal(allowanceBeforeApproval + allowanceIncreaseAmount)

        const allowanceDecreaseAmount: BigInt = BigInt("60000000000000000000");

        await expect((simpleYieldToken.connect(user1) as Contract).decreaseAllowance(contractOwner.address, allowanceDecreaseAmount)).to.revertedWithCustomError(simpleYieldToken, "ERC20InsufficientAllowance")
      })
    })
  })
})
