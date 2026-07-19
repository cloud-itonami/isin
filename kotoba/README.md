# isin kotoba

Phase E Option B reference implementation of isin (ISO 6166 security registry) on the etzhayyim substrate.

Per [ADR-2605203000](../../../90-docs/adr/2605203000-kotoba-write-target-options.md), isin migrates from vendor's `createKyselyDb` pattern to **Option B** — PDS XRPC writes via `@etzhayyim/sdk e.write()`.

Coverage: **11 of 11 (100%) canonical** isin commands ported.

| Tier | Commands | Slice |
|---|---|---|
| Security | registerSecurity, getSecurity, searchSecurities, listSecurities, listByCountry | 1 |
| Entity (LEI) | registerEntity | 1 |
| Validation | validateIsin | 1 |
| Dashboard | getDashboard | 1 |
| Collect | collectSecurities, collectEntityIR, enrichISIN | **2** |

isin kotoba Option B reference impl is now complete at canonical surface.

## Authority-chain DIDs

```
did:web:isin.etzhayyim.com                              — App coordinator
did:web:isin.etzhayyim.com:{cc}                         — Country entity (us / jp)
did:web:isin.etzhayyim.com:security:{isin}              — Security record
did:web:isin.etzhayyim.com:entity:{lei}                 — Issuer (LEI-keyed)
```

## ISIN check-digit validation (ISO 6166)

```
ISIN format: ISO 3166-1 alpha-2 (2 chars) + national 9 chars + check digit (1)
```

The check-digit algorithm:
1. Convert each char to digits (A=10, B=11, ..., Z=35)
2. Concatenate into a long numeric string
3. From right, double every other digit; if doubled ≥ 10 sum digits
4. Compute `(10 - sum % 10) % 10`

`isValidIsin()` returns boolean. `validateIsin()` returns `{ valid, isin, countryAlpha2, nsin, checkDigit }` for telemetry.

## LEI check-digit validation (ISO 17442)

Legal Entity Identifier — 20-char alphanumeric with ISO/IEC 7064 MOD 97-10 check (numeric form `mod 97 == 1`). `isValidLei()` returns boolean. `registerEntity` and `registerSecurity` (via `issuerLei`) both validate.

## Usage

```ts
import { Etzhayyim } from "@etzhayyim/sdk";
import {
  registerEntity,
  registerSecurity,
  validateIsin,
} from "@etzhayyim/isin-kotoba";

const e = new Etzhayyim({
  did: "did:web:isin.etzhayyim.com",
  pdsUrl: "https://pds.etzhayyim.com",
  l2RpcUrl: "https://mainnet.base.org",
});

// Pre-validate
const v = await validateIsin(e, { isin: "US0378331005" });
// → { valid: true, isin: "US0378331005", countryAlpha2: "US",
//     nsin: "037833100", checkDigit: 5 }

// Register issuer
const ent = await registerEntity(e, {
  lei: "HWUPKR0MPOU8FGXBT394",
  name: "Apple Inc.",
  country: "usa",
  irUrl: "https://investor.apple.com",
});

// Register security
const s = await registerSecurity(e, {
  isin: "US0378331005",
  name: "Apple Inc. Common Stock",
  issuerLei: "HWUPKR0MPOU8FGXBT394",
  assetClass: "equity",
  cfi: "ESVUFR",
  currency: "USD",
  country: "usa",
  exchangeMic: "XNAS",
});
```

## Sibling reference impls (15 actors)

| Actor | Coverage | Status |
|---|---|---|
| (previously) | 14 actors canonical complete | — |
| **isin** | **8 of 11 canonical** | **active (4 ingest/enrich pending)** |
