/**
 * isin kotoba — security + entity registry (slice 1, 10/11 canonical).
 *
 *   registerSecurity            — Security write (rkey=security-{isin})
 *   getSecurity                 — by ISIN or DID
 *   searchSecurities            — Phase 2 client-side text match
 *   listSecurities              — cursor + country/assetClass/exchangeMic filter
 *   listByCountry               — country-alpha2 paginator
 *   registerEntity              — Issuer (LEI-keyed) write (rkey=entity-{lei})
 *   validateIsin                — pure helper (no PDS write)
 *   getDashboard                — coverage report (countries × asset classes)
 *
 * collect* + registerJPProfiles + registerSecurityProfiles + enrichISIN
 * are orchestration wrappers that ship in follow-up slice 2 (they wrap
 * registerSecurity/registerEntity with provenance via CollectRunRecord).
 */

import type { Etzhayyim } from "@etzhayyim/sdk";
import {
  entityDid,
  entityRkey,
  isValidIsin,
  isValidLei,
  isinCheckDigit,
  normalizeIsin,
  securityDid,
  securityRkey,
  type AssetClass,
  type EntityRecord,
  type EntityView,
  type GetDashboardInput,
  type GetDashboardOutput,
  type GetSecurityInput,
  type GetSecurityOutput,
  type ListByCountryInput,
  type ListByCountryOutput,
  type ListSecuritiesInput,
  type ListSecuritiesOutput,
  type RegisterEntityInput,
  type RegisterEntityOutput,
  type RegisterSecurityInput,
  type RegisterSecurityOutput,
  type SearchSecuritiesInput,
  type SearchSecuritiesOutput,
  type SecurityRecord,
  type SecurityView,
  type ValidateIsinInput,
  type ValidateIsinOutput,
} from "./types.js";

const SECURITY_COLLECTION = "com.etzhayyim.isin.security";
const ENTITY_COLLECTION = "com.etzhayyim.isin.entity";
const PAGE_LIMIT = 100;
const DEFAULT_MAX_SCAN = 10_000;

export async function registerSecurity(
  e: Etzhayyim,
  input: RegisterSecurityInput
): Promise<RegisterSecurityOutput> {
  const isin = normalizeIsin(input.isin ?? "");
  if (!isin || !input.name) {
    return { status: "rejected", error: "missingRequiredFields" };
  }
  if (!isValidIsin(isin)) {
    return { status: "invalidIsin", error: "checksumOrFormat" };
  }
  const rkey = securityRkey(isin);
  const existing = await e
    .read<SecurityRecord>({ collection: SECURITY_COLLECTION, rkey })
    .catch(() => ({ records: [] }));
  if (existing.records[0]?.value) {
    return {
      status: "alreadyExists",
      securityUri: existing.records[0].uri,
      did: existing.records[0].value.did,
      isin,
    };
  }
  if (input.issuerLei && !isValidLei(input.issuerLei)) {
    return { status: "rejected", error: "invalidLei" };
  }
  const did = securityDid(isin);
  const now = new Date().toISOString();
  const record: SecurityRecord = {
    did,
    isin,
    name: input.name,
    issuerLei: input.issuerLei,
    issuerDid:
      input.issuerDid ??
      (input.issuerLei ? entityDid(input.issuerLei) : undefined),
    assetClass: input.assetClass,
    cfi: input.cfi,
    currency: input.currency?.toUpperCase(),
    country: input.country?.toLowerCase(),
    exchangeMic: input.exchangeMic?.toUpperCase(),
    registeredAt: now,
    createdAt: now,
  };
  const receipt = await e.write({
    collection: SECURITY_COLLECTION,
    record: record as unknown as Record<string, unknown>,
    rkey,
  });
  return {
    status: "registered",
    securityUri: receipt.uri,
    did,
    isin,
  };
}

export async function getSecurity(
  e: Etzhayyim,
  input: GetSecurityInput
): Promise<GetSecurityOutput> {
  let isin = input.isin ? normalizeIsin(input.isin) : undefined;
  if (!isin && input.did) {
    // Extract from DID's last segment.
    const seg = input.did.split(":").pop();
    if (seg) isin = seg.toUpperCase();
  }
  if (!isin) return { error: "missingIsinOrDid" };
  if (!isValidIsin(isin)) return { error: "invalidIsin" };
  const resp = await e
    .read<SecurityRecord>({
      collection: SECURITY_COLLECTION,
      rkey: securityRkey(isin),
    })
    .catch(() => ({ records: [] }));
  const r = resp.records[0];
  if (!r) return { error: "notFound" };
  const view: SecurityView = { ...r.value, securityUri: r.uri };
  return { security: view };
}

export async function searchSecurities(
  e: Etzhayyim,
  input: SearchSecuritiesInput
): Promise<SearchSecuritiesOutput> {
  if (!input.query) return { items: [], total: 0 };
  const limit = Math.min(input.limit ?? 20, 50);
  const resp = await e.read<SecurityRecord>({
    collection: SECURITY_COLLECTION,
    cursor: input.cursor,
    limit,
  });
  const q = input.query.toLowerCase();
  const items: SecurityView[] = resp.records
    .filter((r) => {
      const v = r.value;
      if (input.country && v.country !== input.country.toLowerCase()) {
        return false;
      }
      if (input.assetClass && v.assetClass !== input.assetClass) return false;
      const hay = [v.name, v.isin, v.issuerLei, v.cfi]
        .filter((s): s is string => !!s)
        .map((s) => s.toLowerCase());
      return hay.some((h) => h.includes(q));
    })
    .map((r) => ({ ...r.value, securityUri: r.uri }));
  return { items, cursor: resp.cursor, total: items.length };
}

export async function listSecurities(
  e: Etzhayyim,
  input: ListSecuritiesInput = {}
): Promise<ListSecuritiesOutput> {
  const limit = Math.min(input.limit ?? 50, 200);
  const resp = await e.read<SecurityRecord>({
    collection: SECURITY_COLLECTION,
    cursor: input.cursor,
    limit,
  });
  const items: SecurityView[] = resp.records
    .filter((r) => {
      const v = r.value;
      if (input.country && v.country !== input.country.toLowerCase()) {
        return false;
      }
      if (input.assetClass && v.assetClass !== input.assetClass) return false;
      if (
        input.exchangeMic &&
        v.exchangeMic !== input.exchangeMic.toUpperCase()
      ) {
        return false;
      }
      return true;
    })
    .map((r) => ({ ...r.value, securityUri: r.uri }));
  return { items, cursor: resp.cursor, total: items.length };
}

export async function listByCountry(
  e: Etzhayyim,
  input: ListByCountryInput
): Promise<ListByCountryOutput> {
  if (!input.countryAlpha2 || input.countryAlpha2.length !== 2) {
    return { items: [], total: 0 };
  }
  // Filter by ISIN prefix (first 2 chars = ISO alpha-2).
  const limit = Math.min(input.limit ?? 50, 200);
  const cc2 = input.countryAlpha2.toUpperCase();
  const resp = await e.read<SecurityRecord>({
    collection: SECURITY_COLLECTION,
    cursor: input.cursor,
    limit,
  });
  const items: SecurityView[] = resp.records
    .filter((r) => {
      if (!r.value.isin.startsWith(cc2)) return false;
      if (input.assetClass && r.value.assetClass !== input.assetClass) {
        return false;
      }
      return true;
    })
    .map((r) => ({ ...r.value, securityUri: r.uri }));
  return { items, cursor: resp.cursor, total: items.length };
}

export async function registerEntity(
  e: Etzhayyim,
  input: RegisterEntityInput
): Promise<RegisterEntityOutput> {
  if (!input.lei || !input.name) {
    return { status: "rejected", error: "missingRequiredFields" };
  }
  const lei = input.lei.toUpperCase();
  if (!isValidLei(lei)) {
    return { status: "invalidLei", error: "checksumOrFormat" };
  }
  const rkey = entityRkey(lei);
  const existing = await e
    .read<EntityRecord>({ collection: ENTITY_COLLECTION, rkey })
    .catch(() => ({ records: [] }));
  if (existing.records[0]?.value) {
    return {
      status: "alreadyExists",
      entityUri: existing.records[0].uri,
      did: existing.records[0].value.did,
      lei,
    };
  }
  const did = entityDid(lei);
  const now = new Date().toISOString();
  const record: EntityRecord = {
    did,
    lei,
    name: input.name,
    country: input.country?.toLowerCase(),
    irUrl: input.irUrl,
    registeredAddress: input.registeredAddress,
    registeredAt: now,
    createdAt: now,
  };
  const receipt = await e.write({
    collection: ENTITY_COLLECTION,
    record: record as unknown as Record<string, unknown>,
    rkey,
  });
  return {
    status: "registered",
    entityUri: receipt.uri,
    did,
    lei,
  };
}

export async function validateIsin(
  _e: Etzhayyim,
  input: ValidateIsinInput
): Promise<ValidateIsinOutput> {
  if (!input.isin) return { valid: false, error: "missingIsin" };
  const isin = normalizeIsin(input.isin);
  if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) {
    return { valid: false, isin, error: "invalidFormat" };
  }
  const head = isin.slice(0, 11);
  const expected = isinCheckDigit(head);
  if (expected === undefined) {
    return { valid: false, isin, error: "checksumComputationFailed" };
  }
  const actual = Number(isin[11]);
  const valid = expected === actual;
  return {
    valid,
    isin,
    countryAlpha2: isin.slice(0, 2),
    nsin: isin.slice(2, 11),
    checkDigit: expected,
    error: valid ? undefined : "invalidCheckDigit",
  };
}

export async function getDashboard(
  e: Etzhayyim,
  input: GetDashboardInput = {}
): Promise<GetDashboardOutput> {
  const maxScan = Math.min(input.maxScan ?? DEFAULT_MAX_SCAN, DEFAULT_MAX_SCAN);

  const [securityTotals, entityTotals] = await Promise.all([
    scanCollection<SecurityRecord>(e, SECURITY_COLLECTION, maxScan),
    scanCollection<EntityRecord>(e, ENTITY_COLLECTION, maxScan),
  ]);

  const byCountry: Record<string, number> = {};
  const byAssetClass: Record<string, number> = {};
  for (const s of securityTotals.records) {
    if (s.value.country) {
      byCountry[s.value.country] = (byCountry[s.value.country] ?? 0) + 1;
    }
    if (s.value.assetClass) {
      byAssetClass[s.value.assetClass as AssetClass] =
        (byAssetClass[s.value.assetClass as AssetClass] ?? 0) + 1;
    }
  }
  return {
    totalSecurities: securityTotals.records.length,
    totalEntities: entityTotals.records.length,
    byCountry,
    byAssetClass,
    truncated: securityTotals.truncated || entityTotals.truncated,
  };
}

async function scanCollection<T>(
  e: Etzhayyim,
  collection: string,
  maxScan: number
): Promise<{ records: { value: T }[]; truncated: boolean }> {
  const out: { value: T }[] = [];
  let cursor: string | undefined;
  let scanned = 0;
  while (scanned < maxScan) {
    const page = await e.read<T>({ collection, cursor, limit: PAGE_LIMIT });
    for (const r of page.records) out.push({ value: r.value });
    scanned += page.records.length;
    if (!page.cursor || page.records.length < PAGE_LIMIT) break;
    cursor = page.cursor;
  }
  return { records: out, truncated: scanned >= maxScan };
}
