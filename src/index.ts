import {
  Address,
  beginCell,
  Cell,
  storeStateInit,
  StateInit,
  contractAddress,
  TonClient,
  SendMode,
  internal,
  toNano,
  Dictionary,
  loadMessageRelaxed,
} from "@ton/ton";
import {
  multisigConfigToCell,
  cellToArray,
  Multisig,
} from "./contract/wrappers/Multisig";
import type {
  MultisigConfig,
  OrderParams,
  TransferRequest,
  UpdateRequest,
  Action,
  ActionReadable,
  ContractTransferData,
} from "./interfaces/ton";
import { Params, Op, ORDER_MAX_SEQNO } from "./contract/wrappers/Constants";
import * as MultisigCode from "./contract/compiled/Multisig.compiled.json";

class MultisigConfigRaw {
  private _interpreted: MultisigConfig;

  constructor(
    readonly nextOrderSeqno: bigint,
    readonly threshold: bigint,
    readonly signers: Address[],
    readonly proposers: Address[],
  ) {
    const config: MultisigConfig = {
      threshold: Number(threshold),
      signers,
      proposers,
      allowArbitrarySeqno: nextOrderSeqno === -1n,
    };
    this._interpreted = Object.freeze(config);
  }

  toConfig() {
    return this._interpreted;
  }
}

function deployMultisig(config: MultisigConfig): ContractTransferData {
  const code = Cell.fromHex(MultisigCode.hex);
  const data = multisigConfigToCell(config);
  const init: StateInit = { code, data };
  const stateInit = beginCell().store(storeStateInit(init)).endCell();
  const payload = beginCell()
    .storeUint(0, Params.bitsize.op)
    .storeUint(0, Params.bitsize.queryId)
    .endCell();
  const address = contractAddress(0, init);
  return {
    sendToAddress: address,
    stateInit,
    payload,
  };
}

function tonTransferAction(
  tonReceiver: Address,
  tonAmount: bigint,
  comment?: string,
): TransferRequest {
  return {
    type: "transfer",
    sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
    message: internal({
      to: tonReceiver,
      value: tonAmount,
      body: comment
        ? beginCell().storeUint(0, 32).storeStringTail(comment).endCell()
        : Cell.EMPTY,
    }),
  };
}

function jettonTransferAction(
  toAddress: Address,
  jettonAmount: bigint,
  queryId: number,
  jettonWalletAddress: Address,
  responseAddress: Address,
): TransferRequest {
  const body = beginCell()
    .storeUint(Op.jetton.JettonTransfer, 32) // jetton transfer op code
    .storeUint(queryId, 64) // query_id:uint64
    .storeCoins(jettonAmount) // amount:(VarUInteger 16) -  Jetton amount for transfer (decimals = 6 - USDT, 9 - default). Function toNano use decimals = 9 (remember it)
    .storeAddress(toAddress) // destination:MsgAddress
    .storeAddress(responseAddress) // response_destination:MsgAddress
    .storeUint(0, 1) // custom_payload:(Maybe ^Cell)
    .storeCoins(1n) // forward_ton_amount:(VarUInteger 16) - if >0, will send notification message
    .storeUint(0, 1) // forward_payload:(Either Cell ^Cell)
    .endCell();

  const msg = internal({
    to: jettonWalletAddress,
    value: toNano("0.05"),
    body: body,
  });

  return {
    type: "transfer",
    sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
    message: msg,
  };
}

function changeConfigAction(
  signers: Address[],
  proposers: Address[],
  threshold: number,
): UpdateRequest {
  return {
    type: "update",
    threshold,
    signers,
    proposers,
  };
}

function deployOrder(
  fromAddress: Address,
  params: OrderParams,
  multisigConfig: MultisigConfig,
  actions: Action[] | Cell,
): ContractTransferData {
  // check if orderSeqno is valid
  if (params.orderSeqno === -1n) {
    params.orderSeqno = ORDER_MAX_SEQNO;
  }

  // check if sender is in signers or proposers
  const addrCmp = (x: Address) => x.equals(fromAddress);
  let addrIdx = multisigConfig.signers.findIndex(addrCmp);
  let isSigner = false; // default assume sender is a proposer
  if (addrIdx >= 0) {
    isSigner = true;
  } else {
    addrIdx = multisigConfig.proposers.findIndex(addrCmp);
    if (addrIdx < 0) {
      throw new Error("Sender is not a signer or proposer");
    }
  }

  // pack actions
  let newActions: Cell | Action[];
  if (actions instanceof Cell) {
    newActions = actions;
  } else if (actions.length > 255) {
    newActions = Multisig.packLarge(actions, params.multisigAddress);
  } else {
    newActions = Multisig.packOrder(actions);
  }

  return {
    sendToAddress: params.multisigAddress,
    payload: Multisig.newOrderMessage(
      newActions,
      params.expirationDate,
      isSigner,
      addrIdx,
      params.orderSeqno,
    ),
  };
}

function approveOrder(
  fromAddress: Address,
  signers: Address[],
  orderAddress: Address,
  queryId: number = 0,
): ContractTransferData {
  const addrCmp = (x: Address) => x.equals(fromAddress);
  const addrIdx = signers.findIndex(addrCmp);
  if (addrIdx < 0) {
    throw new Error("Sender is not a signer");
  }

  const body = beginCell()
    .storeUint(Op.order.approve, Params.bitsize.op)
    .storeUint(queryId, Params.bitsize.queryId)
    .storeUint(addrIdx, Params.bitsize.signerIndex)
    .endCell();

  return {
    sendToAddress: orderAddress,
    payload: body,
  };
}

async function getMultisigConfig(
  provider: TonClient,
  multisigAddress: Address,
): Promise<MultisigConfigRaw> {
  const { stack } = await provider.runMethod(
    multisigAddress,
    "get_multisig_data",
    [],
  );
  const nextOrderSeqno = stack.readBigNumber();
  const threshold = stack.readBigNumber();
  const signers = cellToArray(stack.readCellOpt());
  const proposers = cellToArray(stack.readCellOpt());

  return new MultisigConfigRaw(nextOrderSeqno, threshold, signers, proposers);
}

async function getOrderAddressBySeqno(
  provider: TonClient,
  multisigAddress: Address,
  orderSeqno: number,
): Promise<Address> {
  let bnOrderSeqno = BigInt(orderSeqno);
  if (orderSeqno === -1) {
    bnOrderSeqno = ORDER_MAX_SEQNO;
  }
  const { stack } = await provider.runMethod(
    multisigAddress,
    "get_order_address",
    [{ type: "int", value: bnOrderSeqno }],
  );
  return stack.readAddress();
}

async function getOrderConfig(provider: TonClient, orderAddress: Address) {
  const { stack } = await provider.runMethod(
    orderAddress,
    "get_order_data",
    [],
  );
  const multisig = stack.readAddress();
  const order_seqno = stack.readBigNumber();
  const threshold = stack.readNumberOpt();
  const executed = stack.readBooleanOpt();
  const signers = cellToArray(stack.readCellOpt());
  const approvals = stack.readBigNumberOpt();
  const approvals_num = stack.readNumberOpt();
  const expiration_date = stack.readBigNumberOpt();
  const order = stack.readCellOpt();
  let approvalsArray: Array<boolean>;
  if (approvals !== null) {
    approvalsArray = Array(256);
    for (let i = 0; i < 256; i++) {
      approvalsArray[i] = Boolean((1n << BigInt(i)) & approvals);
    }
  } else {
    approvalsArray = [];
  }
  return {
    inited: threshold !== null,
    multisig,
    order_seqno,
    threshold,
    executed,
    signers,
    approvals: approvalsArray,
    approvals_num: approvals_num,
    _approvals: approvals,
    expiration_date,
    order,
  };
}

function parseActionViaOrdersCell(orders: Cell): ActionReadable[] {
  // const orders = msgBodySlice.loadRef();
  const ordersSlice = orders.beginParse();
  const actions = ordersSlice.loadDictDirect(
    Dictionary.Keys.Uint(Params.bitsize.actionIndex),
    Dictionary.Values.Cell(),
  );

  const actionsArray: ActionReadable[] = [];

  for (const index of actions.keys()) {
    const actionCell = actions.get(index);
    if (!actionCell) {
      continue;
    }
    const actionSlice = actionCell.beginParse();

    // check if action has enough bits to read opcode
    if (actionSlice.remainingBits > Params.bitsize.op) {
      const actionOpcode = actionSlice.loadUint(Params.bitsize.op);

      if (
        // check if action is update config
        actionOpcode == Op.actions.update_multisig_params &&
        actionSlice.remainingBits >= Params.bitsize.signerIndex &&
        actionSlice.remainingRefs >= 1
      ) {
        const threshold = actionSlice.loadUint(Params.bitsize.signerIndex);
        let signers: Address[] = [];
        const signersCell = actionSlice.loadRef();
        if (signersCell.asSlice().remainingBits > 1) {
          signers = cellToArray(signersCell);
        }
        let proposers: Address[] = [];
        if (actionSlice.remainingBits > 1) {
          proposers = cellToArray(actionSlice.asCell());
        }
        actionsArray.push({
          type: "UPDATE_CONFIG",
          signers,
          proposers,
          threshold,
        });
      } else if (
        actionOpcode == Op.actions.send_message &&
        actionSlice.remainingBits >= Params.bitsize.sendMode &&
        actionSlice.remainingRefs >= 1
      ) {
        actionSlice.loadUint(Params.bitsize.sendMode); // send mode
        const message = loadMessageRelaxed(actionSlice.loadRef().beginParse());
        if (message.info.type === "internal") {
          const to = message.info.dest;
          const value = message.info.value.coins;
          const body = message.body;

          if (!to || typeof value !== "bigint") {
            continue;
          }

          const bodySlice = body.beginParse();

          if (
            bodySlice.remainingBits === 0 ||
            (bodySlice.remainingBits >= Params.bitsize.op &&
              bodySlice.preloadUint(Params.bitsize.op) === Op.common.comment)
          ) {
            let comment = "";
            if (bodySlice.remainingBits > 0) {
              bodySlice.loadUint(Params.bitsize.op); // opcode
              comment = bodySlice.loadStringTail();
            }
            actionsArray.push({
              type: "SEND_TON",
              amount: value,
              recipient: to,
              comment,
            });
          } else if (
            body &&
            body !== Cell.EMPTY &&
            bodySlice.remainingBits >
              Params.bitsize.queryId + Params.bitsize.address &&
            bodySlice.preloadUint(Params.bitsize.op) ===
              Op.jetton.JettonTransfer
          ) {
            bodySlice.loadUint(Params.bitsize.op); // opcode
            bodySlice.loadUintBig(Params.bitsize.queryId); // queryId
            const jettonAmount = bodySlice.loadCoins();
            const destReal = bodySlice.loadAddress();
            actionsArray.push({
              type: "SEND_JETTON",
              amount: jettonAmount,
              recipient: destReal,
              jettonWallet: to,
            });
          }
        } else {
          // TODO: may be an external message out
          continue;
        }
      } else {
        // TODO: this is an unknown action type
        continue;
      }
    }
  }
  return actionsArray;
}

export {
  deployMultisig,
  deployOrder,
  approveOrder,
  getMultisigConfig,
  getOrderAddressBySeqno,
  getOrderConfig,
  tonTransferAction,
  jettonTransferAction,
  changeConfigAction,
  parseActionViaOrdersCell,

  // types
  MultisigConfig,
  OrderParams,
  TransferRequest,
  UpdateRequest,
  Action,
  ActionReadable,
  ContractTransferData,
};
