import {
    time,
    loadFixture,
  } from "@nomicfoundation/hardhat-toolbox/network-helpers";
  import { expect } from "chai";
  import hre from "hardhat";
  
  import { Contract } from "ethers";
  import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
  
  import { bpsToGrowthPerSecond, calculateAdditionalYieldFactor } from './utils/utils.test'
  
  describe("YieldCalculatorOracle", function () {
    let simpleYieldToken: Contract;
    let yieldCalculatorOracle: Contract;

    const tokenName: String = "testYieldToken";
    const tokenSymbol: String = "USDY"
  
    //equivalent to 5% APY (that is - after a year)
    const initialBps = 500;
      
    const YIELD_SETTER_ROLE = "0x758bc41875dda4b516e037a65c8a41169b46ef087a6de30515744317f0c5eeac"
    const MINTER_ROLE = "0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6"
    const BURNER_ROLE = "0x3c11d16cbaffd01df69ce1c404f6340ee057498f5f00246190ea54220576a848"
  
    let contractOwner: HardhatEthersSigner;
    let user1: HardhatEthersSigner;
    let user2: HardhatEthersSigner;
  
    async function deployAutoYieldTokenWithOracle() {
      const TokenFactory = await hre.ethers.getContractFactory("SimpleYieldToken");
      const OracleFactory = await hre.ethers.getContractFactory("YieldCalculatorOracle");

      const [owner, otherAccount] = await hre.ethers.getSigners();
      contractOwner = owner;
      const token = await hre.upgrades.deployProxy(TokenFactory, [tokenName, tokenSymbol, contractOwner.address]);
      const oracle = await hre.upgrades.deployProxy(OracleFactory, [initialBps, token.target]);

      await token.setOptionalYieldOracle(oracle.target);
  
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
  
      return { token, oracle };
    }
  
    this.beforeEach(async () => {
      const contracts = await loadFixture(deployAutoYieldTokenWithOracle);
      simpleYieldToken = contracts.token;
      yieldCalculatorOracle = contracts.oracle;
      await simpleYieldToken.grantRole(YIELD_SETTER_ROLE, contractOwner.address)
      await simpleYieldToken.grantRole(YIELD_SETTER_ROLE, yieldCalculatorOracle.target)
      await simpleYieldToken.grantRole(MINTER_ROLE, contractOwner.address)
      await simpleYieldToken.grantRole(BURNER_ROLE, contractOwner.address)
    })
  
    describe("Setters", function () {
      describe("Success", function () {
        it("Oracle is deployed successfully", async function () {
          expect(await yieldCalculatorOracle.token()).to.be.equal(simpleYieldToken.target)
          expect(await yieldCalculatorOracle.growthPerSecond()).to.be.equal(bpsToGrowthPerSecond(initialBps))
        })

        it("Apr can be changed successfully", async function () {
          const newBps = 700;
          await yieldCalculatorOracle.changeBps(newBps);
          expect(await yieldCalculatorOracle.growthPerSecond()).to.be.equal(bpsToGrowthPerSecond(newBps))
        })
      })

      describe("Failure", function () {
        it("Can't change bps - not owner", async function () {
          const newBps = 700;
          await expect((yieldCalculatorOracle.connect(user1) as Contract).changeBps(newBps)).to.revertedWith("Ownable: caller is not the owner")
        })
      })
    })

    describe("Yield factor gets updated correctly", function () {
      it("Yield factor increases correctly (60 seconds without update)", async function () {
        //apr is 5%
        const initYieldFactor = await simpleYieldToken.yieldFactor();

        const lastYieldFactorUpdate = await simpleYieldToken.lastYieldFactorUpdate();
        const currGrowthPerSecond = await yieldCalculatorOracle.growthPerSecond();

        const timeIncrease = 60;//one min after the last update
        const timeStampOfUpdateYieldFactorTx = lastYieldFactorUpdate + BigInt(timeIncrease).valueOf()

        const expectedAdditionalYieldFactor = calculateAdditionalYieldFactor(timeStampOfUpdateYieldFactorTx, lastYieldFactorUpdate, currGrowthPerSecond)
        await time.setNextBlockTimestamp(timeStampOfUpdateYieldFactorTx);
        await yieldCalculatorOracle.updateYieldFactor();

        expect(await simpleYieldToken.yieldFactor()).to.be.equal(initYieldFactor + expectedAdditionalYieldFactor);
        expect(await simpleYieldToken.lastYieldFactorUpdate()).to.be.equal(timeStampOfUpdateYieldFactorTx)
      })

      it("Yield factor increases correctly (one hour without update)", async function () {
        //apr is 5%
        const initYieldFactor = await simpleYieldToken.yieldFactor();

        const lastYieldFactorUpdate = await simpleYieldToken.lastYieldFactorUpdate();
        const currGrowthPerSecond = await yieldCalculatorOracle.growthPerSecond();

        const timeIncrease = 60 * 60;//one hour after the last update
        const timeStampOfUpdateYieldFactorTx = lastYieldFactorUpdate + BigInt(timeIncrease).valueOf()

        const expectedAdditionalYieldFactor = calculateAdditionalYieldFactor(timeStampOfUpdateYieldFactorTx, lastYieldFactorUpdate, currGrowthPerSecond)
        await time.setNextBlockTimestamp(timeStampOfUpdateYieldFactorTx);
        await yieldCalculatorOracle.updateYieldFactor();
        expect(await simpleYieldToken.yieldFactor()).to.be.equal(initYieldFactor + expectedAdditionalYieldFactor);
        expect(await simpleYieldToken.lastYieldFactorUpdate()).to.be.equal(timeStampOfUpdateYieldFactorTx)
      })

      it("Yield factor increases correctly (one year without update)", async function () {
        //apr is 5%
        const initYieldFactor = await simpleYieldToken.yieldFactor();

        const lastYieldFactorUpdate = await simpleYieldToken.lastYieldFactorUpdate();
        const currGrowthPerSecond = await yieldCalculatorOracle.growthPerSecond();

        const timeIncrease = 60 * 60 * 24 * 365;//one year after the last update, extreme example
        const timeStampOfUpdateYieldFactorTx = lastYieldFactorUpdate + BigInt(timeIncrease).valueOf()

        const expectedAdditionalYieldFactor = calculateAdditionalYieldFactor(timeStampOfUpdateYieldFactorTx, lastYieldFactorUpdate, currGrowthPerSecond)
        await time.setNextBlockTimestamp(timeStampOfUpdateYieldFactorTx);
        await yieldCalculatorOracle.updateYieldFactor();
        expect(await simpleYieldToken.yieldFactor()).to.be.equal(initYieldFactor + expectedAdditionalYieldFactor);
        expect(await simpleYieldToken.lastYieldFactorUpdate()).to.be.equal(timeStampOfUpdateYieldFactorTx)
      })

      it("Yield factor increases correctly (with an apr change in between)", async function () {
        //apr is 5%
        const initYieldFactor = await simpleYieldToken.yieldFactor();

        const lastYieldFactorUpdate = await simpleYieldToken.lastYieldFactorUpdate();
        const currGrowthPerSecond = await yieldCalculatorOracle.growthPerSecond();

        const timeIncrease = 60 * 60;//one hour after the last update
        const timeStampOfUpdateYieldFactorTx = lastYieldFactorUpdate + BigInt(timeIncrease).valueOf()

        const expectedAdditionalYieldFactor = calculateAdditionalYieldFactor(timeStampOfUpdateYieldFactorTx, lastYieldFactorUpdate, currGrowthPerSecond)
        await time.setNextBlockTimestamp(timeStampOfUpdateYieldFactorTx);
        await yieldCalculatorOracle.updateYieldFactor();
        expect(await simpleYieldToken.yieldFactor()).to.be.equal(initYieldFactor + expectedAdditionalYieldFactor);
        expect(await simpleYieldToken.lastYieldFactorUpdate()).to.be.equal(timeStampOfUpdateYieldFactorTx)

        //bps goes down
        const newBps = 200;
        await yieldCalculatorOracle.changeBps(newBps); //note: this actually does an updateYieldFactor too, but we're not checking that in this test

        const initYieldFactor2 = await simpleYieldToken.yieldFactor();
        const lastYieldFactorUpdate2 = await simpleYieldToken.lastYieldFactorUpdate();
        const currGrowthPerSecond2 = await yieldCalculatorOracle.growthPerSecond();
        const timeStampOfUpdateYieldFactorTx2 = lastYieldFactorUpdate2 + BigInt(timeIncrease).valueOf()

        const expectedAdditionalYieldFactor2 = calculateAdditionalYieldFactor(timeStampOfUpdateYieldFactorTx2, lastYieldFactorUpdate2, currGrowthPerSecond2)
        await time.setNextBlockTimestamp(timeStampOfUpdateYieldFactorTx2);
        await yieldCalculatorOracle.updateYieldFactor();

        expect(await simpleYieldToken.yieldFactor()).to.be.equal(initYieldFactor2 + expectedAdditionalYieldFactor2);
        expect(await simpleYieldToken.lastYieldFactorUpdate()).to.be.equal(timeStampOfUpdateYieldFactorTx2)
      })

      it("Yield factor increases correctly due to APR change", async function () {
        //apr is 5%
        const initYieldFactor = await

 simpleYieldToken.yieldFactor();

        const lastYieldFactorUpdate = await simpleYieldToken.lastYieldFactorUpdate();
        const currGrowthPerSecond = await yieldCalculatorOracle.growthPerSecond();

        const timeIncrease = 60 * 60 * 24 * 365;//one year after the last update, extreme example
        const timeStampOfUpdateYieldFactorTx = lastYieldFactorUpdate + BigInt(timeIncrease).valueOf()

        //increase bps
        const newBps = 700;

        const expectedAdditionalYieldFactor = calculateAdditionalYieldFactor(timeStampOfUpdateYieldFactorTx, lastYieldFactorUpdate, currGrowthPerSecond)
        await time.setNextBlockTimestamp(timeStampOfUpdateYieldFactorTx);

        await yieldCalculatorOracle.changeBps(newBps);

        expect(await simpleYieldToken.yieldFactor()).to.be.equal(initYieldFactor + expectedAdditionalYieldFactor);

        expect(await simpleYieldToken.lastYieldFactorUpdate()).to.be.equal(timeStampOfUpdateYieldFactorTx)
      })
    })
  })

