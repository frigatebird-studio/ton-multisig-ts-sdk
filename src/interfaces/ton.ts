import type { Address, Cell } from "@ton/core";
import {
  Action,
  MultisigConfig,
  TransferRequest,
  UpdateRequest,
} from "../contract/wrappers/Multisig";

interface OrderParams {
  multisigAddress: Address;
  orderSeqno: bigint;
  expirationDate: number;
}

interface ContractTransferData {
  sendToAddress: Address;
  stateInit?: Cell;
  payload: Cell;
}

interface UpdateConfigActionReadable {
  type: "UPDATE_CONFIG";
  signers: Address[];
  proposers: Address[];
  threshold: number;
}

interface SendTonActionReadable {
  type: "SEND_TON";
  amount: bigint;
  recipient: Address;
  comment: string;
}

interface SendJettonActionReadable {
  type: "SEND_JETTON";
  amount: bigint;
  recipient: Address;
  jettonWallet: Address;
}

type ActionReadable =
  | UpdateConfigActionReadable
  | SendTonActionReadable
  | SendJettonActionReadable;

export type {
  MultisigConfig,
  OrderParams,
  TransferRequest,
  UpdateRequest,
  Action,
  ActionReadable,
  ContractTransferData,
};
