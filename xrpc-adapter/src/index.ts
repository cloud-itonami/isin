/**
 * isin XRPC adapter — CF Worker.
 *
 * Wires the kotoba reference impl (11 pure TS functions) into a deployable
 * CF Worker that exposes each function as an XRPC endpoint at
 * https://isin.etzhayyim.com/xrpc/com.etzhayyim.isin.<cmd>
 *
 * Per ADR-2605210000 first execution-layer demonstration. Instantiates the
 * Etzhayyim SDK from env bindings (PDS_URL + session), calls the kotoba
 * function with parsed input, returns the result as JSON, and maps status
 * codes to HTTP responses.
 *
 * Single-file principle: all routing and handler logic here.
 */

import {
  createAuthedEtzhayyim,
  extractBearerToken,
  type Etzhayyim,
} from "@etzhayyim/sdk-auth";
import * as isinRwFree from "@etzhayyim/isin-kotoba";
import type {
  RegisterSecurityInput,
  RegisterSecurityOutput,
  GetSecurityInput,
  GetSecurityOutput,
  SearchSecuritiesInput,
  SearchSecuritiesOutput,
  ListSecuritiesInput,
  ListSecuritiesOutput,
  ListByCountryInput,
  ListByCountryOutput,
  RegisterEntityInput,
  RegisterEntityOutput,
  ValidateIsinInput,
  ValidateIsinOutput,
  GetDashboardInput,
  GetDashboardOutput,
  CollectSecuritiesInput,
  CollectSecuritiesOutput,
  CollectEntityIRInput,
  CollectEntityIROutput,
  EnrichISINInput,
  EnrichISINOutput,
} from "@etzhayyim/isin-kotoba";

interface Env {
  ACTOR_DID: string;
  PDS_URL: string;
  L2_RPC_URL: string;
  PDS_ACCESS_JWT?: string;
  PDS_REFRESH_JWT?: string;
}

type Handler = (e: Etzhayyim, input: unknown) => Promise<unknown>;

const NSID_BASE = "com.etzhayyim.isin";

interface RouteConfig {
  method: "POST" | "GET";
  handler: Handler;
}

const routes: Record<string, RouteConfig> = {
  [`${NSID_BASE}.registerSecurity`]: {
    method: "POST",
    handler: (e, input) => isinRwFree.registerSecurity(e, input as RegisterSecurityInput),
  },
  [`${NSID_BASE}.getSecurity`]: {
    method: "GET",
    handler: (e, input) => isinRwFree.getSecurity(e, input as GetSecurityInput),
  },
  [`${NSID_BASE}.searchSecurities`]: {
    method: "GET",
    handler: (e, input) => isinRwFree.searchSecurities(e, input as SearchSecuritiesInput),
  },
  [`${NSID_BASE}.listSecurities`]: {
    method: "GET",
    handler: (e, input) => isinRwFree.listSecurities(e, input as ListSecuritiesInput),
  },
  [`${NSID_BASE}.listByCountry`]: {
    method: "GET",
    handler: (e, input) => isinRwFree.listByCountry(e, input as ListByCountryInput),
  },
  [`${NSID_BASE}.registerEntity`]: {
    method: "POST",
    handler: (e, input) => isinRwFree.registerEntity(e, input as RegisterEntityInput),
  },
  [`${NSID_BASE}.validateIsin`]: {
    method: "GET",
    handler: (e, input) => isinRwFree.validateIsin(e, input as ValidateIsinInput),
  },
  [`${NSID_BASE}.getDashboard`]: {
    method: "GET",
    handler: (e, input) => isinRwFree.getDashboard(e, input as GetDashboardInput),
  },
  [`${NSID_BASE}.collectSecurities`]: {
    method: "POST",
    handler: (e, input) => isinRwFree.collectSecurities(e, input as CollectSecuritiesInput),
  },
  [`${NSID_BASE}.collectEntityIR`]: {
    method: "POST",
    handler: (e, input) => isinRwFree.collectEntityIR(e, input as CollectEntityIRInput),
  },
  [`${NSID_BASE}.enrichISIN`]: {
    method: "POST",
    handler: (e, input) => isinRwFree.enrichISIN(e, input as EnrichISINInput),
  },
};

/**
 * Maps result.status to HTTP status code.
 *   - rejected / validationFailed → 400
 *   - notFound → 404
 *   - alreadyExists / alreadyProcessed → 200 (idempotent)
 *   - other / default → 200
 *   - exception → 500
 */
function mapStatus(status?: string): number {
  if (status === "rejected" || status === "validationFailed") return 400;
  if (status === "notFound") return 404;
  if (status === "alreadyExists" || status === "alreadyProcessed") return 200;
  return 200;
}

function jsonResponse(
  body: unknown,
  status: number = 200,
  init?: ResponseInit
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
    ...init,
  });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    // Only handle /xrpc/* paths
    if (!url.pathname.startsWith("/xrpc/")) {
      return jsonResponse({ error: "NotFound" }, 404);
    }

    const nsid = url.pathname.slice("/xrpc/".length);
    const route = routes[nsid];

    if (!route) {
      return jsonResponse({ error: "MethodNotFound", nsid }, 404);
    }

    if (req.method !== route.method) {
      return jsonResponse({ error: "MethodNotAllowed" }, 405);
    }

    // Instantiate Etzhayyim SDK with PDS session attached
    const bearerToken = extractBearerToken(req);
    const e = createAuthedEtzhayyim({
      env: {
        ACTOR_DID: env.ACTOR_DID,
        PDS_URL: env.PDS_URL,
        L2_RPC_URL: env.L2_RPC_URL,
        PDS_ACCESS_JWT: env.PDS_ACCESS_JWT,
        PDS_REFRESH_JWT: env.PDS_REFRESH_JWT,
      },
      bearerToken,
    });

    // Parse input based on method
    let input: unknown;
    try {
      if (route.method === "POST") {
        input = await req.json().catch(() => ({}));
      } else {
        // GET: parse query params
        input = Object.fromEntries(url.searchParams.entries());
        // Coerce common numeric/boolean fields
        const typed = input as Record<string, unknown>;
        if (typed.publicDomainOnly) {
          typed.publicDomainOnly = typed.publicDomainOnly === "true";
        }
        if (typed.limit) {
          typed.limit = Number(typed.limit);
        }
        if (typed.offset) {
          typed.offset = Number(typed.offset);
        }
        if (typed.maxScan) {
          typed.maxScan = Number(typed.maxScan);
        }
      }
    } catch (err) {
      return jsonResponse(
        {
          error: "InvalidInput",
          message: `Failed to parse ${route.method === "POST" ? "JSON" : "query params"}`,
        },
        400
      );
    }

    // Call handler
    try {
      const result = await route.handler(e, input);
      const status = mapStatus((result as Record<string, unknown>)?.status as string | undefined);
      return jsonResponse(result, status);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return jsonResponse(
        {
          error: "InternalError",
          message,
          nsid,
        },
        500
      );
    }
  },
} satisfies ExportedHandler<Env>;
