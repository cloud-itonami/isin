/**
 * isin kotoba — record types.
 *
 * Per ADR-2605203000 Option B (PDS XRPC). ISO 6166 ISIN-based security
 * registry. 1 Worker + N path-based DID per country prefix.
 *
 * ISIN format: ISO 3166-1 alpha-2 (2 chars) + national 9 chars + check digit (1).
 *
 * Identity hierarchy:
 *   did:web:isin.etzhayyim.com                              — App coordinator
 *   did:web:isin.etzhayyim.com:{cc}                         — Country entity (us / jp)
 *   did:web:isin.etzhayyim.com:security:{isin}              — Security record
 *   did:web:isin.etzhayyim.com:entity:{lei}                 — Issuer (LEI-keyed)
 */

export const ISIN_DID_PREFIX = "did:web:isin.etzhayyim.com:" as const;

export type AssetClass =
  | "equity"
  | "debt"
  | "derivative"
  | "fund"
  | "commodity"
  | "index"
  | "currency";

// ─── Security tier ──────────────────────────────────────────────────

export interface SecurityRecord {
  did: string;
  /** ISO 6166 12-character ISIN. */
  isin: string;
  name: string;
  /** ISO 17442 LEI of issuer (20 chars). */
  issuerLei?: string;
  /** legal-entity DID (typically did:web:isin.etzhayyim.com:entity:{lei}). */
  issuerDid?: string;
  assetClass?: AssetClass;
  /** ISO 10962 CFI code (6 chars). */
  cfi?: string;
  currency?: string;
  /** ISO 3166-1 alpha-3 country code. */
  country?: string;
  /** ISO 10383 MIC (Market Identifier Code). */
  exchangeMic?: string;
  registeredAt: string;
  createdAt: string;
}

export interface SecurityView extends SecurityRecord {
  securityUri: string;
}

export interface RegisterSecurityInput {
  isin: string;
  name: string;
  issuerLei?: string;
  issuerDid?: string;
  assetClass?: AssetClass;
  cfi?: string;
  currency?: string;
  country?: string;
  exchangeMic?: string;
}

export interface RegisterSecurityOutput {
  status:
    | "registered"
    | "alreadyExists"
    | "rejected"
    | "invalidIsin";
  securityUri?: string;
  did?: string;
  isin?: string;
  error?: string;
}

export interface GetSecurityInput {
  isin?: string;
  did?: string;
}

export interface GetSecurityOutput {
  security?: SecurityView;
  error?: string;
}

export interface SearchSecuritiesInput {
  query: string;
  country?: string;
  assetClass?: AssetClass;
  limit?: number;
  cursor?: string;
}

export type SearchSecuritiesOutput = ListSecuritiesOutput;

export interface ListSecuritiesInput {
  country?: string;
  assetClass?: AssetClass;
  exchangeMic?: string;
  limit?: number;
  cursor?: string;
}

export interface ListSecuritiesOutput {
  items: SecurityView[];
  cursor?: string;
  total: number;
}

export interface ListByCountryInput {
  countryAlpha2: string;
  assetClass?: AssetClass;
  limit?: number;
  cursor?: string;
}

export type ListByCountryOutput = ListSecuritiesOutput;

// ─── Entity (issuer / LEI) tier ─────────────────────────────────────

export interface EntityRecord {
  did: string;
  /** ISO 17442 Legal Entity Identifier (20 chars). */
  lei: string;
  name: string;
  /** ISO 3166-1 alpha-3 country code. */
  country?: string;
  /** Investor relations URL. */
  irUrl?: string;
  registeredAddress?: string;
  registeredAt: string;
  createdAt: string;
}

export interface EntityView extends EntityRecord {
  entityUri: string;
}

export interface RegisterEntityInput {
  lei: string;
  name: string;
  country?: string;
  irUrl?: string;
  registeredAddress?: string;
}

export interface RegisterEntityOutput {
  status: "registered" | "alreadyExists" | "rejected" | "invalidLei";
  entityUri?: string;
  did?: string;
  lei?: string;
  error?: string;
}

// ─── Validation tier ────────────────────────────────────────────────

export interface ValidateIsinInput {
  isin: string;
}

export interface ValidateIsinOutput {
  valid: boolean;
  isin?: string;
  countryAlpha2?: string;
  nsin?: string;
  checkDigit?: number;
  error?: string;
}

// ─── Coverage / dashboard tier ──────────────────────────────────────

export interface GetDashboardInput {
  maxScan?: number;
}

export interface GetDashboardOutput {
  totalSecurities?: number;
  totalEntities?: number;
  byCountry?: Record<string, number>;
  byAssetClass?: Record<string, number>;
  truncated?: boolean;
  error?: string;
}

// ─── Helpers + validation ───────────────────────────────────────────

export function normalizeIsin(isin: string): string {
  return (isin ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}

/** ISIN check digit per ISO 6166 (modulo 10 with Luhn algorithm). */
export function isinCheckDigit(isin11: string): number | undefined {
  if (!/^[A-Z0-9]{11}$/.test(isin11)) return undefined;
  // Convert each char to digits: A=10, B=11, ... Z=35.
  let digits = "";
  for (const c of isin11) {
    if (/[0-9]/.test(c)) digits += c;
    else digits += String(c.charCodeAt(0) - 55);
  }
  // Luhn: from right to left, double even-positioned digits (0-indexed from right).
  let sum = 0;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    const posFromRight = digits.length - 1 - i;
    if (posFromRight % 2 === 0) {
      d *= 2;
      if (d >= 10) d = Math.floor(d / 10) + (d % 10);
    }
    sum += d;
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidIsin(isin: string): boolean {
  if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) return false;
  const head = isin.slice(0, 11);
  const check = Number(isin[11]);
  return isinCheckDigit(head) === check;
}

/** ISO 17442 LEI: 20 char alphanumeric + ISO/IEC 7064 MOD 97-10 check. */
export function isValidLei(lei: string): boolean {
  if (!/^[A-Z0-9]{20}$/.test(lei)) return false;
  // Convert to numeric form, then MOD 97 === 1.
  let numeric = "";
  for (const c of lei) {
    if (/[0-9]/.test(c)) numeric += c;
    else numeric += String(c.charCodeAt(0) - 55);
  }
  // Compute numeric mod 97 by chunked reduction (BigInt-free).
  let rem = 0;
  for (let i = 0; i < numeric.length; i++) {
    rem = (rem * 10 + Number(numeric[i])) % 97;
  }
  return rem === 1;
}

export function securityDid(isin: string): string {
  return `${ISIN_DID_PREFIX}security:${isin}`;
}

export function securityRkey(isin: string): string {
  return `security-${isin}`;
}

export function entityDid(lei: string): string {
  return `${ISIN_DID_PREFIX}entity:${lei}`;
}

export function entityRkey(lei: string): string {
  return `entity-${lei}`;
}

// ─── Collect tier (slice 2) ─────────────────────────────────────────

export interface CollectRunRecord {
  did: string;
  runId: string;
  kind: "securities" | "entities" | "enrich";
  jurisdiction?: string;
  itemsCount: number;
  status: "completed" | "partial" | "failed";
  completedAt: string;
  createdAt: string;
}

export interface CollectSecuritiesInput {
  runId: string;
  securities: RegisterSecurityInput[];
  jurisdiction?: string;
}

export interface CollectSecuritiesOutput {
  runId?: string;
  runUri?: string;
  inserted?: { isin: string; securityUri: string; did: string }[];
  skipped?: { isin: string; reason: string }[];
  alreadyExists?: boolean;
  error?: string;
}

export interface CollectEntityIRInput {
  runId: string;
  entities: RegisterEntityInput[];
  jurisdiction?: string;
}

export interface CollectEntityIROutput {
  runId?: string;
  runUri?: string;
  inserted?: { lei: string; entityUri: string; did: string }[];
  skipped?: { lei: string; reason: string }[];
  alreadyExists?: boolean;
  error?: string;
}

export interface EnrichIsinInput {
  isin: string;
  name?: string;
  issuerLei?: string;
  assetClass?: AssetClass;
  cfi?: string;
  currency?: string;
  country?: string;
  exchangeMic?: string;
}

export interface EnrichIsinOutput {
  isin?: string;
  status?: "registered" | "alreadyExists" | "rejected" | "invalidIsin";
  securityUri?: string;
  did?: string;
  error?: string;
}
