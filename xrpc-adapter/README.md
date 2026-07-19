# isin XRPC Adapter

CF Worker that exposes the 11 kotoba commands as XRPC endpoints.

## Endpoints

### Security Registry
- `POST /xrpc/com.etzhayyim.isin.registerSecurity` — register ISIN security
- `GET /xrpc/com.etzhayyim.isin.getSecurity?isin=...` — security by ISIN
- `GET /xrpc/com.etzhayyim.isin.searchSecurities?query=...` — search securities
- `GET /xrpc/com.etzhayyim.isin.listSecurities?limit=...&offset=...` — paginated list

### Country & Entity
- `GET /xrpc/com.etzhayyim.isin.listByCountry?countryCode=...` — securities by country
- `POST /xrpc/com.etzhayyim.isin.registerEntity` — register entity (LEI)
- `GET /xrpc/com.etzhayyim.isin.validateIsin?isin=...` — validate ISIN

### Dashboard & Collection
- `GET /xrpc/com.etzhayyim.isin.getDashboard` — registry statistics
- `POST /xrpc/com.etzhayyim.isin.collectSecurities` — collect ISIN batch
- `POST /xrpc/com.etzhayyim.isin.collectEntityIR` — collect entity IR data
- `POST /xrpc/com.etzhayyim.isin.enrichISIN` — enrich ISIN metadata

## Setup

```bash
cd 60-apps/etzhayyim-project-isin/xrpc-adapter
npm install
```

## Deploy

```bash
wrangler deploy
# Deploys to isin.etzhayyim.com/xrpc/*
```

See ADR-2605210000 for design context.
