import {
  Blockchain,
  BlockchainSnapshot,
  SandboxContract,
  TreasuryContract,
} from "@ton/sandbox";
import { beginCell, Cell, Dictionary, loadStateInit, toNano } from "@ton/core";
import {
  Action,
  deployMultisig,
  deployOrder,
  getMultisigConfig,
  approveOrder,
  MultisigConfig,
  OrderParams,
  tonTransferAction,
  getOrderConfig,
  getOrderAddressBySeqno,
} from "../src/index";
import * as OrderCode from "../src/contract/compiled/Order.compiled.json";
import { TestTonClient, ProcessExpectSuccess } from "./utils";

describe("ton blockchain", () => {
  let blockchain: Blockchain;
  let deployer: SandboxContract<TreasuryContract>;
  let signers: SandboxContract<TreasuryContract>[];
  let proposers: SandboxContract<TreasuryContract>[];
  let provider: TestTonClient;
  let blockchainReadyState: BlockchainSnapshot;
  let multisigConfig: MultisigConfig;

  beforeAll(async () => {
    blockchain = await Blockchain.create();

    const orderCodeRaw = Cell.fromHex(OrderCode.hex);
    const orderHash = orderCodeRaw.hash();
    const libsDict = Dictionary.empty(
      Dictionary.Keys.BigUint(256),
      Dictionary.Values.Cell(),
    );
    libsDict.set(BigInt(`0x${orderHash.toString("hex")}`), orderCodeRaw);
    const libsCell = beginCell().storeDictDirect(libsDict).endCell();
    blockchain.libs = libsCell;
    // const libHashed = beginCell().storeUint(2, 8).storeBuffer(orderHash).endCell();
    // const orderCode = new Cell({ exotic: true, bits: libHashed.bits, refs: libHashed.refs });

    deployer = await blockchain.treasury("deployer");
    signers = await blockchain.createWallets(5, {
      workchain: 0,
      predeploy: true,
      balance: toNano("100"),
    });
    proposers = await blockchain.createWallets(5, {
      workchain: 0,
      predeploy: true,
      balance: toNano("100"),
    });
    provider = new TestTonClient(blockchain);
    blockchainReadyState = blockchain.snapshot();
    multisigConfig = {
      threshold: 3,
      signers: signers.map((signer) => signer.address),
      proposers: proposers.map((proposer) => proposer.address),
      allowArbitrarySeqno: false,
    };
  });

  beforeEach(async () => {
    await blockchain.loadFrom(blockchainReadyState);
  });

  describe("deploy multisig", () => {
    it("should be successfully deployed", async () => {
      // step 1: create multisig config (already done in beforeAll)
      // step 2: create multisig contract deploy payloads
      const multisigContractPayload = deployMultisig(multisigConfig);
      expect(multisigContractPayload.stateInit).toBeDefined();

      // step 3: deploy multisig contract
      const transactions = await deployer.send({
        to: multisigContractPayload.sendToAddress,
        value: toNano("0.002"),
        body: multisigContractPayload.payload,
        init: loadStateInit(multisigContractPayload.stateInit!.beginParse()),
      });

      ProcessExpectSuccess.deployMultisig(transactions);
    });
  });

  describe("deploy order", () => {
    it("should be successfully deployed", async () => {
      // step 1: deploy multisig contract
      const multisigContractPayload = deployMultisig(multisigConfig);
      expect(multisigContractPayload.stateInit).toBeDefined();
      const transactions1 = await deployer.send({
        to: multisigContractPayload.sendToAddress,
        value: toNano("0.002"),
        body: multisigContractPayload.payload,
        init: loadStateInit(multisigContractPayload.stateInit!.beginParse()),
      });

      ProcessExpectSuccess.deployMultisig(transactions1);

      // step 2: fetch multisig config
      const multisigAddress = multisigContractPayload.sendToAddress;
      const multisigConfigRaw = await getMultisigConfig(
        provider,
        multisigAddress,
      );
      const multisigConfigLocal: MultisigConfig = multisigConfigRaw.toConfig();

      expect(multisigConfigLocal.threshold).toBe(multisigConfig.threshold);
      expect(multisigConfigLocal.signers.toString()).toEqual(
        multisigConfig.signers.toString(),
      );
      expect(multisigConfigLocal.proposers.toString()).toEqual(
        multisigConfig.proposers.toString(),
      );
      expect(multisigConfigLocal.allowArbitrarySeqno).toBe(
        multisigConfig.allowArbitrarySeqno,
      );

      // step 3: create action (ton transfer)
      const action: Action = tonTransferAction(deployer.address, toNano("1"));

      // step 4: create order params
      const orderParams: OrderParams = {
        multisigAddress: multisigAddress,
        orderSeqno: multisigConfigRaw.nextOrderSeqno,
        expirationDate: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // expires in 24 hours
      };

      // step 5: create multisig contract deploy payloads
      const orderDeployer = signers[0];
      const orderContractPayload = deployOrder(
        orderDeployer.address,
        orderParams,
        multisigConfig,
        [action],
      );

      // step 6: deploy order contract
      const transactions2 = await orderDeployer.send({
        to: orderContractPayload.sendToAddress,
        value: toNano("1.02"),
        body: orderContractPayload.payload,
      });

      ProcessExpectSuccess.deployOrder(transactions2);
    });
  });

  describe("approve order", () => {
    it("should be successfully approved", async () => {
      // step 1: deploy multisig contract
      const multisigContractPayload = deployMultisig(multisigConfig);
      expect(multisigContractPayload.stateInit).toBeDefined();
      const transactions1 = await deployer.send({
        to: multisigContractPayload.sendToAddress,
        value: toNano("0.002"),
        body: multisigContractPayload.payload,
        init: loadStateInit(multisigContractPayload.stateInit!.beginParse()),
      });

      ProcessExpectSuccess.deployMultisig(transactions1);

      // step 2: fetch multisig config
      const multisigAddress = multisigContractPayload.sendToAddress;
      const multisigConfigRaw = await getMultisigConfig(
        provider,
        multisigAddress,
      );
      const multisigConfigLocal: MultisigConfig = multisigConfigRaw.toConfig();

      expect(multisigConfigLocal.threshold).toBe(multisigConfig.threshold);
      expect(multisigConfigLocal.signers.toString()).toEqual(
        multisigConfig.signers.toString(),
      );
      expect(multisigConfigLocal.proposers.toString()).toEqual(
        multisigConfig.proposers.toString(),
      );
      expect(multisigConfigLocal.allowArbitrarySeqno).toBe(
        multisigConfig.allowArbitrarySeqno,
      );

      // step 3: create action (ton transfer)
      const action: Action = tonTransferAction(deployer.address, toNano("1"));

      // step 4: create order params
      const orderParams: OrderParams = {
        multisigAddress: multisigAddress,
        orderSeqno: multisigConfigRaw.nextOrderSeqno,
        expirationDate: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // expires in 24 hours
      };

      // step 5: create multisig contract deploy payloads
      const orderDeployer = signers[0];
      const orderContractPayload = deployOrder(
        orderDeployer.address,
        orderParams,
        multisigConfig,
        [action],
      );

      // step 6: deploy order contract
      const transactions2 = await orderDeployer.send({
        to: orderContractPayload.sendToAddress,
        value: toNano("1.02"),
        body: orderContractPayload.payload,
      });

      ProcessExpectSuccess.deployOrder(transactions2);

      // step 8: get order status
      const orderAddress = await getOrderAddressBySeqno(
        provider,
        multisigAddress,
        Number(multisigConfigRaw.nextOrderSeqno),
      );
      expect(orderAddress.toString()).toBe(
        transactions2.transactions[2].inMessage?.info.dest?.toString(),
      );

      const orderConfig = await getOrderConfig(provider, orderAddress);
      expect(orderConfig.approvals_num).toBe(1);
      expect(orderConfig.approvals[0]).toBe(true);
      expect(
        orderConfig.approvals[1] ||
          orderConfig.approvals[2] ||
          orderConfig.approvals[3] ||
          orderConfig.approvals[4],
      ).toBe(false);
      expect(orderConfig.inited).toBe(true);
      expect(orderConfig.executed).toBe(false);
      expect(orderConfig.order_seqno).toBe(orderParams.orderSeqno);

      // step 9: approve order
      const approver = signers[1];
      const approvePayload = approveOrder(
        approver.address,
        orderConfig.signers,
        orderAddress,
        Date.now(),
      );
      const transactions3 = await approver.send({
        to: orderAddress,
        value: toNano("0.1"),
        body: approvePayload.payload,
      });

      ProcessExpectSuccess.approveOrderNoExecute(transactions3);
    });
  });
});
