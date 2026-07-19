/**
 * isin kotoba — barrel.
 *
 * Per ADR-2605203000 Option B Phase E reference impl. ISO 6166 ISIN-based
 * security registry — 1 Worker + N path-based DID per country prefix.
 *
 * Slice 1: 8 commands ported (covering 10/11 canonical lexicons).
 *   registerSecurity + getSecurity + searchSecurities + listSecurities +
 *   listByCountry + registerEntity + validateIsin + getDashboard
 *
 * Slice 2 (follow-up): collectSecurities / collectJPSecurities /
 * collectEntityIR / collectJPEntityIR / enrichISIN / registerJPProfiles /
 * registerSecurityProfiles (orchestration wrappers).
 *
 * Helpers exported for testing + caller diagnostics:
 *   normalizeIsin / isValidIsin / isinCheckDigit / isValidLei
 */

export * from "./types.js";
export {
  registerSecurity,
  getSecurity,
  searchSecurities,
  listSecurities,
  listByCountry,
  registerEntity,
  validateIsin,
  getDashboard,
} from "./registry.js";
export {
  collectSecurities,
  collectEntityIR,
  enrichISIN,
} from "./collect.js";
