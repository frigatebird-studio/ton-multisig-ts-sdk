# ton-multisig-ts-sdk

## Introduction

TON Multisig contracts interaction SDK in Tyepscript

**Note: This SDK is in beta and is not ready for production**

### Features

- [ ] Multisig V1
- [x] Multisig V2
- [ ] Multisig V2r2

## Installing

```
npm install ton-multisig-ts-sdk
```

## Examples

The following examples assume the following ambient declarations:

```typescript
declare const connector: import("@tonconnect/sdk").ITonConnect;
declare const UserRejectsError: typeof import("@tonconnect/sdk").UserRejectsError;
```

### Deploy Multisig V2

```typescript Deploy Multisig V2
import {
  deployMultisig,
  type MultisigConfig,
  type ContractTransferData,
} from "ton-multisig-ts-sdk";
import { Address, toNano } from "@ton/ton";

// step 1: create multisig config
const multisigConfig: MultisigConfig = {
  threshold: 2,
  signers: [
    Address.parse("EQBAJBB3HagsujBqVfqeDUPJ0kXjgTPLWPFFffuNXNiJL0aA"),
    Address.parse("EQBBJBB3HagsujBqVfqeDUPJ0kXjgTPLWPFFffuNXNiJL0aB"),
    Address.parse("EQBCJBB3HagsujBqVfqeDUPJ0kXjgTPLWPFFffuNXNiJL0aC"),
  ],
  proposers: [],
  allowArbitrarySeqno: false,
};

// step 2: create multisig contract deploy payloads
const multisigContractPayload: ContractTransferData =
  deployMultisig(multisigConfig);

// step 3: deploy multisig contract
if (!connector.connected) {
  alert("Please connect wallet to send the transaction!");
}

const transaction = {
  validUntil: Math.floor(Date.now() / 1000) + 60, // 60 sec
  messages: [
    {
      address: multisigContractPayload.sendToAddress.toString(),
      amount: toNano("0.002").toString(),
      stateInit: multisigContractPayload.stateInit.toBoc().toString("base64"),
      payload: multisigContractPayload.payload.toBoc().toString("base64"),
    },
  ],
};

try {
  const result = await connector.sendTransaction(transaction);

  // TODO: verify the result here
  void result;
} catch (e) {
  if (e instanceof UserRejectsError) {
    alert(
      "You rejected the transaction. Please confirm it to send to the blockchain",
    );
  } else {
    alert("Unknown error happened: " + e.toString());
  }
}
```

### Create New Order

#### ton transfer

```typescript
import {
  deployOrder,
  getMultisigConfig,
  tonTransferAction,
  type MultisigConfig,
  type OrderParams,
  type Action,
  type ContractTransferData,
} from "ton-multisig-ts-sdk";
import { Address, toNano, TonClient } from "@ton/ton";

// step 1: initialize tonclient
const client = new TonClient({
  endpoint: "https://testnet.toncenter.com/api/v2/jsonRPC",
  apiKey: "your-api-key", // Optional, but note that without api-key you need to send requests once per second, and with 0.25 seconds
});

// step 2: fetch multisig config
const multisigAddress = Address.parse(
  "EQBAJBB3HagsujBqVfqeDUPJ0kXjgTPLWPFFffuNXNiJL0aA",
);
const multisigConfigRaw = await getMultisigConfig(client, multisigAddress);
const multisigConfig: MultisigConfig = multisigConfigRaw.toConfig();

// step 3: create action (transfer 1 ton)
const action: Action = tonTransferAction(
  Address.parse("EQBBJBB3HagsujBqVfqeDUPJ0kXjgTPLWPFFffuNXNiJL0aB"),
  toNano("1"),
);

// step 4: create order params
const orderParams: OrderParams = {
  multisigAddress: multisigAddress,
  orderSeqno: multisigConfigRaw.nextOrderSeqno,
  expirationDate: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // expires in 24 hours
};

// step 5: create multisig contract deploy payloads
const senderAddress = Address.parse(connector.wallet!.account.address);
const orderContractPayload: ContractTransferData = deployOrder(
  senderAddress,
  orderParams,
  multisigConfig,
  [action],
);

// step 6: deploy multisig contract
if (!connector.connected) {
  alert("Please connect wallet to send the transaction!");
}

const transaction = {
  validUntil: Math.floor(Date.now() / 1000) + 60, // 60 sec
  messages: [
    {
      address: orderContractPayload.sendToAddress.toString(),
      amount: toNano("0.02").toString(),
      payload: orderContractPayload.payload.toBoc().toString("base64"),
    },
  ],
};

try {
  const result = await connector.sendTransaction(transaction);

  // TODO: verify the result here
  void result;
} catch (e) {
  if (e instanceof UserRejectsError) {
    alert(
      "You rejected the transaction. Please confirm it to send to the blockchain",
    );
  } else {
    alert("Unknown error happened: " + e.toString());
  }
}
```

#### jetton transfer

```typescript
import {
  deployOrder,
  getMultisigConfig,
  jettonTransferAction,
  type MultisigConfig,
  type OrderParams,
  type Action,
  type ContractTransferData,
} from "ton-multisig-ts-sdk";
import { Address, toNano, TonClient } from "@ton/ton";

// step 1: initialize tonclient
const client = new TonClient({
  endpoint: "https://testnet.toncenter.com/api/v2/jsonRPC",
  apiKey: "your-api-key", // Optional, but note that without api-key you need to send requests once per second, and with 0.25 seconds
});

// step 2: fetch multisig config
const multisigAddress = Address.parse(
  "EQBAJBB3HagsujBqVfqeDUPJ0kXjgTPLWPFFffuNXNiJL0aA",
);
const multisigConfigRaw = await getMultisigConfig(client, multisigAddress);
const multisigConfig: MultisigConfig = multisigConfigRaw.toConfig();

// step 3: create action (jetton transfer)
const toAddress = Address.parse(
  "EQBBJBB3HagsujBqVfqeDUPJ0kXjgTPLWPFFffuNXNiJL0aB",
);
const jettonAmount = BigInt(1000000000);
const queryId = 1234;
const jettonWalletAddress = Address.parse(
  "EQBBJBB3HagsujBqVfqeDUPJ0kXjgTPLWPFFffuNXNiJL0aC",
); // WARNING: jetton wallet is hard to get, you need to get it from jetton master contract or fetch it from json-rpc api
const action: Action = jettonTransferAction(
  toAddress,
  jettonAmount,
  queryId,
  jettonWalletAddress,
  multisigAddress, // IMPORTANT: excess ton will be sent back to multisig
);

// step 4: create order params
const orderParams: OrderParams = {
  multisigAddress: multisigAddress,
  orderSeqno: multisigConfigRaw.nextOrderSeqno,
  expirationDate: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // expires in 24 hours
};

// step 5: create multisig contract deploy payloads
const senderAddress = Address.parse(connector.wallet!.account.address);
const orderContractPayload: ContractTransferData = deployOrder(
  senderAddress,
  orderParams,
  multisigConfig,
  [action],
);

// step 6: deploy multisig contract
if (!connector.connected) {
  alert("Please connect wallet to send the transaction!");
}

const transaction = {
  validUntil: Math.floor(Date.now() / 1000) + 60, // 60 sec
  messages: [
    {
      address: orderContractPayload.sendToAddress.toString(),
      amount: toNano("0.02").toString(),
      payload: orderContractPayload.payload.toBoc().toString("base64"),
    },
  ],
};

try {
  const result = await connector.sendTransaction(transaction);

  // TODO: verify the result here
  void result;
} catch (e) {
  if (e instanceof UserRejectsError) {
    alert(
      "You rejected the transaction. Please confirm it to send to the blockchain",
    );
  } else {
    alert("Unknown error happened: " + e.toString());
  }
}
```

#### change config

```typescript
import {
  deployOrder,
  getMultisigConfig,
  changeConfigAction,
  type MultisigConfig,
  type OrderParams,
  type Action,
  type ContractTransferData,
} from "ton-multisig-ts-sdk";
import { Address, toNano, TonClient } from "@ton/ton";

// step 1: initialize tonclient
const client = new TonClient({
  endpoint: "https://testnet.toncenter.com/api/v2/jsonRPC",
  apiKey: "your-api-key", // Optional, but note that without api-key you need to send requests once per second, and with 0.25 seconds
});

// step 2: fetch multisig config
const multisigAddress = Address.parse(
  "EQBAJBB3HagsujBqVfqeDUPJ0kXjgTPLWPFFffuNXNiJL0aA",
);
const multisigConfigRaw = await getMultisigConfig(client, multisigAddress);
const multisigConfig: MultisigConfig = multisigConfigRaw.toConfig();

// step 3: create action (change signers)
const action: Action = changeConfigAction(
  [
    ...signers,
    Address.parse("EQBBJBB3HagsujBqVfqeDUPJ0kXjgTPLWPFFffuNXNiJL0aB"),
  ],
  proposers,
  Number(threshold),
);

// step 4: create order params
const orderParams: OrderParams = {
  multisigAddress,
  orderSeqno: multisigConfigRaw.nextOrderSeqno,
  expirationDate: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // expires in 24 hours
};

// step 5: create multisig contract deploy payloads
const senderAddress = Address.parse(connector.wallet!.account.address);
const orderContractPayload: ContractTransferData = deployOrder(
  senderAddress,
  orderParams,
  multisigConfig,
  [action],
);

// step 6: deploy multisig contract
if (!connector.connected) {
  alert("Please connect wallet to send the transaction!");
}

const transaction = {
  validUntil: Math.floor(Date.now() / 1000) + 60, // 60 sec
  messages: [
    {
      address: orderContractPayload.sendToAddress.toString(),
      amount: toNano("0.02").toString(),
      payload: orderContractPayload.payload.toBoc().toString("base64"),
    },
  ],
};

try {
  const result = await connector.sendTransaction(transaction);

  // TODO: verify the result here
  void result;
} catch (e) {
  if (e instanceof UserRejectsError) {
    alert(
      "You rejected the transaction. Please confirm it to send to the blockchain",
    );
  } else {
    alert("Unknown error happened: " + e.toString());
  }
}
```

### Send Approve

#### lowest gas fee (using sdk)

```typescript
import {
  approveOrder,
  getOrderConfig,
  type ContractTransferData,
} from "ton-multisig-ts-sdk";
import { Address, toNano, TonClient } from "@ton/ton";

// step 1: initialize tonclient
const client = new TonClient({
  endpoint: "https://testnet.toncenter.com/api/v2/jsonRPC",
  apiKey: "your-api-key", // Optional, but note that without api-key you need to send requests once per second, and with 0.25 seconds
});

// step 2: get order config
const orderAddress = Address.parse(
  "EQBAJBB3HagsujBqVfqeDUPJ0kXjgTPLWPFFffuNXNiJL0aA",
);
const { signers: orderSigners } = await getOrderConfig(client, orderAddress);

// step 3: create approve payloads
const senderAddress = Address.parse(connector.wallet!.account.address);
const approvePayload: ContractTransferData = approveOrder(
  senderAddress,
  orderSigners,
  orderAddress,
);

// step 4: deploy multisig contract
if (!connector.connected) {
  alert("Please connect wallet to send the transaction!");
}

const transaction = {
  validUntil: Math.floor(Date.now() / 1000) + 60, // 60 sec
  messages: [
    {
      address: approvePayload.sendToAddress.toString(),
      amount: toNano("0.02").toString(),
      payload: approvePayload.payload.toBoc().toString("base64"),
    },
  ],
};

try {
  const result = await connector.sendTransaction(transaction);

  // TODO: verify the result here
  void result;
} catch (e) {
  if (e instanceof UserRejectsError) {
    alert(
      "You rejected the transaction. Please confirm it to send to the blockchain",
    );
  } else {
    alert("Unknown error happened: " + e.toString());
  }
}
```

#### general (not using sdk)

```typescript
import { Address, toNano } from "@ton/ton";

// step 1: get order address
const orderAddress = Address.parse(
  "EQBAJBB3HagsujBqVfqeDUPJ0kXjgTPLWPFFffuNXNiJL0aA",
);

// step 2: send approve transaction
if (!connector.connected) {
  alert("Please connect wallet to send the transaction!");
}

const transaction = {
  validUntil: Math.floor(Date.now() / 1000) + 60, // 60 sec
  messages: [
    {
      address: approvePayload.sendToAddress.toString(),
      amount: toNano("0.02").toString(),
      payload: beginCell()
        .storeUint(0, 32) // write 32 zero bits to indicate that a text comment will follow
        .storeStringTail("approve") // write our text comment
        .endCell()
        .toBoc()
        .toString("base64"),
    },
  ],
};

try {
  const result = await connector.sendTransaction(transaction);

  // TODO: verify the result here
  void result;
} catch (e) {
  if (e instanceof UserRejectsError) {
    alert(
      "You rejected the transaction. Please confirm it to send to the blockchain",
    );
  } else {
    alert("Unknown error happened: " + e.toString());
  }
}
```

## Contributing

Note this is only for developers who want to contribute code to the SDK

### Clone the Repository

```
git clone https://github.com/thewildanimal/ton-multisig-ts-sdk
```

### Building

```
npm run build
```

### Testing

```
npm test
```
