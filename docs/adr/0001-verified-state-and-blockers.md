# ADR-0001 — 検証済みの現在地と、3 つのブロッカーの扱い

- status: accepted
- date: 2026-08-14
- scope: `cloud-itonami/isin`

## Context

この repo は `etzhayyim/root` の `60-apps/etzhayyim-project-isin` から
1 commit（`dbe911b`）で抽出された。抽出は tree をそのまま運び、
`migration.edn` の `:identity {:allowed-additions ["README.edn" "migration.edn"]}`
のとおり 26 → 28 file の 2 件だけを足している。

抽出は**正しく運んだ**が、モノレポの外では成立しない配線と、別実装向けの設計文書が
そのまま付いてきた。2026-08-14 に全部を実測した結果が
[`../operator-quickstart.md`](../operator-quickstart.md) で、この ADR はそこで
見つかったものをどう扱うかを決める。

実測の要点:

1. `kotoba/` のテストは**走る**（27 test 緑）。ただし 11 コマンド中 **6 つしか
   触っていない**。残り 5 つ（`searchSecurities` / `getDashboard` /
   `collectSecurities` / `collectEntityIR` / `enrichISIN`）は壊しても緑のまま。
2. `xrpc-adapter/` は `workspace:*` を解決できず install 前に落ちる。
   **root に npm workspaces を足しても直らない**（`workspace:` は npm の語彙で
   はない）。
3. `isin.etzhayyim.com` は NXDOMAIN。Worker route は一度も有効化されていない。
4. 継承した文書 3 つが、この実装と食い違っている（`CLAUDE.md` は Go / W Protocol の
   別実装、`kotoba/README.md` は自分と矛盾、`xrpc-adapter/README.md` は
   モノレポのパス）。

## Decision

### D1. ブロッカーは「直す」ではなく「名指しして測れる形にする」を先にやる

3 つのブロッカー（依存解決・DNS・deploy 資格情報）は、どれもこの repo の中だけでは
閉じない。`workspace:*` の書き換えは抽出物の内容を変える判断であり、DNS と
`account_id` / PDS セッションは所有者が別に居る。

**したがってこの反復では 1 つも直さない。** 代わりに、それぞれについて
「どのコマンドが」「どのエラーで」落ちるかを quickstart に実出力で固定した。
次に触る者が 10 分で現在地を掴めることを、この repo の当面の到達点とする。

### D2. `workspace:*` は npm 語彙へ書き換える（未実施・要判断）

`xrpc-adapter/package.json` の `"@etzhayyim/isin-kotoba": "workspace:*"` を
`"*"` に変え、root に `package.json`（`workspaces: ["kotoba","xrpc-adapter"]`）を
置けば npm で解決できる見込み。**未検証であり、この ADR では実施しない。**

理由: 抽出元は pnpm 前提のモノレポで、`workspace:` はそちらの正しい記法である。
ここだけ npm 語彙に倒すと、抽出元へ戻す・再抽出する経路と食い違う。パッケージ
マネージャの選択は `isin` 単独ではなく、同型に抽出された兄弟 repo
（`ipaddress` / `handotai` ほか）に共通する決定なので、そちらと揃えて決める。

`appview/` は事情が違い、**参照先のパッケージ自体がこの repo に無い**
（`@etzhayyim/kotodama-host-sdk` / `@etzhayyim/xrpc`）。D2 を実施しても解決
しないので、別途 vendoring するか、appview を別 repo に出すかの判断が要る。

### D3. 継承した文書は消さず、入口を 1 本にして誤読を止める

`CLAUDE.md` は Go / `kotodama.ATPost` / SQL graph / 60 country DID / 18 Minerva
competencies を記述しており、**この repo（TypeScript / PDS XRPC）に対応物が無い**。
`grep -rn "ATPost\|Minerva\|country_code" kotoba/src/ xrpc-adapter/src/` は無出力。

これを**消さない**。抽出元では正しい文書であり、設計意図の記録として価値がある。
代わりに `README.md` を唯一の入口とし、そこで「CLAUDE.md はこの実装の説明では
ない」と名指しする。同じ扱いを次の 2 つにも適用する:

- `kotoba/README.md` — 冒頭「11 of 11 (100%)」と末尾表「8 of 11」が矛盾（実測 11）。
  `src/index.ts` の docstring も slice 2 を「follow-up」と書くが実装済み。
- `xrpc-adapter/README.md` — `cd 60-apps/etzhayyim-project-isin/xrpc-adapter` は
  抽出前のパス。

### D4. テストの守備範囲を数値で持つ（5 コマンドが無検査であることを隠さない）

「27 passed」は緑だが、`getDashboard` の集計を壊しても 27 passed のままである
ことを実演した。**通過数を検出力の代わりに使わない。** quickstart にコマンド別の
参照回数を出す手順を置き、無検査の 5 つを名指しした。

次に `isin` の test 軸を触る者は、**新しいテストを足す前にこの 5 つのどれかを
壊してみること**。壊して赤くならないなら、そのコマンドには検査が無い。

## Consequences

- この repo の入口は `README.md` 1 本になる。サブパッケージの README と
  `CLAUDE.md` は、矛盾を明示した上で出自の記録として残る。
- ブロッカーは 3 つとも開いたまま。**deploy できないことは既知であり、
  「試したら動くかもしれない」ではない。**
- `migration.edn` の `:allowed-additions` は `README.edn` / `migration.edn` の
  2 件だが、本 ADR の時点で `README.md` / `docs/` / `.gitignore` を足しており、
  抽出物との byte 一致は既に成立しない。**identity の検査を再開する場合は
  allowed-additions 側を更新すること**（抽出元 tree は `46ea1dd7` で不変）。
- D2 を実施するまで `xrpc-adapter` と `appview` はビルドされない。
  この repo の CI 相当の検査は `kotoba/` の 27 test と、quickstart §5 の
  コマンド／ルート集合一致（依存不要）の 2 つだけである。
