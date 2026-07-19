/**
 * isin kotoba — collect + enrich tier (slice 2, +3 → 11/11 canonical).
 *
 *   collectSecurities — bulk ingest of N Security records + N Entity records
 *                       Generic for any country (ISIN prefix carries the cc2).
 *                       Aliases: collectJPSecurities (jp-only), enrichISIN
 *                       (single-isin lookup + register).
 *   collectEntityIR   — bulk ingest of N Entity records with IR URLs
 *                       Alias: collectJPEntityIR (jp-only filter).
 *   enrichISIN        — pull external metadata for one ISIN and re-emit
 *                       Security record with enriched fields.
 *
 * Each collect emits a CollectRunRecord per call for provenance.
 */

import type { Etzhayyim } from "@etzhayyim/sdk";
import {
  registerEntity,
  registerSecurity,
} from "./registry.js";
import {
  idSlug,
  ISIN_DID_PREFIX,
  normalizeIsin,
  type CollectEntityIRInput,
  type CollectEntityIROutput,
  type CollectRunRecord,
  type CollectSecuritiesInput,
  type CollectSecuritiesOutput,
  type EnrichIsinInput,
  type EnrichIsinOutput,
} from "./types.js";

const COLLECT_RUN_COLLECTION = "com.etzhayyim.isin.collectRun";

function collectRunRkey(runId: string): string {
  return `collectrun-${idSlug(runId)}`;
}

function collectRunDid(runId: string): string {
  return `${ISIN_DID_PREFIX}collectrun:${idSlug(runId)}`;
}

async function writeCollectRun(
  e: Etzhayyim,
  runId: string,
  kind: CollectRunRecord["kind"],
  jurisdiction: string | undefined,
  itemsCount: number,
  status: CollectRunRecord["status"]
) {
  const rkey = collectRunRkey(runId);
  const existing = await e
    .read<CollectRunRecord>({ collection: COLLECT_RUN_COLLECTION, rkey })
    .catch(() => ({ records: [] }));
  if (existing.records[0]?.value) {
    return { runUri: existing.records[0].uri, alreadyExists: true };
  }
  const record: CollectRunRecord = {
    did: collectRunDid(runId),
    runId,
    kind,
    jurisdiction: jurisdiction?.toLowerCase(),
    itemsCount,
    status,
    completedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
  const receipt = await e.write({
    collection: COLLECT_RUN_COLLECTION,
    record: record as unknown as Record<string, unknown>,
    rkey,
  });
  return { runUri: receipt.uri, alreadyExists: false };
}

export async function collectSecurities(
  e: Etzhayyim,
  input: CollectSecuritiesInput
): Promise<CollectSecuritiesOutput> {
  if (!input.runId || !input.securities || input.securities.length === 0) {
    return { error: "missingRequiredFields" };
  }
  const inserted: { isin: string; securityUri: string; did: string }[] = [];
  const skipped: { isin: string; reason: string }[] = [];
  for (const s of input.securities) {
    const r = await registerSecurity(e, s);
    if (r.status === "registered" && r.securityUri && r.did) {
      inserted.push({ isin: r.isin!, securityUri: r.securityUri, did: r.did });
    } else if (r.status === "alreadyExists") {
      skipped.push({ isin: s.isin, reason: "alreadyExists" });
    } else {
      skipped.push({ isin: s.isin, reason: r.error ?? r.status });
    }
  }
  const run = await writeCollectRun(
    e,
    input.runId,
    "securities",
    input.jurisdiction,
    inserted.length,
    "completed"
  );
  return {
    runId: input.runId,
    runUri: run.runUri,
    inserted,
    skipped,
    alreadyExists: run.alreadyExists,
  };
}

export async function collectEntityIR(
  e: Etzhayyim,
  input: CollectEntityIRInput
): Promise<CollectEntityIROutput> {
  if (!input.runId || !input.entities || input.entities.length === 0) {
    return { error: "missingRequiredFields" };
  }
  const inserted: { lei: string; entityUri: string; did: string }[] = [];
  const skipped: { lei: string; reason: string }[] = [];
  for (const ent of input.entities) {
    const r = await registerEntity(e, ent);
    if (r.status === "registered" && r.entityUri && r.did) {
      inserted.push({ lei: r.lei!, entityUri: r.entityUri, did: r.did });
    } else if (r.status === "alreadyExists") {
      skipped.push({ lei: ent.lei, reason: "alreadyExists" });
    } else {
      skipped.push({ lei: ent.lei, reason: r.error ?? r.status });
    }
  }
  const run = await writeCollectRun(
    e,
    input.runId,
    "entities",
    input.jurisdiction,
    inserted.length,
    "completed"
  );
  return {
    runId: input.runId,
    runUri: run.runUri,
    inserted,
    skipped,
    alreadyExists: run.alreadyExists,
  };
}

export async function enrichISIN(
  e: Etzhayyim,
  input: EnrichIsinInput
): Promise<EnrichIsinOutput> {
  if (!input.isin) return { error: "missingIsin" };
  const isin = normalizeIsin(input.isin);
  // The actual external enrichment (fetch from OpenFIGI / GLEIF / etc.)
  // lives in the LangServer pod (per ADR-2605111200). This package just
  // persists the resulting record. Caller passes already-enriched fields.
  const r = await registerSecurity(e, {
    isin,
    name: input.name ?? `Security ${isin}`,
    issuerLei: input.issuerLei,
    assetClass: input.assetClass,
    cfi: input.cfi,
    currency: input.currency,
    country: input.country,
    exchangeMic: input.exchangeMic,
  });
  return {
    isin,
    status: r.status,
    securityUri: r.securityUri,
    did: r.did,
    error: r.error,
  };
}
