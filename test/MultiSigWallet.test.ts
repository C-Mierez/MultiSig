import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { Mock, MultiSigWallet } from "../typechain";

describe("MultiSigWallet", () => {
  let owner: SignerWithAddress;
  let signerA: SignerWithAddress;
  let signerB: SignerWithAddress;
  let signerC: SignerWithAddress;
  let signerD: SignerWithAddress;

  let signers: SignerWithAddress[];

  let multiSig: MultiSigWallet;
  let mock: Mock;

  const abiCoder = new ethers.utils.AbiCoder();

  beforeEach("Gather signers and Deploy", async () => {
    const [owner_, signerA_, signerB_, signerC_, signerD_, ...signers_] =
      await ethers.getSigners();

    owner = owner_;
    signerA = signerA_;
    signerB = signerB_;
    signerC = signerC_;
    signerD = signerD_;
    signers = signers_;

    multiSig = await (
      await ethers.getContractFactory("MultiSigWallet")
    ).deploy([signerA.address, signerB.address, signerC.address], 2);

    mock = await (await ethers.getContractFactory("Mock")).deploy();
  });

  describe("Deployment", () => {
    it("should deploy successfully", () => {
      expect(multiSig.address).to.exist;
    });

    it("should not deploy with empty owner list", async () => {
      let tx = (await ethers.getContractFactory("MultiSigWallet")).deploy(
        [],
        2
      );
      await expect(tx).to.be.revertedWith("ZeroOwners");
    });

    it("should not deploy with zero required approvals", async () => {
      let tx = (await ethers.getContractFactory("MultiSigWallet")).deploy(
        [signerA.address, signerB.address, signerC.address],
        0
      );
      await expect(tx).to.be.revertedWith("InvalidValue");
    });

    it("should not deploy with more approvals than owners", async () => {
      let owners = [signerA.address, signerB.address, signerC.address];
      let approvals = owners.length + 1;
      let tx = (await ethers.getContractFactory("MultiSigWallet")).deploy(
        owners,
        approvals
      );
      await expect(tx).to.be.revertedWith("InvalidValue");
    });
  });

  describe("Submit", () => {
    let calldata: string;

    beforeEach("Initialize calldata", () => {
      calldata = mock.interface.encodeFunctionData("add", [1]);
    });

    it("should be able to send a tx", async () => {
      await multiSig.connect(signerA).submit(mock.address, 0, calldata);

      const txData = await multiSig.s_transactions(0);
      expect(txData.to).to.eq(mock.address);
      expect(txData.value).to.eq(0);
      expect(txData.data).to.eq(calldata);

      await multiSig.connect(signerA).approve(0);
      await multiSig.connect(signerB).approve(0);

      expect(await mock.s_total()).to.eq(0);

      await multiSig.connect(signerA).execute(0);

      expect(await mock.s_total()).to.eq(1);
      expect((await multiSig.s_transactions(0)).executed).to.eq(true);
    });

    it("should only allow owners to submit", async () => {
      let tx = multiSig.connect(signerD).submit(mock.address, 0, calldata);

      await expect(tx).to.be.revertedWith("UnauthorizedCaller");
    });

    it("should emit a Submitted event", async () => {
      let tx = multiSig.connect(signerA).submit(mock.address, 0, calldata);

      await expect(tx).to.emit(multiSig, "Submitted");
    });
  });

  describe("Approve", () => {
    let calldata: string;

    beforeEach("Submit a tx", async () => {
      calldata = mock.interface.encodeFunctionData("add", [1]);
      await multiSig.connect(signerA).submit(mock.address, 0, calldata);
    });

    it("should be able to add an approval", async () => {
      expect(await multiSig.s_isApproved(0, signerA.address)).to.eq(false);

      await multiSig.connect(signerA).approve(0);

      expect(await multiSig.s_isApproved(0, signerA.address)).to.eq(true);
    });

    it("should not allow approving multiple times", async () => {
      expect(await multiSig.s_isApproved(0, signerA.address)).to.eq(false);

      await multiSig.connect(signerA).approve(0);

      expect(await multiSig.s_isApproved(0, signerA.address)).to.eq(true);

      let tx = multiSig.connect(signerA).approve(0);

      await expect(tx).to.be.revertedWith("InvalidTX");
    });

    it("should only allow owners to approve", async () => {
      expect(await multiSig.s_isOwner(signerD.address)).to.eq(false);

      let tx = multiSig.connect(signerD).approve(0);

      await expect(tx).to.be.revertedWith("UnauthorizedCaller");
    });

    it("should only approve txs that have not been executed", async () => {
      await multiSig.connect(signerA).approve(0);
      await multiSig.connect(signerB).approve(0);
      await multiSig.connect(signerC).approve(0);

      await multiSig.connect(signerA).execute(0);

      let tx = multiSig.connect(signerA).approve(0);

      await expect(tx).to.be.revertedWith("InvalidTX");
      expect((await multiSig.s_transactions(0)).executed).to.eq(true);
    });

    it("should emit an Approved event", async () => {
      let tx = multiSig.connect(signerA).approve(0);

      await expect(tx).to.emit(multiSig, "Approved");
    });
  });

  describe("Revoke", () => {
    let calldata: string;

    beforeEach("Submit a tx", async () => {
      calldata = mock.interface.encodeFunctionData("add", [1]);
      await multiSig.connect(signerA).submit(mock.address, 0, calldata);
    });

    beforeEach("Approve the tx", async () => {
      await multiSig.connect(signerA).approve(0);
      await multiSig.connect(signerB).approve(0);
      await multiSig.connect(signerC).approve(0);
    });

    it("should be able to revoke an approval", async () => {
      expect(await multiSig.s_isApproved(0, signerA.address)).to.eq(true);

      await multiSig.connect(signerA).revoke(0);

      expect(await multiSig.s_isApproved(0, signerA.address)).to.eq(false);
    });

    it("should not allow revoking multiple times", async () => {
      expect(await multiSig.s_isApproved(0, signerA.address)).to.eq(true);

      await multiSig.connect(signerA).revoke(0);

      expect(await multiSig.s_isApproved(0, signerA.address)).to.eq(false);

      let tx = multiSig.connect(signerA).revoke(0);

      await expect(tx).to.be.revertedWith("InvalidTX");
    });

    it("should only allow owners to revoke", async () => {
      expect(await multiSig.s_isOwner(signerD.address)).to.eq(false);

      let tx = multiSig.connect(signerD).revoke(0);

      await expect(tx).to.be.revertedWith("UnauthorizedCaller");
    });

    it("should only revoke txs that have not been executed", async () => {
      await multiSig.connect(signerA).execute(0);

      let tx = multiSig.connect(signerA).revoke(0);

      await expect(tx).to.be.revertedWith("InvalidTX");
      expect((await multiSig.s_transactions(0)).executed).to.eq(true);
    });

    it("should emit an Revoked event", async () => {
      let tx = multiSig.connect(signerA).revoke(0);

      await expect(tx).to.emit(multiSig, "Revoked");
    });
  });

  describe("Execute", () => {
    let calldata: string;

    beforeEach("Submit a tx", async () => {
      calldata = mock.interface.encodeFunctionData("add", [1]);
      await multiSig.connect(signerA).submit(mock.address, 0, calldata);
    });

    beforeEach("Approve the tx", async () => {
      await multiSig.connect(signerA).approve(0);
      await multiSig.connect(signerB).approve(0);
      await multiSig.connect(signerC).approve(0);
    });

    it("should be able to execute a tx", async () => {
      let approvals = 0;

      for (let signer of [signerA, signerB, signerC]) {
        approvals += (await multiSig.s_isApproved(0, signer.address)) ? 1 : 0;
      }

      expect(approvals).to.be.gte(await multiSig.s_requiredApprovals());
      expect(await mock.s_total()).to.eq(0);

      await multiSig.connect(signerA).execute(0);

      expect(await mock.s_total()).to.eq(1);
      expect((await multiSig.s_transactions(0)).executed).to.eq(true);
    });

    it("should not allow executing multiple times", async () => {
      expect(await mock.s_total()).to.eq(0);

      await multiSig.connect(signerA).execute(0);

      expect(await mock.s_total()).to.eq(1);
      expect((await multiSig.s_transactions(0)).executed).to.eq(true);

      let tx = multiSig.connect(signerA).execute(0);

      await expect(tx).to.be.revertedWith("InvalidTX");
      expect(await mock.s_total()).to.eq(1);
      expect((await multiSig.s_transactions(0)).executed).to.eq(true);
    });

    it("should only allow owners to execute", async () => {
      expect(await multiSig.s_isOwner(signerD.address)).to.eq(false);
      expect(await mock.s_total()).to.eq(0);

      let tx = multiSig.connect(signerD).execute(0);

      expect(await mock.s_total()).to.eq(0);
      await expect(tx).to.be.revertedWith("UnauthorizedCaller");
    });

    it("should only execute txs that have enough approvals", async () => {
      let approvals = 0;

      await multiSig.connect(signerB).revoke(0);
      await multiSig.connect(signerC).revoke(0);

      for (let signer of [signerA, signerB, signerC]) {
        approvals += (await multiSig.s_isApproved(0, signer.address)) ? 1 : 0;
      }

      expect(approvals).to.be.lte(await multiSig.s_requiredApprovals());

      let tx = multiSig.connect(signerA).execute(0);

      await expect(tx).to.be.revertedWith("NotEnoughApprovals");
    });
  });
});
