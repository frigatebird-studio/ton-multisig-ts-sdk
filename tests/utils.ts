import { TonClient } from "@ton/ton";
import { Address, TupleItem, TupleReader } from "@ton/core";
import { Blockchain, SendMessageResult } from "@ton/sandbox";
import { Op, Params } from "../src/contract/wrappers/Constants";

export class TestTonClient extends TonClient {
  blockchain: Blockchain;

  constructor(blockchain: Blockchain) {
    super({ endpoint: "" });
    this.blockchain = blockchain;

    this.runMethod = async (
      address: Address,
      method: string,
      args: TupleItem[],
    ) => {
      const result = await this.blockchain.runGetMethod(address, method, args);
      return {
        gas_used: Number(result.gasUsed),
        stack: new TupleReader(result.stack),
      };
    };
  }
}

export class ProcessExpectSuccess {
  static deployMultisig(
    transactions: SendMessageResult & {
      result: void;
    },
  ) {
    expect(transactions.transactions.length).toBe(2);
    expect(transactions.transactions[0].outMessagesCount).toBe(1);
    expect(transactions.transactions[1].outMessagesCount).toBe(0);
    expect(transactions.transactions[1].oldStatus).toBe("uninitialized");
    expect(transactions.transactions[1].endStatus).toBe("active");
  }

  static deployOrder(
    transactions: SendMessageResult & {
      result: void;
    },
  ) {
    expect(transactions.transactions.length).toBe(3);
    expect(transactions.transactions[0].oldStatus).toBe("active");
    expect(transactions.transactions[0].endStatus).toBe("active");
    expect(transactions.transactions[0].outMessagesCount).toBe(1);
    expect(transactions.transactions[1].oldStatus).toBe("active");
    expect(transactions.transactions[1].endStatus).toBe("active");
    expect(transactions.transactions[1].outMessagesCount).toBe(1);
    expect(transactions.transactions[2].oldStatus).toBe("uninitialized");
    expect(transactions.transactions[2].endStatus).toBe("active");
    expect(transactions.transactions[2].outMessagesCount).toBe(0);
  }

  static approveOrderNoExecute(
    transactions: SendMessageResult & {
      result: void;
    },
  ) {
    expect(transactions.transactions.length).toBe(3);
    expect(transactions.transactions[0].oldStatus).toBe("active");
    expect(transactions.transactions[0].endStatus).toBe("active");
    expect(transactions.transactions[0].outMessagesCount).toBe(1);
    expect(transactions.transactions[1].oldStatus).toBe("active");
    expect(transactions.transactions[1].endStatus).toBe("active");
    expect(transactions.transactions[1].outMessagesCount).toBe(1);
    expect(transactions.transactions[2].oldStatus).toBe("active");
    expect(transactions.transactions[2].endStatus).toBe("active");
    expect(transactions.transactions[2].outMessagesCount).toBe(0);
    expect(transactions.transactions[2].inMessage?.info.dest?.toString()).toBe(
      transactions.transactions[0].inMessage?.info.dest?.toString(),
    );
    expect(
      transactions.transactions[2].inMessage?.body
        .beginParse()
        .preloadUint(Params.bitsize.op),
    ).toBe(Op.order.approved);
  }
}
