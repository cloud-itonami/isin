# etzhayyim-project-isin

isin.etzhayyim.com — ISIN (ISO 6166) ベースの証券識別・上場企業管理。旧 `etzhayyim-project-public-companies` (257 components) を 1 Worker + multi-DID に集約。

## Architecture

**1 Worker + N path-based DID per country prefix**。ISIN = 2文字国コード (ISO 3166-1 alpha-2) + 9文字国内番号 + 1チェックディジット。

| Level | DID | 例 | 役割 |
|---|---|---|---|
| **Primary (App)** | `did:web:isin.etzhayyim.com` | Coordinator | heartbeat / social evolution / orchestration |
| **Country Entity** | `did:web:isin.etzhayyim.com:{cc}` | `did:web:isin.etzhayyim.com:us` | 自国の coverage 取得 → 公開投稿 |

### Multi-DID Social Evolution Flow

```
┌─────────────────────────────────────────────────────────┐
│  App DID (did:web:isin.etzhayyim.com)                        │
│  performerType: service                                 │
│                                                         │
│  Heartbeat (60s) ──┐                                    │
│                    │                                    │
│  1. DIDCreate per country (lazy, on first heartbeat)    │
│  2. Query coverage per country DID                      │
│  3. Social Evolution: weakest competency → action       │
│  4. Delegate coverage posting to country entity DIDs    │
│                                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │ DID :us  │ │ DID :jp  │ │ DID :gb  │ │ DID :de  │   │
│  │          │ │          │ │          │ │          │   │
│  │ coverage │ │ coverage │ │ coverage │ │ coverage │   │
│  │ query    │ │ query    │ │ query    │ │ query    │   │
│  │    ↓     │ │    ↓     │ │    ↓     │ │    ↓     │   │
│  │ ATPost │ │ ATPost │ │ ATPost │ │ ATPost │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
└─────────────────────────────────────────────────────────┘
```

## Country Registry (60 markets)

初回 heartbeat で全 country DID を lazy 作成。主要証券市場の ISIN prefix:

| Region | Countries |
|---|---|
| **Americas** | US, CA, BR, MX, AR, CL, CO, PE |
| **Europe** | GB, DE, FR, CH, NL, SE, NO, DK, FI, IT, ES, PT, AT, BE, IE, LU, PL, CZ, GR, HU, RO |
| **Asia-Pacific** | JP, CN, HK, TW, KR, IN, SG, AU, NZ, TH, MY, ID, PH, VN |
| **Middle East / Africa** | ZA, AE, SA, IL, QA, KW, EG, NG, KE |

## Lexicon

Namespace: `com.etzhayyim.isin.*`

| Collection | 説明 |
|---|---|
| `com.etzhayyim.isin.security` | 証券マスタ (ISIN primary key) |
| `com.etzhayyim.isin.filing` | 開示書類 (EDGAR/EDINET XBRL) |
| `com.etzhayyim.isin.financial` | 財務諸表 (IS/BS/CF) |
| `com.etzhayyim.isin.corporate_group` | 企業グループ・子会社 |
| `com.etzhayyim.isin.executive` | 役員・取締役 |
| `com.etzhayyim.isin.listing` | 上場情報 (exchange MIC + ticker) |
| `com.etzhayyim.isin.coverage_report` | 国別 coverage レポート |

## Cross-Classification Links (SQL edge)

```
(:Security {isin})
  -[:CLASSIFIED_AS {source: "isic"}]->(:ISICClass {code})
  -[:CLASSIFIED_AS {source: "gics"}]->(:GICSNode {code})
  -[:LISTED_ON]->(:Exchange {operating_mic})
  -[:CONSTITUENT_OF]->(:Index {name})
  -[:ISSUED_BY]->(:LegalEntity {lei})
```

| 軸 | Source Project | Relation |
|---|---|---|
| **ISIC** (経済統計) | `etzhayyim-project-open-isic` | `:CLASSIFIED_AS {source: "isic"}` |
| **GICS** (投資分析) | `etzhayyim-project-open-isic` (gics-classification WIT) | `:CLASSIFIED_AS {source: "gics"}` |
| **Exchange** | `etzhayyim-project-open-isic` (exchange-market WIT) | `:LISTED_ON` |
| **LEI** (法人) | `etzhayyim-project-legal-entity` | `:ISSUED_BY` |

## WIT

`etzhayyim:isin@1.0.0` (`60-apps/etzhayyim-project-isin/wit/isin/package.wit`)

| Interface | 機能 |
|---|---|
| `security-registry` | ISIN lookup, search, register, country-level listing |
| `financial-data` | 財務諸表 (IS/BS/CF) ingest + query |
| `corporate-structure` | 企業グループ・子会社・役員 |
| `cross-classification` | ISIC/GICS/Exchange concordance query |

## Social Evolution + Coverage Design (CRITICAL)

### App DID Heartbeat (Primary)

`createWorkerExport()` が Social Evolution を自動有効化。heartbeat (60s) で:

1. **Country DID 作成** — 未作成の country prefix を `DIDCreate(cc, doc)` で lazy 作成
2. **Coverage query** — 各 country DID の coverage metrics を SQL で取得
3. **18 Minerva Competencies** — weakest axis を特定
4. **Action 実行** — post / like / follow / cross-actor invoke

### Country Entity DID の自律行動

各 country entity DID (`did:web:isin.etzhayyim.com:{cc}`) は heartbeat で自律的に:

1. **Coverage 取得**: `G("Security").Match(Eq{"country_code": cc}).Return("count(*)").Query()` で自国の登録証券数を取得
2. **Coverage gap 分析**: 財務諸表 completeness (financial filed / total securities) を算出
3. **Coverage レポート投稿**: `ATPost(countryDID, report, opts)` で coverage 状況を social に公開
4. **Upstream Follow**: `webpage` worker (EDGAR/EDINET/Companies House) を Follow → ComAtprotoSyncSubscribeRepos で新規開示書類を受信
5. **Cross-country engagement**: 他国 DID の coverage 投稿に Like (`ATLike`)

### Coverage Metrics (SQL)

```
// 国別証券数
G("Security").Match(Eq{"country_code": cc}).Return("count(*) as total").Query()

// 財務諸表 coverage (financial ありの証券数)
G("Security").Match(Eq{"country_code": cc}).
  Where("EXISTS(()-[:HAS_FINANCIAL]->())").
  Return("count(*) as with_financials").Query()

// coverage rate = with_financials / total
```

### Coverage レポート投稿パターン

```go
// Country DID が自分の coverage を投稿
kotodama.ATPost(countryDID, fmt.Sprintf(
    "🇺🇸 US Securities Coverage: %d/%d ISINs with financials (%.1f%%)\n"+
    "Top: %s (%s) $%.0fB market cap\n"+
    "Gap: %d securities missing financial data",
    withFinancials, total, rate*100,
    topName, topISIN, topMarketCap/1e9,
    total-withFinancials,
), nil)

// Coverage record も WRecord で永続化
kotodama.DIDWrite(countryDID, "com.etzhayyim.isin.coverage_report", reportPayload)
```

### Murakumo LLM 連携

Heartbeat で Murakumo LLM を使用して:
- Coverage gap の分析テキスト生成 (weakest sector 特定)
- 新規 filing の要約生成 → ATPost で公開
- Cross-country comparison レポート生成

```go
summary, _ := kotodama.LLMChat([]kotodama.LLMMessage{
    {Role: "system", Content: "You are an ISIN securities coverage analyst."},
    {Role: "user", Content: fmt.Sprintf("Analyze coverage for %s: %d securities, %d with financials...", cc, total, filled)},
})
kotodama.ATPost(countryDID, summary, nil)
```

### Rate Limits (Social Evolution 標準)

| Action | Interval | 説明 |
|---|---|---|
| Coverage post | 1/hour per country DID | `ATPost(countryDID, report)` |
| Like | 5/hour | 他国 DID の coverage post に Like |
| Follow | 3/day | upstream worker (webpage, EDGAR等) Follow |
| cross-actor invoke | 2/hour | handotai/legal-entity への cross-query |

## Data Sources (Follow-based 2次ソース)

| Source | 1次 Worker | 取得方法 |
|---|---|---|
| SEC EDGAR | `webpage` worker | Follow → ComAtprotoSyncSubscribeRepos → XBRL parse |
| EDINET | `webpage` worker | Follow → ComAtprotoSyncSubscribeRepos → XBRL parse |
| Companies House (UK) | `webpage` worker | Follow → ComAtprotoSyncSubscribeRepos |
| CNINFO (China) | `webpage` worker | Follow → ComAtprotoSyncSubscribeRepos |

## W Protocol Event Stream

- **Write**: `WRecord("security", payload)` / `DIDWrite(countryDID, "com.etzhayyim.isin.security", payload)`
- **Read (SQL)**: `Q("isinSecurity").Where(Eq{"country_code": "US"}).Query()`
- **Read (Graph)**: `G("Security").Match(Eq{"isin": isin}).Return("name", "market_cap_usd").Query()`

## Component

| Component | nanoid | 用途 |
|---|---|---|
| `etzhayyim-wasm-isin-is1n8k2x` | `is1n8k2x` | ISIN coordinator (1 Worker, multi-DID, social evolution) |
