
import {
    time,
    loadFixture,
  } from "@nomicfoundation/hardhat-toolbox/network-helpers";
  import { expect } from "chai";
  import hre from "hardhat";
  
  import { Contract } from "ethers";
  import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
  
  import { bpsToGrowthPerSecond,calculateAdditionalYeildFactor  } from '../utils/utils.test'
import { token } from "../../typechain-types/@openzeppelin/contracts-upgradeable";
  
  describe("Integration Test", function () {
    let simpleYeildToken: Contract;
    let yeildCalculatorOracle: Contract;

    const tokenName: String = "testYeildToken";
    const tokenSymbol: String = "USDY"
  
    //equivalent to 5% APY (that is - after a year)
    const initialBps=500;
      
    const YEILD_SETTER_ROLE = "0xe7186397d6ae266f8d028c95434fc78b3933ac81510bc5cc9390392abe7da4c0"
    const MINTER_ROLE = "0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6"
    const BURNER_ROLE = "0x3c11d16cbaffd01df69ce1c404f6340ee057498f5f00246190ea54220576a848"
  
    let contractOwner: HardhatEthersSigner;
    let user1: HardhatEthersSigner;
    let user2: HardhatEthersSigner;
  
    async function deployAutoYeildTokenWithOracle() {
      const TokenFactory = await hre.ethers.getContractFactory("SimpleYeildToken");
      const OracleFactory = await hre.ethers.getContractFactory("YeildCalculatorOracle");

      const [owner, otherAccount] = await hre.ethers.getSigners();
      contractOwner = owner;
      const token = await hre.upgrades.deployProxy(TokenFactory, [tokenName, tokenSymbol, contractOwner.address]);
      const oracle = await hre.upgrades.deployProxy(OracleFactory, [initialBps,token.target]);

      await token.setOptionalYeildOracle(oracle.target);
  
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
  
      return {token,oracle};
    }
  
    this.beforeEach(async () => {
      const contracts = await loadFixture(deployAutoYeildTokenWithOracle);
      simpleYeildToken=contracts.token;
      yeildCalculatorOracle=contracts.oracle;
      await simpleYeildToken.grantRole(YEILD_SETTER_ROLE, contractOwner.address)
      await simpleYeildToken.grantRole(YEILD_SETTER_ROLE, yeildCalculatorOracle.target)
      await simpleYeildToken.grantRole(MINTER_ROLE, contractOwner.address)
      await simpleYeildToken.grantRole(BURNER_ROLE, contractOwner.address)
    })
  

    describe("Integration tests between both contracts", function () {

        it("Yeild factor increases correctly on transfers (with a apr change in between)", async function () {
           
            //100 tokens
            const tokenMintAmount: BigInt = BigInt("100000000000000000000");
           
            await simpleYeildToken.mint(user1.address, tokenMintAmount);

            const initYeildFactor = await simpleYeildToken.yeildFactor();

            //25 tokens
            const tokenTransferAmount: BigInt = BigInt("25000000000000000000");

            const lastYeildFactorUpdate=await simpleYeildToken.lastYeildFactorUpdate();
            const currGrowthPerSecond = await yeildCalculatorOracle.growthPerSecond();

            const timeIncrease = 60*60;//one hour after the last update
            const timeStampOfUpdateYeildFactorTx=lastYeildFactorUpdate+BigInt(timeIncrease).valueOf()

            const expectedAdditionalyeildFactor=calculateAdditionalYeildFactor(timeStampOfUpdateYeildFactorTx,lastYeildFactorUpdate,currGrowthPerSecond)
            await time.setNextBlockTimestamp(timeStampOfUpdateYeildFactorTx);

            //this causes an automatic yeild factor update
            await (simpleYeildToken.connect(user1) as Contract).transfer(user2.address, tokenTransferAmount)

            expect(await simpleYeildToken.yeildFactor()).to.be.equal(initYeildFactor+expectedAdditionalyeildFactor);
            expect(await simpleYeildToken.lastYeildFactorUpdate()).to.be.equal(timeStampOfUpdateYeildFactorTx)

            //bps goes down
            const newBps=200;
            await yeildCalculatorOracle.changeBps(newBps); //note: this actually does a updateYeildFactor too, but we're not checking that in this test

            const initYeildFactor2 = await simpleYeildToken.yeildFactor();
            const lastYeildFactorUpdate2=await simpleYeildToken.lastYeildFactorUpdate();
            const currGrowthPerSecond2 = await yeildCalculatorOracle.growthPerSecond();
            const timeStampOfUpdateYeildFactorTx2=lastYeildFactorUpdate2+BigInt(timeIncrease).valueOf()

            const expectedAdditionalyeildFactor2=calculateAdditionalYeildFactor(timeStampOfUpdateYeildFactorTx2,lastYeildFactorUpdate2,currGrowthPerSecond2)
            await time.setNextBlockTimestamp(timeStampOfUpdateYeildFactorTx2);

            //this causes an automatic yeild factor update
            await (simpleYeildToken.connect(user1) as Contract).transfer(user2.address, tokenTransferAmount)

            expect(await simpleYeildToken.yeildFactor()).to.be.equal(initYeildFactor2+expectedAdditionalyeildFactor2);
            expect(await simpleYeildToken.lastYeildFactorUpdate()).to.be.equal(timeStampOfUpdateYeildFactorTx2)

            
        })

    })
  })
  
  