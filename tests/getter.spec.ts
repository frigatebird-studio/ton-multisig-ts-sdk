import {
  Blockchain,
  BlockchainSnapshot,
  SandboxContract,
  TreasuryContract,
} from "@ton/sandbox";
import {
  Address,
  beginCell,
  Cell,
  Dictionary,
  loadStateInit,
  toNano,
} from "@ton/core";
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
  let multisigAddress: Address;
  let orderParams: OrderParams;
  let orderAddress: Address;

  beforeAll(async () => {
    blockchain = await Blockchain.create();

    const orderCodeRaw = Cell.fromHex(OrderCode.hex);
    const orderHash = orderCodeRaw.hash();
    const _libs = Dictionary.empty(
      Dictionary.Keys.BigUint(256),
      Dictionary.Values.Cell(),
    );
    _libs.set(BigInt(`0x${orderHash.toString("hex")}`), orderCodeRaw);
    const libs = beginCell().storeDictDirect(_libs).endCell();
    blockchain.libs = libs;
    // const  libPrep = beginCell().storeUint(2, 8).storeBuffer(orderHash).endCell();
    // const orderCode = new Cell({ exotic: true, bits: libPrep.bits, refs: libPrep.refs });

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
    multisigConfig = {
      threshold: 3,
      signers: signers.map((signer) => signer.address),
      proposers: proposers.map((proposer) => proposer.address),
      allowArbitrarySeqno: false,
    };

    const multisigContractPayload = deployMultisig(multisigConfig);
    expect(multisigContractPayload.stateInit).toBeDefined();
    const transactions1 = await deployer.send({
      to: multisigContractPayload.sendToAddress,
      value: toNano("0.002"),
      body: multisigContractPayload.payload,
      init: loadStateInit(multisigContractPayload.stateInit!.beginParse()),
    });
    ProcessExpectSuccess.deployMultisig(transactions1);
    multisigAddress = multisigContractPayload.sendToAddress;

    const action: Action = tonTransferAction(deployer.address, toNano("1"));
    orderParams = {
      multisigAddress: multisigAddress,
      orderSeqno: 0n,
      expirationDate: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // expires in 24 hours
    };

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

    expect(
      transactions2.transactions[2].inMessage?.info.dest,
    ).not.toBeUndefined();
    expect(transactions2.transactions[2].inMessage?.info.dest).not.toBeNull();
    expect(transactions2.transactions[2].inMessage?.info.dest).toBeInstanceOf(
      Address,
    );

    orderAddress = transactions2.transactions[2].inMessage?.info
      .dest as Address;

    blockchainReadyState = blockchain.snapshot();
  });

  beforeEach(async () => {
    await blockchain.loadFrom(blockchainReadyState);
  });

  describe("get multisig data", () => {
    it("should be successfully fetched", async () => {
      const multisigConfigRaw = await getMultisigConfig(
        provider,
        multisigAddress,
      );

      // type check
      expect(typeof multisigConfigRaw.nextOrderSeqno).toBe("bigint");
      expect(typeof multisigConfigRaw.threshold).toBe("bigint");
      expect(typeof multisigConfigRaw.signers).toBe("object");
      expect(typeof multisigConfigRaw.proposers).toBe("object");

      // value check
      expect(multisigConfigRaw["allowArbitrarySeqno"]).toBeUndefined();
      expect(multisigConfigRaw.nextOrderSeqno).toBe(1n);
      expect(multisigConfigRaw.threshold).toBe(
        BigInt(multisigConfig.threshold),
      );
      expect(multisigConfigRaw.signers).toHaveLength(
        multisigConfig.signers.length,
      );
      expect(multisigConfigRaw.proposers).toHaveLength(
        multisigConfig.proposers.length,
      );
      expect(multisigConfigRaw.signers.toString()).toEqual(
        multisigConfig.signers.toString(),
      );
      expect(multisigConfigRaw.proposers.toString()).toEqual(
        multisigConfig.proposers.toString(),
      );

      // utility check
      const multisigConfigTransfered = multisigConfigRaw.toConfig();
      expect(multisigConfigTransfered.allowArbitrarySeqno).toBeDefined();
      expect(multisigConfigTransfered["nextOrderSeqno"]).toBeUndefined();
      expect(multisigConfigTransfered.threshold).toBe(multisigConfig.threshold);
      expect(multisigConfigTransfered.signers).toHaveLength(
        multisigConfig.signers.length,
      );
      expect(multisigConfigTransfered.proposers).toHaveLength(
        multisigConfig.proposers.length,
      );
      expect(multisigConfigTransfered.signers.toString()).toEqual(
        multisigConfig.signers.toString(),
      );
      expect(multisigConfigTransfered.proposers.toString()).toEqual(
        multisigConfig.proposers.toString(),
      );
    });
  });

  describe("get order address", () => {
    it("should be successfully fetched", async () => {
      const orderAddressFetched = await getOrderAddressBySeqno(
        provider,
        multisigAddress,
        Number(0n),
      );
      expect(orderAddressFetched.toString()).toBe(orderAddress.toString());

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

  describe("get order data", () => {
    it("should be successfully fetched", async () => {
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
    });
  });
});
