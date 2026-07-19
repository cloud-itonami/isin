import { describe, it, expect, beforeEach } from "vitest";
import { MockEtzhayyim } from "@etzhayyim/sdk-mock";
import {
  registerSecurity,
  getSecurity,
  listSecurities,
  listByCountry,
  registerEntity,
  validateIsin,
  isValidIsin,
  normalizeIsin,
  isinCheckDigit,
} from "../src/index.js";

describe("isin kotoba", () => {
  let e: any;

  beforeEach(() => {
    e = new MockEtzhayyim({ did: "did:web:isin.etzhayyim.com" });
  });

  describe("registerSecurity", () => {
    it("registers a security with valid ISIN and name", async () => {
      const result = await registerSecurity(e, {
        isin: "US0378331005",
        name: "Apple Inc.",
        country: "us",
        assetClass: "equity",
      });

      expect(result.status).toBe("registered");
      expect(result.securityUri).toBeDefined();
      expect(result.did).toBeDefined();
      expect(result.isin).toBe("US0378331005");
    });

    it("rejects security with missing name", async () => {
      const result = await registerSecurity(e, {
        isin: "US0378331005",
        name: "",
      });

      expect(result.status).toBe("rejected");
      expect(result.error).toBe("missingRequiredFields");
    });

    it("rejects security with invalid ISIN checksum", async () => {
      const result = await registerSecurity(e, {
        isin: "US0378331006", // Wrong check digit
        name: "Invalid Apple",
      });

      expect(result.status).toBe("invalidIsin");
      expect(result.error).toBe("checksumOrFormat");
    });

    it("is idempotent on ISIN", async () => {
      const input = {
        isin: "US0378331005",
        name: "Apple Inc.",
      };

      const first = await registerSecurity(e, input);
      expect(first.status).toBe("registered");
      const firstDid = first.did;

      const second = await registerSecurity(e, input);
      expect(second.status).toBe("alreadyExists");
      expect(second.did).toBe(firstDid);
    });

    it("validates issuer LEI if provided", async () => {
      const result = await registerSecurity(e, {
        isin: "US0378331005",
        name: "Apple Inc.",
        issuerLei: "INVALID_LEI", // Too short or invalid format
      });

      expect(result.status).toBe("rejected");
      expect(result.error).toBe("invalidLei");
    });

    it("normalizes ISIN to uppercase", async () => {
      const result = await registerSecurity(e, {
        isin: "us0378331005",
        name: "Apple Inc.",
      });

      expect(result.status).toBe("registered");
      expect(result.isin).toBe("US0378331005");
    });

    it("supports optional asset class and currency", async () => {
      const result = await registerSecurity(e, {
        isin: "JP3735400008",
        name: "Toyota Motor Corp.",
        assetClass: "equity",
        currency: "jpy",
        country: "jp",
      });

      expect(result.status).toBe("registered");
      const sec = await getSecurity(e, { isin: "JP3735400008" });
      expect(sec.security?.assetClass).toBe("equity");
      expect(sec.security?.currency).toBe("JPY");
    });
  });

  describe("getSecurity", () => {
    beforeEach(async () => {
      await registerSecurity(e, {
        isin: "US0378331005",
        name: "Apple Inc.",
        country: "us",
      });
    });

    it("retrieves an existing security by ISIN", async () => {
      const result = await getSecurity(e, { isin: "US0378331005" });

      expect(result.error).toBeUndefined();
      expect(result.security).toBeDefined();
      expect(result.security?.isin).toBe("US0378331005");
    });

    it("retrieves security by DID", async () => {
      const sec = await getSecurity(e, { isin: "US0378331005" });
      const did = sec.security?.did;

      const result = await getSecurity(e, { did: did });
      expect(result.security?.isin).toBe("US0378331005");
    });

    it("returns error for non-existent ISIN", async () => {
      const result = await getSecurity(e, {
        isin: "US1111111118",
      });

      expect(result.error).toBe("notFound");
      expect(result.security).toBeUndefined();
    });

    it("normalizes ISIN input to uppercase", async () => {
      const result = await getSecurity(e, { isin: "us0378331005" });

      expect(result.security?.isin).toBe("US0378331005");
    });
  });

  describe("listSecurities", () => {
    beforeEach(async () => {
      await registerSecurity(e, {
        isin: "US0378331005",
        name: "Apple Inc.",
        country: "us",
        assetClass: "equity",
      });
      await registerSecurity(e, {
        isin: "JP3735400008",
        name: "Toyota Motor Corp.",
        country: "jp",
        assetClass: "equity",
      });
      await registerSecurity(e, {
        isin: "DE0005140008",
        name: "Deutsche Bank Bond",
        country: "de",
        assetClass: "debt",
      });
    });

    it("lists all securities", async () => {
      const result = await listSecurities(e, {});

      expect(result.items.length).toBe(3);
      expect(result.total).toBe(3);
    });

    it("filters by country", async () => {
      const result = await listSecurities(e, { country: "us" });

      expect(result.items.length).toBe(1);
      expect(result.items[0]?.country).toBe("us");
    });

    it("filters by asset class", async () => {
      const result = await listSecurities(e, { assetClass: "debt" });

      expect(result.items.length).toBe(1);
      expect(result.items[0]?.assetClass).toBe("debt");
    });

    it("respects limit parameter", async () => {
      const result = await listSecurities(e, { limit: 2 });

      expect(result.items.length).toBeLessThanOrEqual(2);
    });
  });

  describe("listByCountry", () => {
    beforeEach(async () => {
      await registerSecurity(e, {
        isin: "US0378331005",
        name: "Apple Inc.",
        country: "us",
        assetClass: "equity",
      });
      await registerSecurity(e, {
        isin: "US0100054305",
        name: "Federal Home Loan Bank Bond",
        country: "us",
        assetClass: "debt",
      });
    });

    it("lists securities by country alpha2 code", async () => {
      const result = await listByCountry(e, { countryAlpha2: "us" });

      expect(result.items.length).toBe(2);
      expect(result.items.every((s) => s.country === "us")).toBe(true);
    });

    it("filters by asset class within country", async () => {
      const result = await listByCountry(e, {
        countryAlpha2: "us",
        assetClass: "equity",
      });

      expect(result.items.length).toBe(1);
      expect(result.items[0]?.assetClass).toBe("equity");
    });
  });

  describe("registerEntity", () => {
    it("registers an entity with valid LEI", async () => {
      const result = await registerEntity(e, {
        lei: "5493001KJTIIGC8Y1R12", // Valid LEI format
        name: "Apple Inc.",
        country: "us",
      });

      expect(result.status).toBe("registered");
      expect(result.entityUri).toBeDefined();
      expect(result.lei).toBe("5493001KJTIIGC8Y1R12");
    });

    it("rejects entity with invalid LEI checksum", async () => {
      const result = await registerEntity(e, {
        lei: "5493001KJTIIGC8Y1R99", // Invalid checksum
        name: "Invalid Corp",
      });

      expect(result.status).toBe("invalidLei");
    });

    it("is idempotent on LEI", async () => {
      const input = {
        lei: "5493001KJTIIGC8Y1R12",
        name: "Apple Inc.",
      };

      const first = await registerEntity(e, input);
      expect(first.status).toBe("registered");

      const second = await registerEntity(e, input);
      expect(second.status).toBe("alreadyExists");
    });
  });

  describe("validateIsin", () => {
    it("validates a correct ISIN", async () => {
      const result = await validateIsin(e, { isin: "US0378331005" });

      expect(result.valid).toBe(true);
      expect(result.isin).toBe("US0378331005");
      expect(result.countryAlpha2).toBe("US");
    });

    it("rejects ISIN with incorrect check digit", async () => {
      const result = await validateIsin(e, { isin: "US0378331006" });

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("normalizes ISIN input", async () => {
      const result = await validateIsin(e, { isin: "us0378331005" });

      expect(result.valid).toBe(true);
      expect(result.isin).toBe("US0378331005");
    });
  });

  describe("ISIN validation helpers", () => {
    it("normalizes ISIN to uppercase", () => {
      expect(normalizeIsin("us0378331005")).toBe("US0378331005");
      expect(normalizeIsin("US-0378-331005")).toBe("US0378331005");
    });

    it("validates ISIN format and checksum", () => {
      expect(isValidIsin("US0378331005")).toBe(true);
      expect(isValidIsin("US0378331006")).toBe(false);
      expect(isValidIsin("invalid")).toBe(false);
      expect(isValidIsin("JP3735400008")).toBe(true);
    });

    it("computes correct ISIN check digit", () => {
      const checkDigit = isinCheckDigit("US037833100");
      expect(checkDigit).toBe(5);
    });

    it("validates well-known ISINs", () => {
      // Test various real ISINs
      expect(isValidIsin("US0378331005")).toBe(true);
      expect(isValidIsin("JP3735400008")).toBe(true);
      expect(isValidIsin("DE0005140008")).toBe(true);
    });
  });
});
