# x402-TON Payment Facilitator: Security & Architecture Reference

> Produced by Security & Architecture Expert | 2026-03-04

---

## Table of Contents

1. [x402 Security Model Analysis](#1-x402-security-model-analysis)
2. [TON-Specific Security Concerns](#2-ton-specific-security-concerns)
3. [Payment Facilitator Security Best Practices](#3-payment-facilitator-security-best-practices)
4. [Cryptographic Verification Patterns](#4-cryptographic-verification-patterns)
5. [Enterprise Architecture Patterns](#5-enterprise-architecture-patterns)
6. [Scalability Considerations](#6-scalability-considerations)
7. [Testing Strategy](#7-testing-strategy)
8. [Compliance & Legal](#8-compliance--legal)

---

## 1. x402 Security Model Analysis

### 1.1 Replay Attack Prevention

**Severity: CRITICAL**

x402 uses multiple layers to prevent replay attacks:

- **Unique nonce**: Each payment payload includes a 32-byte random nonce (`ethers.hexlify(ethers.randomBytes(32))`). The facilitator MUST track used nonces and reject duplicates.
- **Time-bounded validity**: `validAfter` and `validBefore` Unix timestamps create a window during which the payment is valid. Outside this window, the facilitator MUST reject.
- **EIP-712 domain separator** (EVM schemes): Binds signature to contract address + chain ID, preventing cross-network replay.
- **Session ID binding**: Each payment is bound to a specific request context.

**Recommendation for TON facilitator:**
```
// Nonce tracking table
CREATE TABLE used_nonces (
  nonce TEXT PRIMARY KEY,
  payment_hash TEXT NOT NULL,
  settled_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL  -- for TTL-based cleanup
);

// On verify: reject if nonce exists
// On settle: INSERT nonce atomically with settlement
// Periodically: DELETE WHERE expires_at < now() - retention_period
```

**TON-specific adaptation**: TON wallet contracts use `seqno` (sequence number) for replay protection. Each external message must carry a seqno matching the wallet's stored counter. After processing, the counter increments, making the old message invalid. Our facilitator wallet's seqno provides a second layer of replay protection at the blockchain level.

### 1.2 Double-Spend Prevention

**Severity: CRITICAL**

x402 relies on blockchain consensus for finality. For TON:

- TON has ~5 second block times with fast finality via validator signatures
- Use the `last_trans_lt` (logical time) from the account state to confirm transaction inclusion
- Track transaction hashes in the facilitator DB to prevent double-settlement
- Settlement must be atomic: check nonce + submit TX + record hash in one DB transaction

**State machine for double-spend safety:**
```
PENDING → VERIFYING → VERIFIED → SETTLING → SETTLED → CONFIRMED
                                     ↓
                                  FAILED (retryable)
                                     ↓
                                  EXPIRED (terminal)
```

Only one transition from VERIFIED → SETTLING is allowed per payment. Use database row-level locking:
```sql
UPDATE payments SET status = 'settling'
WHERE payment_hash = ? AND status = 'verified'
RETURNING *;
-- If 0 rows affected → another instance already settling
```

### 1.3 x402 V2 Attack Vectors

**Severity: HIGH**

x402 V2 introduced new attack surfaces documented by security researchers:

1. **Recipient Address Manipulation**: Dynamic `payTo` routing allows servers to change recipient per-request. A compromised API returns an attacker-controlled address.
   - **Mitigation**: Recipient allowlists. Log and alert on first-seen addresses.

2. **Session Token Theft**: Post-payment session tokens grant repeated access. If leaked via logging or middleware, attackers get free access.
   - **Mitigation**: 15-30 minute TTLs, per-session spending caps, bind to wallet address + request fingerprint.

3. **Malicious Plugin Injection**: Modular SDK architecture creates supply chain attack surface. Typosquatting on `@x402/*` packages.
   - **Mitigation**: Pin exact versions, verify publisher identity, audit dependencies.

4. **Chain Confusion**: Standardized CAIP identifiers enable requests on testnet chains or high-gas networks.
   - **Mitigation**: Chain allowlist restricted to funded/expected networks only.

5. **Header Migration Blind Spots**: Move from `X-PAYMENT` to `PAYMENT-SIGNATURE` creates monitoring gaps.
   - **Mitigation**: Support both headers during transition, update WAF rules.

### 1.4 Signature Verification & MITM Prevention

**Severity: CRITICAL**

Every x402 payment payload is cryptographically signed by the buyer's wallet. The facilitator verifies:
1. Signature matches the claimed `from` address
2. Signed data includes `to`, `value`, `validAfter`, `validBefore`, `nonce`
3. Any tampering invalidates the signature

For TON: Use Ed25519 signatures (TON's native curve). The facilitator must verify against the wallet's public key, which can be derived from the wallet contract's stored public key via `get_public_key` get-method.

---

## 2. TON-Specific Security Concerns

### 2.1 Jetton Spoofing Attacks

**Severity: CRITICAL**

TON's distributed jetton architecture (each user has their own jetton wallet contract) creates a unique attack vector: **fake `transfer_notification` messages**.

**Attack mechanism:**
- Attacker deploys a fake jetton wallet contract
- Sends `transfer_notification` to the facilitator contract
- If the facilitator doesn't validate the sender address, it credits a fake deposit

**Prevention (MANDATORY):**
```
// On receiving transfer_notification:
1. Extract sender_address from internal message
2. Call get_wallet_address(our_address) on the KNOWN jetton master contract
3. Verify sender_address == expected_jetton_wallet_address
4. Only then credit the transfer

// NEVER trust the jetton master address from the message itself
// ALWAYS use a pre-configured, hardcoded jetton master address
```

**Additional validations:**
- Validate `forward_payload` contents explicitly (never trust user-provided values)
- Ensure `forward_ton_amount >= 1 nanoton` for notification compliance
- Use one wallet per token for all deposits/withdrawals to reduce attack surface

### 2.2 Address Format Validation

**Severity: HIGH**

TON addresses have critical format nuances:

| Format | Structure | Checksum | Use Case |
|--------|-----------|----------|----------|
| Raw | `workchain:hex_account_id` | None | System-level only |
| User-friendly bounceable | `0x11` flag + workchain + account + CRC16 | Yes | Smart contracts |
| User-friendly non-bounceable | `0x51` flag + workchain + account + CRC16 | Yes | Wallets |

**Validation requirements:**
- ALWAYS validate CRC16-CCITT checksum
- ALWAYS check workchain (0 for basechain, -1 for masterchain)
- REJECT raw addresses in user-facing APIs (no checksum = typo risk = lost funds)
- Validate bounceable flag matches expected contract type
- Check testnet flag byte (`+0x80`) — reject testnet addresses on mainnet
- Normalize all addresses to a canonical form before comparison/storage

### 2.3 TON Replay Protection (Wallet seqno)

**Severity: CRITICAL**

TON wallets use seqno + valid_until for replay protection:

- **seqno**: Monotonically increasing counter. Each outgoing message must match the wallet's current seqno.
- **valid_until**: Unix timestamp after which the message is rejected
- **subwallet_id**: 32-bit identifier preventing cross-wallet and cross-network replay

**Facilitator wallet requirements:**
- Track seqno locally to avoid RPC round-trips
- Handle seqno conflicts when multiple settlement attempts race
- Set `valid_until` to `now + 60s` (tight window to limit replay exposure)
- Use unique `subwallet_id` for mainnet vs testnet

### 2.4 Cross-Shard Timing Attacks

**Severity: MEDIUM**

TON is a multi-shard blockchain. Messages between shards are asynchronous:

- A transfer from shard A to shard B takes 1-2 blocks (~5-10s)
- During this window, the sender's balance is debited but the receiver hasn't credited
- An attacker could attempt to exploit this gap for double-spend

**Mitigation:**
- Wait for full cross-shard confirmation before marking settlement as CONFIRMED
- Track both the sending transaction (in sender's shard) AND the receiving transaction
- Use `account.last_trans_lt` on the destination to confirm receipt

### 2.5 Bounce Message Handling

**Severity: HIGH**

Bounced messages account for 38.7% of TON smart contract vulnerabilities (per academic research). When a message to an uninitialized/frozen account bounces:

- The bounced message contains the original `op` code
- If not checked, the contract processes the bounce AS IF it were a new request
- This can trick the facilitator into crediting a "refund" that never happened

**Requirement:** ALWAYS check the `bounced` flag on incoming internal messages BEFORE parsing the operation code. Reject or handle bounced messages in a dedicated path.

---

## 3. Payment Facilitator Security Best Practices

### 3.1 Key Management

**Severity: CRITICAL**

The facilitator wallet holds funds for settlement. Key compromise = total loss.

| Tier | Method | Use Case |
|------|--------|----------|
| Production | HSM / Cloud KMS (FIPS 140-2 Level 3) | Sign settlement transactions |
| Staging | Encrypted env vars + memory-only decryption | Testing with real keys |
| Development | Testnet mnemonics in `.env` | Local development only |

**Requirements:**
- Mnemonic NEVER in source code, config files, or logs
- Use split knowledge / dual control for production key ceremony
- Key rotation plan: generate new wallet, migrate funds, update config
- Sign in an isolated process/container (minimal attack surface)
- File permissions: `mode: 0o600` for any key material on disk
- Pino logger with `redact: ['*.mnemonic', '*.privateKey', '*.secret']`

### 3.2 Rate Limiting

**Severity: HIGH**

Public facilitator endpoints (`/verify`, `/settle`) are DDoS targets.

**Multi-level rate limiting:**

| Level | Limit | Scope |
|-------|-------|-------|
| Global | 1000 req/min | All endpoints combined |
| Per-IP | 60 req/min verify, 20 req/min settle | Individual client |
| Per-wallet | 30 req/min verify, 10 req/min settle | By `from` address |
| Per-amount | Flag transactions > $1000 | Anomaly detection |

**Implementation pattern:**
```typescript
// Token bucket per wallet address
const rateLimiter = new Map<string, { tokens: number; lastRefill: number }>();

function checkRate(wallet: string, limit: number): boolean {
  const bucket = rateLimiter.get(wallet) ?? { tokens: limit, lastRefill: Date.now() };
  const elapsed = Date.now() - bucket.lastRefill;
  bucket.tokens = Math.min(limit, bucket.tokens + (elapsed / 60000) * limit);
  bucket.lastRefill = Date.now();
  if (bucket.tokens < 1) return false; // 429
  bucket.tokens -= 1;
  rateLimiter.set(wallet, bucket);
  return true;
}
```

**Settle endpoint specifics:**
- Stricter limits (settlement = on-chain cost)
- Require valid verification before allowing settle
- Graduated response: 429 → temporary ban → permanent ban

### 3.3 Audit Logging

**Severity: HIGH**

**What to log (structured JSON via Pino):**
- Every verify request: timestamp, from, to, amount, asset, nonce, result (pass/fail), reason
- Every settle request: timestamp, payment_hash, tx_hash, status, gas_used
- Every state transition: payment_hash, old_status → new_status, trigger
- All errors: full context without sensitive data
- Rate limit events: IP, wallet, endpoint, action taken

**What NOT to log:**
- Private keys, mnemonics, raw signatures (redact via Pino config)
- Full request bodies containing payment secrets

**Retention:**
- Hot storage: 90 days (for dispute resolution)
- Cold storage: 7 years (regulatory compliance)
- Immutability: append-only log, hash-chained entries for tamper detection

### 3.4 DDoS Protection

**Severity: HIGH**

- Deploy behind reverse proxy (nginx/Cloudflare) with connection limits
- Separate public endpoints (/verify, /settle) from internal admin endpoints
- Implement request body size limits (x402 payloads are small, ~2KB max)
- Use dynamic rate limiting that adjusts based on current load
- Health check endpoint should be lightweight and not expose internal state
- Consider proof-of-work challenge for anonymous verify requests

---

## 4. Cryptographic Verification Patterns

### 4.1 Ed25519 Signature Verification (TON)

**Severity: CRITICAL**

TON uses Ed25519 for all wallet signatures. Key considerations:

- Ed25519 signing is **deterministic** (no RNG needed during signing — eliminates a class of bugs)
- RFC 8032 does NOT fully specify validation criteria — implementations vary
- Use a well-audited library (`tweetnacl`, `@noble/ed25519`, or `ton-crypto`)
- Verify against the wallet contract's stored public key (call `get_public_key` get-method)
- NEVER accept a public key from the payment payload itself (attacker can supply their own)

**Verification flow:**
```
1. Extract `from` address from payment payload
2. Resolve wallet contract on-chain
3. Call get_public_key() on the wallet contract
4. Verify Ed25519 signature against this public key
5. Verify signed message matches payload (amount, to, nonce, expiry)
```

### 4.2 Time-Based Expiry Validation

**Severity: HIGH**

Clock skew between client, facilitator, and blockchain nodes can cause valid payments to be rejected or expired payments to be accepted.

**Recommendations:**
- Allow clock skew tolerance of **30 seconds** (conservative for blockchain)
- NTP synchronization mandatory on facilitator servers
- `validAfter` check: `now >= validAfter - SKEW_TOLERANCE`
- `validBefore` check: `now <= validBefore + SKEW_TOLERANCE`
- TON wallet `valid_until`: set to `now + 60s` for settlement messages
- Log all expiry rejections with both server time and payload timestamps for debugging

### 4.3 Amount Validation

**Severity: CRITICAL**

Floating-point arithmetic is the enemy of financial systems.

**Rules:**
- ALL amounts stored as integers in smallest unit (nanoTON = 10^9, jetton decimals vary)
- NEVER use `Math.floor(amount * 10**decimals)` — floating point drift
- Use string-based decimal conversion: parse string → split on "." → pad/truncate → BigInt
- Validate: amount > 0, amount <= MAX_SAFE_AMOUNT, amount matches requested price
- Check for overflow: `BigInt(amount) <= BigInt("2") ** BigInt("120")` (practical max)
- Underflow: reject amounts that round to 0 in smallest unit

**Pattern:**
```typescript
function parseAmount(amountStr: string, decimals: number): bigint {
  const [whole, frac = ""] = amountStr.split(".");
  const padded = frac.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(whole + padded);
}
```

### 4.4 Idempotency Keys for Settlement

**Severity: CRITICAL**

Double-settlement is catastrophic — funds sent twice cannot be recalled.

**Airbnb-style idempotency pattern:**
1. Client generates idempotency key (payment hash serves this role in x402)
2. On settle request, check `settlements` table for existing entry
3. If found with status=SETTLED, return cached result (idempotent)
4. If found with status=SETTLING, return 409 Conflict (in progress)
5. If not found, INSERT with status=SETTLING within a DB transaction
6. Submit blockchain TX
7. UPDATE status=SETTLED with tx_hash

**Database schema:**
```sql
CREATE TABLE settlements (
  payment_hash TEXT PRIMARY KEY,
  idempotency_key TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('settling','settled','failed','expired')),
  tx_hash TEXT,
  tx_lt BIGINT,        -- TON logical time
  amount TEXT NOT NULL, -- stored as string (BigInt)
  asset TEXT NOT NULL,
  from_addr TEXT NOT NULL,
  to_addr TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  retry_count INTEGER DEFAULT 0
);
```

### 4.5 Partial Failure Handling

**Severity: HIGH**

The most dangerous state: payment verified but settlement fails mid-flight.

**Scenarios and responses:**

| Scenario | Response |
|----------|----------|
| Verify passes, settle TX submitted but no confirmation | Poll for TX status with exponential backoff (max 5 min) |
| TX submitted, node returns error | Check if TX landed on-chain anyway (nodes can lie) |
| TX confirmed but facilitator DB update fails | On restart, reconcile DB against chain state |
| TX expired (valid_until passed) | Mark as FAILED, increment seqno, allow retry with new TX |
| Facilitator crashes mid-settle | On restart, scan SETTLING records, check chain, reconcile |

**Recovery pattern:**
```
On startup:
  SELECT * FROM settlements WHERE status = 'settling';
  For each:
    Check blockchain for tx_hash
    If confirmed → UPDATE status = 'settled'
    If not found AND created_at + timeout < now → UPDATE status = 'failed'
    If not found AND within timeout → re-submit with same seqno
```

---

## 5. Enterprise Architecture Patterns

### 5.1 Transaction State Machine

**Severity: CRITICAL**

Every payment moves through a strict state machine. No skipping states.

```
           ┌─────────┐
           │ RECEIVED │  (payload parsed, basic validation)
           └────┬─────┘
                │
           ┌────▼─────┐
           │ VERIFYING │  (signature check, amount, expiry, nonce)
           └────┬─────┘
                │
         ┌──────┴──────┐
    ┌────▼─────┐  ┌────▼────┐
    │ VERIFIED │  │ REJECTED │ (terminal)
    └────┬─────┘  └─────────┘
         │
    ┌────▼─────┐
    │ SETTLING │  (TX submitted to blockchain)
    └────┬─────┘
         │
    ┌────┴──────┐
┌───▼────┐ ┌───▼───┐
│ SETTLED│ │FAILED │ (retryable up to N times)
└───┬────┘ └───┬───┘
    │          │
┌───▼──────┐  │ (after max retries)
│CONFIRMED │  ▼
└──────────┘ EXPIRED (terminal)
```

**Enforce in code:**
```typescript
const VALID_TRANSITIONS: Record<string, string[]> = {
  received:  ["verifying"],
  verifying: ["verified", "rejected"],
  verified:  ["settling"],
  settling:  ["settled", "failed"],
  settled:   ["confirmed"],
  failed:    ["settling", "expired"], // retry or give up
};

function transition(current: string, next: string): boolean {
  return VALID_TRANSITIONS[current]?.includes(next) ?? false;
}
```

### 5.2 Circuit Breaker for TON RPC

**Severity: HIGH**

TON RPC/lite-server endpoints can become unavailable. The facilitator must not cascade failures.

**Three states:**
- **CLOSED** (normal): Requests flow through. Track error rate.
- **OPEN** (failing): Reject all requests immediately with 503. Return cached balance if available.
- **HALF-OPEN** (testing): Allow 1 probe request. If success → CLOSED. If fail → OPEN.

**Configuration:**
```typescript
const circuitConfig = {
  failureThreshold: 5,        // errors before opening
  successThreshold: 2,        // successes in half-open before closing
  timeout: 30_000,            // ms before half-open attempt
  monitorWindow: 60_000,      // rolling window for failure count
};
```

**Specific to TON:**
- Maintain multiple lite-server endpoints (failover pool)
- Circuit breaker per endpoint, not global
- On OPEN: return 503 to settle requests, but still serve verify (offline verification possible)
- Alert on circuit open events

### 5.3 Health Checks & Monitoring

**Severity: HIGH**

**Health check endpoint (`GET /health`):**
```json
{
  "status": "healthy|degraded|unhealthy",
  "checks": {
    "database": { "status": "up", "latency_ms": 2 },
    "ton_rpc": { "status": "up", "latency_ms": 150, "block_seqno": 12345678 },
    "wallet_balance": { "status": "ok", "ton": "10.5", "usdt": "1000.0" },
    "settlement_queue": { "pending": 3, "oldest_age_s": 12 }
  },
  "uptime_s": 86400
}
```

**Monitoring alerts:**
| Metric | Threshold | Severity |
|--------|-----------|----------|
| Settlement failure rate | > 5% over 5 min | CRITICAL |
| Verify latency p99 | > 2s | HIGH |
| Wallet balance | < min threshold | CRITICAL |
| Circuit breaker opens | Any | HIGH |
| Nonce collision | Any | CRITICAL (indicates replay attempt) |
| Seqno mismatch | Any | HIGH |
| DB connection pool exhaustion | > 80% | HIGH |

### 5.4 Graceful Degradation

**Severity: MEDIUM**

When TON RPC is down:

| Capability | Available? | Fallback |
|------------|-----------|----------|
| Verify (signature check) | YES | Offline Ed25519 verification against cached public keys |
| Verify (balance check) | DEGRADED | Use cached balance with staleness warning |
| Settle | NO | Queue for retry, return 503 with Retry-After header |
| Confirm | NO | Defer, poll when RPC recovers |
| Health check | YES | Report degraded status |

---

## 6. Scalability Considerations

### 6.1 Horizontal Scaling

**Severity: MEDIUM**

Multiple facilitator instances can serve verify requests in parallel. Settlement requires coordination.

**Shared state requirements:**
- PostgreSQL/SQLite for transaction state (ACID guarantees)
- For multi-instance: use PostgreSQL with advisory locks for settlement
- Single-instance with SQLite: simpler, sufficient for moderate load (~100 TPS)

**Settlement serialization:**
```sql
-- Only one instance can settle a given payment
SELECT pg_try_advisory_lock(hashtext(payment_hash));
-- Returns true if lock acquired, false if another instance has it
```

### 6.2 Caching Strategy

**Severity: MEDIUM**

| Data | Cache TTL | Invalidation |
|------|-----------|-------------|
| Wallet public keys | 24h | On first verification failure |
| Jetton wallet addresses | 24h | On jetton master contract update |
| TON account balance | 10s | On settlement |
| Jetton balance | 10s | On settlement |
| Used nonces | Permanent (with TTL cleanup) | Never (append-only) |
| Block seqno | 5s | Continuous polling |

### 6.3 Connection Pooling for TON RPC

**Severity: MEDIUM**

- Maintain pool of 3-5 lite-server connections
- Round-robin with health-check weighting
- Connection timeout: 5s, request timeout: 10s
- Automatic reconnection with exponential backoff
- Separate pools for read (get_account, run_get_method) and write (send_message)

### 6.4 Queue-Based Settlement

**Severity: MEDIUM**

For high throughput, decouple verification from settlement:

```
Client → /verify → immediate response (verified=true)
                  ↓
              Queue (DB-backed)
                  ↓
         Settlement Worker → TON blockchain
                  ↓
              /settle-status → poll for result
```

Benefits: verify at thousands of TPS, settle at blockchain speed (~5s/block). Risk: increased latency for settlement confirmation.

---

## 7. Testing Strategy

### 7.1 Testnet Strategy

**Severity: HIGH**

- TON Testnet mirrors mainnet behavior (same consensus, same smart contracts)
- Use testnet TON from @testgiver_ton_bot
- Deploy test jetton master contract on testnet for USDT testing
- **Never** mix testnet and mainnet addresses — validate `subwallet_id` / address flags
- Run full integration suite against testnet on every release

### 7.2 Fuzz Testing

**Severity: HIGH**

Fuzz these inputs:
| Target | Fuzzing Strategy |
|--------|-----------------|
| Payment payload parsing | Random bytes, truncated JSON, oversized fields |
| Amount parsing | Boundary values ("0", "0.0000000001", "999999999999999.999999999", negative, NaN) |
| Address validation | Random strings, testnet addresses, masterchain addresses, raw format |
| Signature verification | Valid sig + tampered payload, truncated sig, wrong curve |
| Nonce handling | Duplicate nonces, empty nonce, very long nonce |
| Expiry timestamps | Past dates, far future, epoch 0, negative, overflow |

**Tools:** Property-based testing with `fast-check` in Vitest:
```typescript
import fc from "fast-check";

test("amount parsing never throws on arbitrary strings", () => {
  fc.assert(fc.property(fc.string(), (input) => {
    const result = parseAmount(input);
    // Should return a valid bigint or throw a controlled error
    expect(() => parseAmount(input)).not.toThrow(TypeError);
  }));
});
```

### 7.3 Integration Test Patterns

**Severity: HIGH**

```
Unit Tests (fast, no network)
├── Signature verification with known test vectors
├── Amount parsing edge cases
├── State machine transition validation
├── Nonce collision detection
└── Address format validation

Integration Tests (testnet)
├── Full verify → settle → confirm flow
├── Double-settlement prevention (concurrent requests)
├── Expired payment rejection
├── Invalid signature rejection
├── Circuit breaker activation/recovery
└── Jetton transfer verification

E2E Tests (testnet + HTTP)
├── Full HTTP 402 flow (client → server → facilitator)
├── Rate limiting behavior
├── Health check accuracy
└── Graceful degradation under RPC failure
```

### 7.4 Load Testing

**Severity: MEDIUM**

- Target: sustain 100 verify/s with p99 < 500ms
- Target: sustain 10 settle/s (blockchain-limited)
- Use k6 or artillery with realistic payload generation
- Test with simultaneous identical nonces (race conditions)
- Test circuit breaker under sustained RPC failures
- Monitor memory growth over extended runs (detect leaks)

---

## 8. Compliance & Legal

### 8.1 Regulatory Landscape (2026)

**Severity: HIGH**

- **73% of jurisdictions** now implementing Travel Rule legislation (FATF 2025)
- **EU TFR** (effective Dec 2024): Every crypto transfer, regardless of size, must include full sender/recipient details
- **US BSA**: Transfers over $3,000 require originator/beneficiary details (threshold may lower)
- **MiCA** (EU): Full regulatory framework for crypto-asset service providers

### 8.2 Travel Rule Applicability

**Severity: HIGH**

For agent-to-agent payments:
- If the facilitator is classified as a VASP (Virtual Asset Service Provider), Travel Rule applies
- x402 facilitators that hold funds (even briefly during settlement) may trigger VASP classification
- **Our design**: facilitator DOES NOT hold funds — signed payloads authorize direct transfers
- However, regulatory interpretation varies by jurisdiction

**Recommendation:**
- Design the facilitator to never take custody of funds
- Payment payloads authorize direct sender → recipient transfers
- Facilitator only submits pre-signed transactions
- Document this architecture for regulatory clarity
- Consider jurisdiction-specific compliance modules

### 8.3 What Existing x402 Facilitators Say

- Coinbase's facilitator operates under their existing regulatory framework
- The x402 spec explicitly states facilitators "do not hold funds or act as custodian"
- The protocol is designed to minimize regulatory surface: "performs verification and execution of onchain transactions based on signed payloads provided by clients"

### 8.4 Audit Trail for Compliance

**Severity: HIGH**

Maintain immutable records of:
- Every payment request (hashed, not raw — privacy preservation)
- Every settlement with on-chain tx hash (independently verifiable)
- All verification decisions (accepted/rejected + reason)
- Counterparty addresses (sender + recipient)
- Timestamps (server time + blockchain time)
- Amount + asset identification

---

## Summary: Priority Matrix

### CRITICAL (Must implement before launch)
1. Nonce tracking + replay prevention
2. Ed25519 signature verification against on-chain public keys
3. Jetton sender address validation (anti-spoofing)
4. Amount handling with string-based decimal conversion (no floating point)
5. Idempotency for settlement (prevent double-spend)
6. Transaction state machine with enforced transitions
7. Key management (HSM/KMS for production, never in code/logs)
8. TON wallet seqno management for settlement

### HIGH (Must implement before production traffic)
9. Rate limiting on verify/settle endpoints (multi-level)
10. Circuit breaker for TON RPC endpoints
11. Audit logging (structured, redacted, retained)
12. Time-based expiry with clock skew tolerance
13. Address format validation (checksum, workchain, bounce flag, testnet flag)
14. Bounce message handling (check bounced flag before op)
15. Partial failure recovery (SETTLING state reconciliation on startup)
16. Health checks and monitoring alerts
17. Recipient allowlists (V2 dynamic payTo protection)
18. Testnet integration test suite

### MEDIUM (Should implement for production readiness)
19. Graceful degradation (offline verify, queued settle)
20. Caching strategy (public keys, balances, jetton wallets)
21. Connection pooling for TON RPC
22. Cross-shard confirmation tracking
23. Load testing baseline
24. Fuzz testing for payload parsing
25. Session TTL and budget caps

### LOW (Nice to have)
26. Multi-instance horizontal scaling with advisory locks
27. Queue-based settlement decoupling
28. Compliance module for jurisdiction-specific rules
29. Hash-chained audit log entries
30. Dynamic rate limiting based on traffic patterns
