
import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import hre from "hardhat";

import { Contract } from "ethers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

import { convertToCapital, convertToTokens } from './utils/utils.test'


describe("SimpleYeildToken", function () {
  let simpleYeildToken: Contract;

  const tokenName: String = "testYeildToken";
  const tokenSymbol: String = "USDY"

  //equivalent to 5% APY (that is - after a year)
  const fivePercentApyYeildFactor: BigInt = BigInt(1050000000000000000);

  const PERCENTAGE_FACTOR: BigInt = BigInt("1000000000000000000");

  const ZERO_ADDRESS: string = "0x0000000000000000000000000000000000000000";

  const YEILD_SETTER_ROLE = "0xe7186397d6ae266f8d028c95434fc78b3933ac81510bc5cc9390392abe7da4c0"
  const MINTER_ROLE = "0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6"
  const BURNER_ROLE = "0x3c11d16cbaffd01df69ce1c404f6340ee057498f5f00246190ea54220576a848"

  let contractOwner: HardhatEthersSigner;
  let user1: HardhatEthersSigner;
  let user2: HardhatEthersSigner;

  async function deployAutoYeildToken() {
    const TokenFactory = await hre.ethers.getContractFactory("SimpleYeildToken");
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
    simpleYeildToken = await loadFixture(deployAutoYeildToken);
    await simpleYeildToken.grantRole(YEILD_SETTER_ROLE, contractOwner.address)
    await simpleYeildToken.grantRole(MINTER_ROLE, contractOwner.address)
    await simpleYeildToken.grantRole(BURNER_ROLE, contractOwner.address)
  })

  describe("Setters", function () {
    describe("Success", function () {

      it("Token is deployed successfully", async function () {
        expect(await simpleYeildToken.name()).to.equal(tokenName);
        expect(await simpleYeildToken.symbol()).to.equal(tokenSymbol);
        expect(await simpleYeildToken.yeildFactor()).to.equal(PERCENTAGE_FACTOR);
        expect(await simpleYeildToken.hasRole(await simpleYeildToken.DEFAULT_ADMIN_ROLE(), contractOwner.address)).to.equal(true);
        expect(await simpleYeildToken.totalSupply()).to.equal(0);
        expect(await simpleYeildToken.totalCapital()).to.equal(0);
        expect(await simpleYeildToken.decimals()).to.equal(18);
        expect(await simpleYeildToken.optionalYeildCalculatorOracle()).to.equal(ZERO_ADDRESS);
      })

      it("Successfully sets yeild factor ", async function () {
        await simpleYeildToken.setYeildFactor(fivePercentApyYeildFactor);
        expect(await simpleYeildToken.yeildFactor()).to.equal(fivePercentApyYeildFactor);
      })

      it("Successfully adds to yeild factor ", async function () {
        //equivalent to 5% APY (that is - after a year)
        const additionalYeildFactor: BigInt = BigInt("50000000000000000")
        await simpleYeildToken.addToYeildFactor(additionalYeildFactor);
        expect(await simpleYeildToken.yeildFactor()).to.equal(BigInt("1050000000000000000"));
      })

      it("Successfully sets optional yeild oracle ", async function () {

        await simpleYeildToken.setOptionalYeildOracle(user1.address);
        expect(await simpleYeildToken.optionalYeildCalculatorOracle()).to.equal(user1.address);
      })

    })


    describe("Failure", function () {

      it("fails to add to yeild factor -adding zero", async function () {
        //equivalent to 5% APY (that is - after a year)
        const additionalYeildFactor: BigInt = BigInt("0")

        await expect(simpleYeildToken.addToYeildFactor(additionalYeildFactor)).to.revertedWithCustomError(simpleYeildToken, "InvalidYeildFactor")
      })

      it("fails set yeild factor - number smaller than 1e18 would be deflation", async function () {
        const yeildFactorTooLow: BigInt = BigInt("500000000000000000")

        await expect(simpleYeildToken.setYeildFactor(yeildFactorTooLow)).to.revertedWithCustomError(simpleYeildToken, "InvalidYeildFactor")
      })

    })

  })

  describe("Convert between token and internal capital", function () {
    //equivalent to 5% APY (that is - after a year)
    const newYeildFactor: BigInt = BigInt("1050000000000000000")

    it("Conversion from token to internal capital works", async function () {
      await simpleYeildToken.setYeildFactor(newYeildFactor);

      const withYeild = BigInt("105000000000000000000");
      const initCapital = await simpleYeildToken.convertToCapital(withYeild);

      //equivalent to 100$ (CAPITAL) 
      expect(initCapital).to.equal(BigInt("100000000000000000000"));
    })


    it("Conversion from interal capital to token works", async function () {
      await simpleYeildToken.setYeildFactor(newYeildFactor);
      //equivalent to 100$ (CAPITAL)
      const initCapital = BigInt("100000000000000000000");
      const withYeild = await simpleYeildToken.convertToTokens(initCapital);

      //equivalent to 105$ (WITH YEILD) 
      expect(withYeild).to.equal(BigInt("105000000000000000000"));
    })


  })

  describe("Minting", function () {
    describe("Success", function () {
      it("Minting works as expected", async function () {
        //scenario: user it minting for the first time at a point where rates are 5%
        //equivalent to 100 tokens/100USD
        const tokenMintAmount: BigInt = BigInt("100000000000000000000");
        const expectedCapitalAdded = convertToCapital(tokenMintAmount.valueOf(), fivePercentApyYeildFactor.valueOf());

        await simpleYeildToken.setYeildFactor(fivePercentApyYeildFactor);
        await simpleYeildToken.mint(user1.address, tokenMintAmount)

        expect(await simpleYeildToken.totalCapital()).to.equal(expectedCapitalAdded);
        expect(await simpleYeildToken.capitalOf(user1.address)).to.equal(expectedCapitalAdded);
        const expectedBalanceOfUser = convertToTokens(expectedCapitalAdded, fivePercentApyYeildFactor.valueOf())
        expect(await simpleYeildToken.balanceOf(user1.address)).to.equal(expectedBalanceOfUser);
        expect(await simpleYeildToken.totalSupply()).to.equal(expectedBalanceOfUser);

      })
    })

    describe("Failure", function () {
      it("Minting fails - invalid address passed", async function () {
        const tokenMintAmount: BigInt = BigInt("100000000000000000000");
        await expect(simpleYeildToken.mint(ZERO_ADDRESS, tokenMintAmount)).to.revertedWithCustomError(simpleYeildToken, "InvalidMintReceiver")
      })
    })

  })

  describe("Burning", function () {
    describe("Success", function () {
      it("Burning works as expected", async function () {

        //scenario: user it minting for the first time at a point where rates are 5%
        //equivalent to 100 tokens/100USD
        const tokenMintAmount: BigInt = BigInt("100000000000000000000");
        await simpleYeildToken.setYeildFactor(fivePercentApyYeildFactor);
        await simpleYeildToken.mint(user1.address, tokenMintAmount)

        //assume user decides to burn straight away, right after the mint.
        //simple example - yeild factor stays the same for example.

        //equivalent to 50 tokens/50USD
        const tokenBurnAmount: BigInt = BigInt("50000000000000000000");

        const totalCapitalBeforeBurn = await simpleYeildToken.totalCapital();
        const userCapitalBeforeBurn = await simpleYeildToken.capitalOf(user1.address);

        await simpleYeildToken.burn(user1.address, tokenBurnAmount)

        const capitalToBurn = convertToCapital(tokenBurnAmount.valueOf(), fivePercentApyYeildFactor.valueOf());
        expect(await simpleYeildToken.totalCapital()).to.equal(totalCapitalBeforeBurn - capitalToBurn);
        expect(await simpleYeildToken.capitalOf(user1.address)).to.equal(userCapitalBeforeBurn - capitalToBurn);

        expect(await simpleYeildToken.balanceOf(user1.address)).to.equal(convertToTokens(userCapitalBeforeBurn - capitalToBurn, fivePercentApyYeildFactor.valueOf()));
        expect(await simpleYeildToken.totalSupply()).to.equal(convertToTokens(userCapitalBeforeBurn - capitalToBurn, fivePercentApyYeildFactor.valueOf()));

      })
    })

    describe("Failure", function () {
      it("Burning fails - not enough capital", async function () {

        //scenario: user it minting for the first time at a point where rates are 5%
        //equivalent to 100 tokens/100USD
        const tokenMintAmount: BigInt = BigInt("100000000000000000000");
        await simpleYeildToken.setYeildFactor(fivePercentApyYeildFactor);
        await simpleYeildToken.mint(user1.address, tokenMintAmount)

        //assume user decides to burn straight away, right after the mint.
        //simple example - yeild factor stays the same for example.

        //equivalent to 101 tokens
        const tokenBurnAmount: BigInt = BigInt("100000000000000000001");

        await expect(simpleYeildToken.burn(user1.address, tokenBurnAmount)).to.revertedWithCustomError(simpleYeildToken, "InsufficientBurnBalance")

      })

    })

  })

  describe("Transfers", function () {

    describe("Success", function () {

      it("Transfers work as expected", async function () {
        //100 tokens
        const tokenMintAmount: BigInt = BigInt("100000000000000000000");

        await simpleYeildToken.setYeildFactor(fivePercentApyYeildFactor);
        await simpleYeildToken.mint(user1.address, tokenMintAmount)

        //assume that the transfer happens right away
        //50 tokens
        const tokenTransferAmount: BigInt = BigInt("50000000000000000000");

        const capitalToTransfer = convertToCapital(tokenTransferAmount.valueOf(), fivePercentApyYeildFactor.valueOf())

        const fromCapitalBeforeTransfer = await simpleYeildToken.capitalOf(user1.address);
        const toCapitalBeforeTransfer = await simpleYeildToken.capitalOf(user2.address);

        await (simpleYeildToken.connect(user1) as Contract).transfer(user2.address, tokenTransferAmount)

        expect(await simpleYeildToken.capitalOf(user1.address)).to.be.equal(fromCapitalBeforeTransfer - capitalToTransfer)
        expect(await simpleYeildToken.capitalOf(user2.address)).to.be.equal(toCapitalBeforeTransfer + capitalToTransfer)
      })
    })

    describe("Failure", function () {

      it("Transfers fail - from user has insufficient capital", async function () {
        //100 tokens
        const tokenMintAmount: BigInt = BigInt("100000000000000000000");

        await simpleYeildToken.setYeildFactor(fivePercentApyYeildFactor);
        await simpleYeildToken.mint(user1.address, tokenMintAmount)

        //101 tokens
        const tokenTransferAmount: BigInt = BigInt("101000000000000000000");

        await expect((simpleYeildToken.connect(user1) as Contract).transfer(user2.address, tokenTransferAmount)).to.be.revertedWithCustomError(simpleYeildToken, "ERC20InsufficientBalance")
      })

      it("Transfers fail - invalid to user", async function () {
        //100 tokens
        const tokenMintAmount: BigInt = BigInt("100000000000000000000");

        await simpleYeildToken.setYeildFactor(fivePercentApyYeildFactor);
        await simpleYeildToken.mint(user1.address, tokenMintAmount)

        //50 tokens
        const tokenTransferAmount: BigInt = BigInt("50000000000000000000");

        await expect((simpleYeildToken.connect(user1) as Contract).transfer(ZERO_ADDRESS, tokenTransferAmount)).to.be.revertedWithCustomError(simpleYeildToken, "ERC20InvalidReceiver")
      })
    })

  })

  describe("Approvals & transferFrom", function () {

    describe("Success", function () {

      it("Approve & transferFrom works as expected", async function () {

        //100 tokens
        const tokenMintAmount: BigInt = BigInt("100000000000000000000");

        await simpleYeildToken.setYeildFactor(fivePercentApyYeildFactor);
        await simpleYeildToken.mint(user1.address, tokenMintAmount)

        //assume that the transfer happens right away
        //50 tokens
        const tokenTransferAmount: BigInt = BigInt("50000000000000000000");

        const allowanceBeforeApproval = await simpleYeildToken.allowance(user1.address, contractOwner.address);

        await (simpleYeildToken.connect(user1) as Contract).approve(contractOwner.address, tokenTransferAmount);

        expect(await await simpleYeildToken.allowance(user1.address, contractOwner.address)).to.be.equal(allowanceBeforeApproval + tokenTransferAmount)

        const capitalToTransfer = convertToCapital(tokenTransferAmount.valueOf(), fivePercentApyYeildFactor.valueOf())

        const fromCapitalBeforeTransfer = await simpleYeildToken.capitalOf(user1.address);
        const toCapitalBeforeTransfer = await simpleYeildToken.capitalOf(user2.address);

        const allowanceBeforeTransferFrom = await simpleYeildToken.allowance(user1.address, contractOwner.address);

        await (simpleYeildToken.connect(contractOwner) as Contract).transferFrom(user1.address, user2.address, tokenTransferAmount)

        expect(await await simpleYeildToken.allowance(user1.address, contractOwner.address)).to.be.equal(allowanceBeforeTransferFrom - tokenTransferAmount.valueOf())

        expect(await simpleYeildToken.capitalOf(user1.address)).to.be.equal(fromCapitalBeforeTransfer - capitalToTransfer)
        expect(await simpleYeildToken.capitalOf(user2.address)).to.be.equal(toCapitalBeforeTransfer + capitalToTransfer)

      })

      it("Approve & transferFrom works as expected (infinite allowance)", async function () {

        const infiniteAllowance = BigInt("115792089237316195423570985008687907853269984665640564039457584007913129639935")

        //100 tokens
        const tokenMintAmount: BigInt = BigInt("100000000000000000000");

        await simpleYeildToken.setYeildFactor(fivePercentApyYeildFactor);
        await simpleYeildToken.mint(user1.address, tokenMintAmount)

        //assume that the transfer happens right away
        //50 tokens
        const tokenTransferAmount: BigInt = BigInt("50000000000000000000");

        //approve infinite
        await (simpleYeildToken.connect(user1) as Contract).approve(contractOwner.address, infiniteAllowance);

        expect(await await simpleYeildToken.allowance(user1.address, contractOwner.address)).to.be.equal(infiniteAllowance)

        const capitalToTransfer = convertToCapital(tokenTransferAmount.valueOf(), fivePercentApyYeildFactor.valueOf())

        const fromCapitalBeforeTransfer = await simpleYeildToken.capitalOf(user1.address);
        const toCapitalBeforeTransfer = await simpleYeildToken.capitalOf(user2.address);

        await (simpleYeildToken.connect(contractOwner) as Contract).transferFrom(user1.address, user2.address, tokenTransferAmount)

        //with infinite allowance, it doesn't go down after a transferFrom
        expect(await await simpleYeildToken.allowance(user1.address, contractOwner.address)).to.be.equal(infiniteAllowance)

        expect(await simpleYeildToken.capitalOf(user1.address)).to.be.equal(fromCapitalBeforeTransfer - capitalToTransfer)
        expect(await simpleYeildToken.capitalOf(user2.address)).to.be.equal(toCapitalBeforeTransfer + capitalToTransfer)

      })

      it("Increase/Decrease allowance works as expected", async function () {

        //assume that the transfer happens right away
        //50 tokens
        const allowanceIncreaseAmount: BigInt = BigInt("50000000000000000000");

        const allowanceBeforeApproval = await simpleYeildToken.allowance(user1.address, contractOwner.address);

        await (simpleYeildToken.connect(user1) as Contract).increaseAllowance(contractOwner.address, allowanceIncreaseAmount);

        expect(await await simpleYeildToken.allowance(user1.address, contractOwner.address)).to.be.equal(allowanceBeforeApproval + allowanceIncreaseAmount)

        const allowanceDecreaseAmount: BigInt = BigInt("10000000000000000000");

        await (simpleYeildToken.connect(user1) as Contract).decreaseAllowance(contractOwner.address, allowanceDecreaseAmount);

        expect(await await simpleYeildToken.allowance(user1.address, contractOwner.address)).to.be.equal(allowanceBeforeApproval + allowanceIncreaseAmount - allowanceDecreaseAmount.valueOf())

      })

    })

    describe("Failure", function () {

      it("Approval fails - zero address (spender)", async function () {

        //100 tokens
        const tokenMintAmount: BigInt = BigInt("100000000000000000000");

        await simpleYeildToken.setYeildFactor(fivePercentApyYeildFactor);
        await simpleYeildToken.mint(user1.address, tokenMintAmount)

        //assume that the transfer happens right away
        //50 tokens
        const tokenTransferAmount: BigInt = BigInt("50000000000000000000");

        await expect((simpleYeildToken.connect(user1) as Contract).approve(ZERO_ADDRESS, tokenTransferAmount)).to.revertedWithCustomError(simpleYeildToken, "ERC20InvalidSpender")

      })

      it("transferFrom fails - not enough approved", async function () {

        //100 tokens
        const tokenMintAmount: BigInt = BigInt("100000000000000000000");

        await simpleYeildToken.setYeildFactor(fivePercentApyYeildFactor);
        await simpleYeildToken.mint(user1.address, tokenMintAmount)

        //assume that the transfer happens right away
        //50 tokens
        const tokenTransferAmount: BigInt = BigInt("50000000000000000000");

        await expect((simpleYeildToken.connect(contractOwner) as Contract).transferFrom(user1.address, user2.address, tokenTransferAmount)).to.revertedWithCustomError(simpleYeildToken, "ERC20InsufficientAllowance")


      })

      it("Decrease fails - underflow detection", async function () {

        //assume that the transfer happens right away
        //50 tokens
        const allowanceIncreaseAmount: BigInt = BigInt("50000000000000000000");

        const allowanceBeforeApproval = await simpleYeildToken.allowance(user1.address, contractOwner.address);

        await (simpleYeildToken.connect(user1) as Contract).increaseAllowance(contractOwner.address, allowanceIncreaseAmount);

        expect(await await simpleYeildToken.allowance(user1.address, contractOwner.address)).to.be.equal(allowanceBeforeApproval + allowanceIncreaseAmount)

        const allowanceDecreaseAmount: BigInt = BigInt("60000000000000000000");

        await expect((simpleYeildToken.connect(user1) as Contract).decreaseAllowance(contractOwner.address, allowanceDecreaseAmount)).to.revertedWithCustomError(simpleYeildToken, "ERC20InsufficientAllowance")

      })

    })

  })


  describe("Scenarios", function () {

    //add a simple, but realistic scenario here
  })


})

