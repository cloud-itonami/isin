# isin

**`cloud-itonami/isin` は、ISIN（ISO 6166）を主キーとする証券登録簿を
etzhayyim substrate（AT Protocol PDS）へ**書き込む**経路である。** 11 個の XRPC
コマンドを純粋な TypeScript 関数として持つ `kotoba/` と、それを Cloudflare Worker
の XRPC エンドポイントとして露出する `xrpc-adapter/` の 2 パッケージからなる。

名前が機能を示さないので冒頭で名乗る（CLAUDE.md「名前が機能を示さない repo を
作ったら、README の冒頭で名乗る」）。`isin` という bare 名は識別子の規格名だけを
言っており、「何をする repo か」——**その識別子で索く登録簿への書き込み経路である**
こと——は名前から読めない。

**外部データを取りに行く repo ではない。** OpenFIGI / GLEIF / EDGAR からの取得は
別の実行系（LangServer pod、ADR-2605111200）に在り、ここは**呼び出し側が既に
enrich 済みのフィールドを渡してくる**前提で永続化だけを担う。`kotoba/src` に
`fetch(` は 1 箇所も無い（`enrichISIN` の実装コメントが自らそう書いている）。

## 最近接 repo との境界

| repo | 何を所有するか |
|---|---|
| **`cloud-itonami/isin`**（ここ） | **証券の識別と永続化**。ISIN / LEI の検査桁、`e.write()` / `e.read()` を呼ぶ 11 コマンド、その XRPC Worker adapter |
| `cloud-itonami/isic` | **産業分類**（UN ISIC Rev.4 の 4 階層）。CLAUDE.md が `:CLASSIFIED_AS` で結ぶと書いている相手 |
| `cloud-itonami/cloud-itonami-lei-*`（185 repo） | **個社の法人アーカイブ**。LEI 1 件 = 1 repo |
| `com-junkawasaki/org-gleif-projections` | **LEI の正本投影**（GLEIF Golden Copy） |

**LEI を検査する（`isValidLei`）ことと、LEI で索ける法人の実体を持つことは別。**
ここは前者だけを持つ。`did:web:isin.etzhayyim.com:entity:{lei}` という発行体 DID を
組み立てはするが、その法人が何者かを知っているのは `cloud-itonami-lei-*` 側であり、
両者は superproject の query 面で `:company/lei` を結合キーとして繋がる。

## 構成

```
kotoba/          11 コマンドの純粋関数（Worker ではない）。vitest で 27 test
  src/registry.ts  8 コマンド + ISIN/LEI 検査桁
  src/collect.ts   3 コマンド（collect / enrich）。永続化のみ、外部取得はしない
  src/types.ts     型 + normalizeIsin / isinCheckDigit / isValidIsin / isValidLei
  test/isin.test.ts
xrpc-adapter/    CF Worker。11 ルートを kotoba に委譲する単一ファイル
  wrangler.jsonc   route: isin.etzhayyim.com/xrpc/*
appview/         kotodama.jsonld + SvelteKit の骨組み
README.edn       機械可読の repo メタデータ（etzhayyim.repository/v1）
migration.edn    etzhayyim/root からの抽出元 revision / tree
```

`kotoba/` が採る **Option B**（vendor の `createKyselyDb` 直書き SQL ではなく、
PDS XRPC 経由で書く）の設計理由は `kotoba/README.md` にある。

## 検証済みの現在地（2026-08-14 実測）

**この節の各行は実際にコマンドを走らせて確かめたものだけを載せている。**
手順と実際の出力は [`docs/operator-quickstart.md`](docs/operator-quickstart.md)。

| 主張 | 実測 |
|---|---|
| kotoba のコマンド数 | **11**（export 19 − helper 8） |
| adapter のルート数 | **11**。コマンド名の集合は kotoba 側と**完全一致**（`diff` が空） |
| `kotoba/` のテスト | **走る。27 test すべて緑**（唯一、この repo で実行できる本物の検査） |
| そのテストの検出力 | **6 / 11 コマンドしか触っていない。** 残り 5 つは壊しても緑のまま（実演済み） |
| `kotoba/` の `npm install` | **通る。ただし素では通らない** — 利用者の `~/.npmrc` に `allow-scripts[]` があると npm ≥ 11.16 が git 依存の準備で `EALLOWSCRIPTS` を出す |
| `xrpc-adapter/` の `npm install` | **通らない**。`workspace:*` を解決する workspace root がこの repo に無い（`EUNSUPPORTEDPROTOCOL`）。root に npm workspaces を足しても直らない（`workspace:` は npm の語彙ではない） |
| `appview/` | **依存が repo 内に無い**（`@etzhayyim/kotodama-host-sdk` / `@etzhayyim/xrpc` を `workspace:*` で参照） |
| `isin.etzhayyim.com` | **NXDOMAIN**。zone `etzhayyim.com` は在るがこのサブドメインは無く、Worker route は未有効 = **未デプロイ** |
| 外部データ取得 | **実装されていない**（`kotoba/src` に `fetch(` 0 件）。設計どおりで欠陥ではないが、CLAUDE.md と `kotodama.jsonld` はこの repo が EDGAR / OpenFIGI を引くかのように書いている |
| git 依存 2 本の URL | `github.com/etzhayyim/com-etzhayyim-sdk{,-mock}` は**別 org へ移動済み**（実体は `kotoba-lang/sdk{,-mock}`）。GitHub のリダイレクト経由でのみ解決する |

**したがって、この repo で今日できるのは「テストを走らせること」だけである。**
adapter のビルドも Worker の deploy もできない。何が塞いでいるかは quickstart の
「詰まっている 3 点」に、それをどう扱うかは
[`docs/adr/0001-verified-state-and-blockers.md`](docs/adr/0001-verified-state-and-blockers.md) にある。

> ⚠ **`CLAUDE.md` は、この repo に無い実装を記述している。** 60 か国の country DID、
> heartbeat による social evolution、`kotodama.ATPost` / `G("Security").Match(...)` と
> いった Go の W Protocol API、18 Minerva competencies —— **どれも `kotoba/` にも
> `xrpc-adapter/` にも対応物が無い**（`kotoba/src` に country registry は無く、
> 言語も TypeScript である）。抽出元の別実装の設計文書がそのまま付いてきたもので、
> ここの実装の説明として読むと必ず誤る。

> ⚠ `xrpc-adapter/README.md` の Setup にある `cd 60-apps/etzhayyim-project-isin/xrpc-adapter`
> は**抽出前のモノレポのパス**で、この repo に `60-apps/` は無い。
> `kotoba/README.md` も冒頭で「11 of 11 (100%)」、末尾の表で「8 of 11」と
> **自分と矛盾している**（実測は 11）。サブパッケージの README を入口にしないこと。

## 出自

`etzhayyim/root` の `60-apps/etzhayyim-project-isin` から抽出された
（`migration.edn`: revision `e5654f08`、tree `46ea1dd7`、26 file / 71,590 bytes）。
設計の正本 ADR-2605203000（write-target options）/ ADR-2605210000（XRPC adapter）/
ADR-2605111200（LangServer 側の enrichment）は **どれもこの repo には入っていない**。

## 決定の記録

- [`docs/adr/0001-verified-state-and-blockers.md`](docs/adr/0001-verified-state-and-blockers.md)
  — 上表のブロッカーと、継承した文書の矛盾をどう扱うか
