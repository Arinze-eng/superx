# x402 Protocol Technical Reference

> Comprehensive technical reference for building the first x402 facilitator for TON blockchain.
> Produced by x402 Protocol Expert agent, 2026-03-04.

---

## Table of Contents

1. [Protocol Overview](#1-protocol-overview)
2. [V1 vs V2 Differences](#2-v1-vs-v2-differences)
3. [Core Data Structures](#3-core-data-structures)
4. [Facilitator API Contract](#4-facilitator-api-contract)
5. [Existing Scheme Implementations (Comparative)](#5-existing-scheme-implementations)
6. [Mechanism Package Structure](#6-mechanism-package-structure)
7. [TypeScript Interfaces](#7-typescript-interfaces)
8. [CAIP-2 Network Identifiers](#8-caip-2-network-identifiers)
9. [Contribution Requirements](#9-contribution-requirements)
10. [TON-Specific Considerations](#10-ton-specific-considerations)

---

## 1. Protocol Overview

x402 is an open payment standard that enables clients to pay for external resources using the HTTP 402 Payment Required status code. The protocol separates three layers:

1. **Types** — Transport and scheme-agnostic data structures
2. **Logic** — Payment formation/verification logic dependent on scheme and network
3. **Representation** — Transport-dependent transmission mechanisms (HTTP headers, MCP, A2A)

### Payment Flow (4-step cycle)

```
Client → Resource Server:  GET /protected-resource
Server → Client:           402 Payment Required + PaymentRequired header
Client → Resource Server:  GET /protected-resource + X-PAYMENT header (signed payment)
Server → Facilitator:      POST /verify then POST /settle
Server → Client:           200 OK + X-PAYMENT-RESPONSE header
```

### Three Participants

| Role | Description |
|------|-------------|
| **Resource Server** | Service requiring payment for protected resources |
| **Client** | Application requesting access (human or AI agent) |
| **Facilitator** | Service handling payment verification and on-chain settlement |

### Supported Schemes

- `exact` — Transfers a specific amount (e.g., pay $1 to read an article)
- Future: `upto` — Transfers up to an amount based on resources consumed

### Repository Structure

```
coinbase/x402/
├── specs/
│   ├── x402-specification-v1.md
│   ├── x402-specification-v2.md
│   ├── scheme_template.md
│   ├── scheme_impl_template.md
│   ├── CONTRIBUTING.md
│   ├── schemes/exact/
│   │   ├── scheme_exact.md            # Overview
│   │   ├── scheme_exact_evm.md        # EVM implementation
│   │   ├── scheme_exact_svm.md        # Solana implementation
│   │   ├── scheme_exact_aptos.md      # Aptos implementation
│   │   ├── scheme_exact_algo.md       # Algorand
│   │   ├── scheme_exact_hedera.md     # Hedera
│   │   ├── scheme_exact_stellar.md    # Stellar
│   │   └── scheme_exact_sui.md        # Sui
│   ├── transports-v1/
│   └── transports-v2/
│       ├── http.md
│       ├── mcp.md
│       └── a2a.md
├── typescript/packages/
│   ├── core/           # @x402/core — shared types, facilitator base
│   ├── mechanisms/
│   │   ├── evm/        # @x402/evm
│   │   ├── svm/        # @x402/svm
│   │   └── aptos/      # @x402/aptos (newest)
│   ├── http/           # HTTP transport middleware
│   ├── extensions/     # Protocol extensions
│   ├── mcp/            # MCP transport
│   └── legacy/         # V1 backward compatibility
├── go/                 # Go SDK
├── python/             # Python SDK
└── java/               # Java SDK
```

---

## 2. V1 vs V2 Differences

### Key Changes

| Aspect | V1 | V2 |
|--------|----|----|
| Version field | `x402Version: 1` | `x402Version: 2` |
| Amount field | `maxAmountRequired` | `amount` |
| Network format | Human-readable (`"base-sepolia"`) | CAIP-2 (`"eip155:84532"`) |
| Resource info | Flat fields on PaymentRequirements | Separate `ResourceInfo` object |
| PaymentPayload | Has `scheme` and `network` at root | Has `accepted` (full PaymentRequirements) |
| Extensions | Not supported | First-class `extensions` field |
| Discovery | Not specified | `GET /discovery/resources` API |
| Signers | Not in /supported | `/supported` returns `signers` map |

### V1 PaymentPayload (for comparison)
```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "base-sepolia",
  "payload": { "signature": "0x...", "authorization": {...} }
}
```

### V2 PaymentPayload
```json
{
  "x402Version": 2,
  "resource": { "url": "https://...", "description": "...", "mimeType": "..." },
  "accepted": {
    "scheme": "exact",
    "network": "eip155:84532",
    "amount": "1000000",
    "asset": "0x...",
    "payTo": "0x...",
    "maxTimeoutSeconds": 60,
    "extra": {}
  },
  "payload": { /* scheme-specific */ },
  "extensions": {}
}
```

---

## 3. Core Data Structures

### 3.1 PaymentRequired (402 response)

```typescript
type PaymentRequired = {
  x402Version: number;       // Must be 2
  error?: string;            // Human-readable error message
  resource: ResourceInfo;    // Protected resource info
  accepts: PaymentRequirements[];  // Acceptable payment methods
  extensions?: Record<string, unknown>;
};

interface ResourceInfo {
  url: string;
  description?: string;
  mimeType?: string;
}
```

### 3.2 PaymentRequirements

```typescript
type PaymentRequirements = {
  scheme: string;            // "exact"
  network: Network;          // CAIP-2 format: "eip155:84532", "solana:...", "aptos:1", "tvm:-239"
  asset: string;             // Token contract/mint address
  amount: string;            // Atomic units as string
  payTo: string;             // Recipient wallet address
  maxTimeoutSeconds: number; // Maximum time for payment completion
  extra: Record<string, unknown>; // Scheme-specific (e.g., { feePayer: "..." })
};
```

### 3.3 PaymentPayload (client submission)

```typescript
type PaymentPayload = {
  x402Version: number;
  resource?: ResourceInfo;
  accepted: PaymentRequirements;  // The chosen payment method
  payload: Record<string, unknown>;  // Scheme-specific payment data
  extensions?: Record<string, unknown>;
};
```

### 3.4 VerifyResponse

```typescript
type VerifyResponse = {
  isValid: boolean;
  invalidReason?: string;
  invalidMessage?: string;
  payer?: string;
  extensions?: Record<string, unknown>;
};
```

### 3.5 SettleResponse

```typescript
type SettleResponse = {
  success: boolean;
  errorReason?: string;
  errorMessage?: string;
  payer?: string;
  transaction: string;       // Blockchain tx hash (empty if failed)
  network: Network;          // CAIP-2 network identifier
  extensions?: Record<string, unknown>;
};
```

### 3.6 SupportedResponse

```typescript
type SupportedResponse = {
  kinds: SupportedKind[];
  extensions: string[];
  signers: Record<string, string[]>;  // CAIP family pattern → signer addresses
};

type SupportedKind = {
  x402Version: number;
  scheme: string;
  network: Network;
  extra?: Record<string, unknown>;
};
```

### 3.7 Network Type

```typescript
type Network = `${string}:${string}`;  // CAIP-2 format enforced by template literal
```

---

## 4. Facilitator API Contract

### 4.1 GET /supported

Returns capabilities of this facilitator.

**Response:**
```json
{
  "kinds": [
    {
      "x402Version": 2,
      "scheme": "exact",
      "network": "eip155:84532"
    },
    {
      "x402Version": 2,
      "scheme": "exact",
      "network": "aptos:1",
      "extra": {
        "feePayer": "0xabcdef..."
      }
    }
  ],
  "extensions": ["erc20ApprovalGasSponsoring"],
  "signers": {
    "eip155:*": ["0x1234..."],
    "solana:*": ["CKPKJWNd..."],
    "aptos:*": ["0xabcdef..."]
  }
}
```

Note: `signers` keys use CAIP family patterns (wildcard for all networks in that family).

### 4.2 POST /verify

Validates a payment authorization without executing on-chain.

**Request:**
```json
{
  "x402Version": 2,
  "paymentPayload": { /* PaymentPayload */ },
  "paymentRequirements": { /* PaymentRequirements */ }
}
```

**Success:**
```json
{
  "isValid": true,
  "payer": "0x857b..."
}
```

**Failure:**
```json
{
  "isValid": false,
  "invalidReason": "insufficient_funds",
  "payer": "0x857b..."
}
```

### 4.3 POST /settle

Executes verified payment by broadcasting transaction to blockchain.

**Request:** Same structure as /verify.

**Success:**
```json
{
  "success": true,
  "payer": "0x857b...",
  "transaction": "0x1234567890abcdef...",
  "network": "eip155:84532"
}
```

**Failure:**
```json
{
  "success": false,
  "errorReason": "insufficient_funds",
  "payer": "0x857b...",
  "transaction": "",
  "network": "eip155:84532"
}
```

### 4.4 Error Reasons (from V1 spec)

| Error Code | Description |
|------------|-------------|
| `insufficient_funds` | Payer lacks sufficient token balance |
| `invalid_exact_evm_payload_authorization_valid_after` | Authorization not yet valid |
| `invalid_exact_evm_payload_authorization_valid_before` | Authorization expired |
| `invalid_exact_evm_payload_authorization_value` | Payment amount insufficient |
| `invalid_exact_evm_payload_signature` | Invalid signature |
| `invalid_exact_evm_payload_recipient_mismatch` | Recipient address mismatch |
| `invalid_network` | Network not supported |
| `invalid_payload` | Malformed payment payload |
| `invalid_scheme` | Unsupported payment scheme |
| `invalid_x402_version` | Unsupported protocol version |
| `invalid_transaction_state` | Blockchain transaction failed |
| `unexpected_verify_error` | Unexpected verification error |
| `unexpected_settle_error` | Unexpected settlement error |

**Note for TON:** Error codes follow pattern `invalid_exact_{chain}_*`. For TON, use `invalid_exact_ton_*`.

---

## 5. Existing Scheme Implementations

### 5.1 Comparative Overview

| Aspect | EVM | Solana (SVM) | Aptos |
|--------|-----|--------------|-------|
| **CAIP-2** | `eip155:8453` | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` | `aptos:1` |
| **Payload type** | EIP-712 signature + authorization | Base64-encoded partially-signed versioned tx | Base64-encoded BCS-serialized signed tx |
| **Transfer mechanism** | EIP-3009 `transferWithAuthorization` or Permit2 | SPL `TransferChecked` instruction | `primary_fungible_store::transfer` or `fungible_asset::transfer` |
| **Gas sponsorship** | Facilitator calls contract directly | Facilitator signs as `feePayer` | Facilitator signs as fee payer |
| **`extra` fields** | `{ name, version }` (EIP-3009) | `{ feePayer }` | `{ feePayer }` |
| **Replay prevention** | 32-byte nonce in EIP-3009 | Transaction is single-use | Transaction sequence number |
| **Verification** | Signature recovery + balance check + simulation | Instruction layout validation + balance check | BCS deserialization + chain ID + balance + simulation |

### 5.2 EVM Exact Scheme

**Two asset transfer methods:**

#### Method 1: EIP-3009 (for compatible tokens like USDC)
- Client signs EIP-712 typed data authorizing `transferWithAuthorization`
- Payload: `{ signature, authorization: { from, to, value, validAfter, validBefore, nonce } }`
- Facilitator calls `transferWithAuthorization()` on the ERC-20 contract
- Gas is paid by facilitator, user pays nothing

#### Method 2: Permit2 (universal fallback for any ERC-20)
- Requires one-time `approve(Permit2)` (direct, sponsored, or via EIP-2612)
- Uses Uniswap Permit2 contract with Witness mechanism
- Proxy contract `x402ExactPermit2Proxy` at canonical CREATE2 address `0x4020CD856C882D5fb903D99CE35316A085Bb0001`
- Witness enforces recipient immutability

**Verification steps (EIP-3009):**
1. Recover signer from EIP-712 signature, confirm matches `authorization.from`
2. Verify sufficient token balance
3. Validate amount matches requirements
4. Check time window (validAfter/validBefore)
5. Match parameters to original requirements
6. Simulate `transferWithAuthorization` on-chain

### 5.3 Solana (SVM) Exact Scheme

**Protocol flow:** Client creates partially-signed versioned transaction, facilitator co-signs as fee payer.

**Payload:** `{ transaction: "base64-encoded partially-signed versioned transaction" }`

**Strict instruction layout (3-5 instructions):**
1. Compute Budget: Set Compute Unit Limit (discriminator 2)
2. Compute Budget: Set Compute Unit Price (discriminator 3)
3. SPL Token or Token-2022: TransferChecked
4. (Optional) Lighthouse instruction (Phantom)
5. (Optional) Lighthouse instruction (Solflare)

**Critical security rules:**
- Fee payer MUST NOT appear in any instruction accounts
- Fee payer MUST NOT be TransferChecked authority or source
- Compute unit price MUST NOT exceed 5 lamports per CU
- Destination MUST equal ATA PDA for `(owner=payTo, mint=asset)`
- Transfer amount MUST equal `PaymentRequirements.amount` exactly

### 5.4 Aptos Exact Scheme

**Protocol flow:** Client creates BCS-serialized signed transaction, facilitator adds fee payer signature and submits.

**Payload:** `{ transaction: "base64-encoded BCS-serialized signed tx" }`

The base64 decodes to JSON: `{ transaction: number[], senderAuthenticator: number[] }` where both are byte arrays for BCS deserialization.

**PaymentRequirements extra:** `{ feePayer: "0x..." }` (optional, for sponsored mode)

**Transfer functions accepted:**
- `0x1::primary_fungible_store::transfer` (recommended, auto-creates stores)
- `0x1::fungible_asset::transfer` (lower-level, requires existing stores)

**Verification steps (11 total):**
1. Extract requirements from `payload.accepted`
2. Validate `x402Version` equals 2
3. Confirm scheme matches "exact"
4. Deserialize BCS transaction, verify chain ID matches network
5. Check expiration timestamp with 5-second buffer
6. Validate transfer function is one of the two accepted
7. Verify asset matches `requirements.asset`
8. Verify amount equals `requirements.amount`
9. Confirm recipient matches `requirements.payTo`
10. Check sender has sufficient balance via Aptos client
11. Simulate transaction via Aptos REST API

**Settlement:**
- Sponsored: Facilitator signs as fee payer, submits dual-signed tx
- Non-sponsored: Facilitator submits fully client-signed tx

**Supported signature schemes:** Ed25519, MultiEd25519, SingleKey, MultiKey

---

## 6. Mechanism Package Structure

### 6.1 Package Layout (from `@x402/aptos` — the reference model)

```
typescript/packages/mechanisms/aptos/
├── package.json          # name: "@x402/aptos", deps: @x402/core + @aptos-labs/ts-sdk
├── tsconfig.json
├── tsup.config.ts        # Build config (CJS + ESM dual output)
├── vitest.config.ts      # Unit tests
├── vitest.integration.config.ts  # Integration tests
├── src/
│   ├── index.ts          # Barrel re-exports: exact, types, constants, signer, utils
│   ├── constants.ts      # CAIP-2 IDs, address regex, USDC addresses, network mappers
│   ├── types.ts          # Chain-specific payload types
│   ├── signer.ts         # Client + Facilitator signer abstractions
│   ├── utils.ts          # Serialization, deserialization, client creation
│   └── exact/
│       ├── index.ts      # Re-exports client, facilitator, server
│       ├── client/
│       │   ├── index.ts
│       │   └── scheme.ts # implements SchemeNetworkClient
│       ├── facilitator/
│       │   ├── index.ts
│       │   └── scheme.ts # implements SchemeNetworkFacilitator
│       └── server/
│           ├── index.ts
│           └── scheme.ts # implements SchemeNetworkServer
└── test/
```

### 6.2 Package.json Key Fields

```json
{
  "name": "@x402/aptos",
  "version": "2.5.0",
  "dependencies": {
    "@x402/core": "workspace:*",
    "@aptos-labs/ts-sdk": "^5.2.1"
  },
  "exports": {
    ".": { "import": "...", "require": "..." },
    "./exact/client": { "import": "...", "require": "..." },
    "./exact/server": { "import": "...", "require": "..." },
    "./exact/facilitator": { "import": "...", "require": "..." }
  }
}
```

### 6.3 How Registration Works

The `x402Facilitator` class in `@x402/core` manages mechanism registration:

```typescript
// Storage: Map<x402Version, SchemeData<SchemeNetworkFacilitator>[]>
const facilitator = new x402Facilitator();

// Register a mechanism for specific networks
facilitator.register(
  ["aptos:1", "aptos:2"],           // supported networks
  new ExactAptosScheme(signer)      // SchemeNetworkFacilitator implementation
);

// Discovery
facilitator.getSupported();  // Returns { kinds, extensions, signers }

// Matching: exact Set.has() match → wildcard regex match
facilitator.verify(payload, requirements);
facilitator.settle(payload, requirements);
```

**Matching logic:**
1. Get `SchemeData[]` for the payment's `x402Version`
2. Iterate facilitators, match on `scheme` name
3. Check network: exact match via `Set.has()`, then pattern regex (`"aptos:*"` → `/^aptos:.*$/`)

---

## 7. TypeScript Interfaces

### 7.1 SchemeNetworkClient (client-side)

```typescript
interface SchemeNetworkClient {
  readonly scheme: string;

  createPaymentPayload(
    x402Version: number,
    paymentRequirements: PaymentRequirements,
    context?: PaymentPayloadContext,
  ): Promise<PaymentPayloadResult>;
}

type PaymentPayloadResult = Pick<PaymentPayload, "x402Version" | "payload"> & {
  extensions?: Record<string, unknown>;
};

interface PaymentPayloadContext {
  extensions?: Record<string, unknown>;
}
```

### 7.2 SchemeNetworkFacilitator (facilitator-side)

```typescript
interface SchemeNetworkFacilitator {
  readonly scheme: string;
  readonly caipFamily: string;  // e.g., "aptos:*", "eip155:*", "solana:*"

  getExtra(network: Network): Record<string, unknown> | undefined;
  getSigners(network: string): string[];

  verify(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    context?: FacilitatorContext,
  ): Promise<VerifyResponse>;

  settle(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    context?: FacilitatorContext,
  ): Promise<SettleResponse>;
}

interface FacilitatorContext {
  getExtension<T extends FacilitatorExtension>(key: string): T | undefined;
}
```

### 7.3 SchemeNetworkServer (resource server-side)

```typescript
interface SchemeNetworkServer {
  readonly scheme: string;

  parsePrice(price: Price, network: Network): Promise<AssetAmount>;

  enhancePaymentRequirements(
    paymentRequirements: PaymentRequirements,
    supportedKind: {
      x402Version: number;
      scheme: string;
      network: Network;
      extra?: Record<string, unknown>;
    },
    facilitatorExtensions: string[],
  ): Promise<PaymentRequirements>;
}

type MoneyParser = (amount: number, network: Network) => Promise<AssetAmount | null>;

type AssetAmount = {
  asset: string;
  amount: string;
  extra?: Record<string, unknown>;
};

type Price = Money | AssetAmount;
type Money = string | number;
```

### 7.4 Signer Abstractions (from Aptos reference)

```typescript
// Client-side: direct account/key
type ClientAptosSigner = Account;

// Facilitator-side: minimal interface
type FacilitatorAptosSigner = {
  getAddresses(): readonly string[];
  signAndSubmitAsFeePayer(tx, senderAuth, network): Promise<PendingTransactionResponse>;
  submitTransaction(tx, senderAuth, network): Promise<PendingTransactionResponse>;
  simulateTransaction(tx, network): Promise<void>;
  waitForTransaction(txHash, network): Promise<void>;
};
```

### 7.5 Chain-Specific Types (from Aptos reference)

```typescript
// Encoded payload in PaymentPayload.payload.transaction
type ExactAptosPayload = {
  transaction: string;  // Base64 encoded JSON of DecodedAptosPayload
};

// Decoded structure
type DecodedAptosPayload = {
  transaction: number[];           // BCS-serialized SimpleTransaction bytes
  senderAuthenticator: number[];   // BCS-serialized AccountAuthenticator bytes
};
```

---

## 8. CAIP-2 Network Identifiers

### 8.1 Format

```
chain_id = namespace + ":" + reference
```

- `namespace`: `[-a-z0-9]{3,8}`
- `reference`: `[-_a-zA-Z0-9]{1,32}`

### 8.2 Existing Chains in x402

| Chain | CAIP-2 Mainnet | CAIP-2 Testnet |
|-------|---------------|----------------|
| Ethereum/Base | `eip155:8453` | `eip155:84532` |
| Solana | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` | `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` |
| Aptos | `aptos:1` | `aptos:2` |
| Avalanche | `eip155:43114` | `eip155:43113` |

### 8.3 TON CAIP-2

**Namespace:** `tvm` (TVM ecosystem — shared with Everscale, Venom)

**Format:** `tvm:<global_id>`

| Network | global_id | CAIP-2 |
|---------|-----------|--------|
| TON Mainnet | -239 | `tvm:-239` |
| TON Testnet | -3 | `tvm:-3` |

Source: [Chain Agnostic Namespaces — TVM](https://namespaces.chainagnostic.org/tvm/caip2)

**Validation regex:** `[-]?[0-9]{1,10}`

**Verification:** Query any block's `global_id` property from a TON node.

**Note:** The TVM namespace is a draft specification (as of March 2023). There is no central registry for `global_id` conflicts.

### 8.4 CAIP Family Pattern for TON

For the `SchemeNetworkFacilitator.caipFamily` property and the `signers` key in `/supported` response:

```typescript
readonly caipFamily = "tvm:*";
```

```json
{
  "signers": {
    "tvm:*": ["EQDr..."]
  }
}
```

---

## 9. Contribution Requirements

### 9.1 Spec Contribution Process

1. **Discussion Phase** — Open GitHub issue/discussion before drafting
2. **Draft Specification** — Use `scheme_impl_template.md` for chain-specific specs
3. **Submit PR** — Place at `specs/schemes/exact/scheme_exact_ton.md`

### 9.2 Required Spec Sections

From `scheme_impl_template.md`:
1. **Summary** — Purpose and behavior, example use cases
2. **X-Payment Header Payload** — How to construct payment payload
3. **Verification** — Steps to verify a payment is valid
4. **Settlement** — How to settle a payment on-chain
5. **Appendix** — Supplementary info

### 9.3 Writing Standards

- Use **MUST/MUST NOT** for mandatory behaviors
- Use **SHOULD/SHOULD NOT** for recommendations
- Use **MAY** for optional features
- Every section MUST include concrete examples
- Security: address replay prevention, authorization scope, settlement atomicity
- Reference core spec types, don't redefine them

### 9.4 Testing Standards

- Unit tests (`vitest.config.ts`)
- Integration tests (`vitest.integration.config.ts`)
- Both CJS and ESM output (via `tsup`)

---

## 10. TON-Specific Considerations

### 10.1 What a `@x402/ton` Package Needs

Based on the pattern established by `@x402/aptos`:

```
typescript/packages/mechanisms/ton/
├── package.json          # @x402/ton, deps: @x402/core + @ton/ton + @ton/crypto
├── tsup.config.ts
├── vitest.config.ts
├── src/
│   ├── index.ts          # Barrel exports
│   ├── constants.ts      # CAIP-2 IDs, USDC address, network mappers
│   ├── types.ts          # TonPaymentPayload types
│   ├── signer.ts         # Client + Facilitator signer abstractions
│   ├── utils.ts          # BOC serialization/deserialization
│   └── exact/
│       ├── index.ts
│       ├── client/
│       │   ├── index.ts
│       │   └── scheme.ts # implements SchemeNetworkClient
│       ├── facilitator/
│       │   ├── index.ts
│       │   └── scheme.ts # implements SchemeNetworkFacilitator
│       └── server/
│           ├── index.ts
│           └── scheme.ts # implements SchemeNetworkServer
```

### 10.2 Key Design Decisions Required

1. **Transfer mechanism**: TON uses internal messages + Jetton transfers (TEP-74). The Jetton `transfer` message is the equivalent of ERC-20 transfer.

2. **Gas sponsorship model**: TON doesn't have native fee payer abstraction like Aptos. Options:
   - Client sends pre-signed external message, facilitator broadcasts it (client pays gas)
   - Client constructs transfer, facilitator wraps in its own message (facilitator pays gas)
   - Use TON's internal message forwarding model

3. **Payload format**: Following Aptos/Solana pattern, likely:
   ```typescript
   type ExactTonPayload = {
     transaction: string;  // Base64-encoded BOC (Bag of Cells)
   };
   ```

4. **Replay prevention**: TON uses seqno (sequence number) for external messages, which is a natural replay prevention mechanism.

5. **Address format**: TON uses base64url-encoded addresses (EQ.../UQ...) or raw hex. Need to decide canonical format for `payTo` and signer addresses.

6. **Verification steps** (parallel to Aptos 11-step):
   - Validate x402Version
   - Validate scheme
   - Deserialize BOC
   - Verify signature
   - Check expiration (TON messages have `valid_until`)
   - Validate Jetton transfer message structure
   - Verify asset (Jetton master address)
   - Verify amount
   - Verify recipient
   - Check balance
   - Simulate via `runGetMethod` or similar

### 10.3 Constants to Define

```typescript
export const TON_MAINNET_CAIP2 = "tvm:-239";
export const TON_TESTNET_CAIP2 = "tvm:-3";

// USDC on TON (Jetton master address)
export const USDC_MAINNET_JETTON = "EQ...";  // Need actual address
export const USDC_TESTNET_JETTON = "EQ...";  // Need actual address

// Address validation
export const TON_ADDRESS_REGEX = /^[EU]Q[A-Za-z0-9_-]{46}$/;
```

### 10.4 Signer Abstraction for TON

```typescript
// Client-side
type ClientTonSigner = {
  address: string;
  sign(message: Buffer): Promise<Buffer>;
  // or use @ton/ton WalletContractV4
};

// Facilitator-side
type FacilitatorTonSigner = {
  getAddresses(): readonly string[];
  sendTransaction(boc: Buffer, network: string): Promise<{ hash: string }>;
  simulateTransaction(boc: Buffer, network: string): Promise<void>;
  waitForTransaction(hash: string, network: string): Promise<void>;
};
```

---

## Appendix A: Discovery API (V2)

### GET /discovery/resources

```json
{
  "x402Version": 2,
  "items": [
    {
      "resource": "https://api.example.com/premium-data",
      "type": "http",
      "x402Version": 2,
      "accepts": [{ /* PaymentRequirements */ }],
      "lastUpdated": 1703123456,
      "metadata": {
        "category": "finance",
        "provider": "Example Corp"
      }
    }
  ],
  "pagination": { "limit": 10, "offset": 0, "total": 1 }
}
```

## Appendix B: V2 Transport Specs

Three transport specifications exist for V2:
- **HTTP** (`transports-v2/http.md`) — Standard HTTP 402 flow with headers
- **MCP** (`transports-v2/mcp.md`) — Model Context Protocol integration
- **A2A** (`transports-v2/a2a.md`) — Agent-to-Agent protocol

## Appendix C: Extension System

Extensions enable modular optional functionality. The EVM scheme uses `erc20ApprovalGasSponsoring` extension for Permit2 approval sponsorship.

```typescript
interface FacilitatorExtension {
  key: string;
}

interface ResourceServerExtension {
  key: string;
  enrichDeclaration?(declaration, transportContext): unknown;
  enrichPaymentRequiredResponse?(declaration, context): Promise<unknown>;
  enrichSettlementResponse?(declaration, context): Promise<unknown>;
}
```

Extensions are registered on the facilitator and passed to mechanism implementations via `FacilitatorContext`.

## Appendix D: Complete Aptos Facilitator Verification Code Pattern

This shows the exact verification pattern that a TON implementation should follow:

```
verify(payload, requirements):
  1. Extract requirements from payload.accepted
  2. Validate x402Version === 2
  3. Confirm scheme === "exact"
  4. Deserialize chain-specific payload (BCS for Aptos, BOC for TON)
  5. Validate chain ID matches network
  6. Check expiration with buffer
  7. Validate transfer function/operation
  8. Verify asset matches requirements.asset
  9. Verify amount matches requirements.amount
  10. Confirm recipient matches requirements.payTo
  11. Check sender balance
  12. Simulate transaction

settle(payload, requirements):
  1. Deserialize payload
  2. If sponsored: sign as fee payer + submit
  3. If non-sponsored: submit directly
  4. Wait for confirmation
  5. Return { success, transaction hash, network, payer }
```
