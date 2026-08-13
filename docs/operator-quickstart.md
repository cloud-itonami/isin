# operator quickstart — isin

**この文書に書いてある手順は、2026-08-14 に実際に走らせて出力を確認したものだけ
である。** 通らない手順は「通らない」と、観測したエラーそのままで書いてある。
動くはずの手順として書いていない。

想定読者は、この repo を初めて触って「テストを走らせたい / deploy したい」と
考える operator。**結論を先に言うと、テストは走る。deploy はできない。**

計測環境: macOS 25.3.0 / node v26.3.0 / npm 11.16.0。

---

## 1. 取得する（通る）

```bash
git clone https://github.com/cloud-itonami/isin.git
cd isin
git log --oneline
```

履歴は短い。**根が `dbe911b chore: extract isin app from root` の 1 本**で、
その時点の tree が抽出物そのもの（`migration.edn` の `:tree 46ea1dd7`）。
以降の commit はここに足された文書だけである。

west 管理下の checkout を使う場合、この repo の remote 名は `origin` ではなく
**`cloud-itonami`**（org 名）である。`git fetch origin` は
`fatal: 'origin' does not appear to be a git repository` になる。

```bash
git fetch cloud-itonami          # ✅
```

## 2. テストを走らせる（通る・この repo で唯一の本物の検査）

```bash
cd kotoba
npm install
npm test
```

実測:

```
 Test Files  1 passed (1)
      Tests  27 passed (27)
   Duration  183ms
```

### 2-1. `npm install` が `EALLOWSCRIPTS` で落ちる場合

**利用者の `~/.npmrc` に `allow-scripts[]` の行が 1 つでもあると、npm ≥ 11.16 では
この repo の `npm install` が必ず落ちる**（この workspace の既定の `~/.npmrc` が
まさにその状態）:

```
npm error git dep preparation failed
npm error npm error code EALLOWSCRIPTS
npm error npm error --allow-scripts is not allowed in project-scoped installs.
npm error npm error Add the entries to the "allowScripts" field in package.json, or to .npmrc, instead.
```

落ちているのは自分の install ではなく、npm が git 依存
（`@etzhayyim/sdk` / `@etzhayyim/sdk-mock`）を用意するために**内部で起こす別の
npm プロセス**で、そちらは `--force` 付きで走るため user 設定の `allow-scripts` を
「project-scoped install での指定」と見なして拒否する。**`--ignore-scripts` を
付けても同じところで落ちる**（自分の install の話ではないため）。

user 設定を切れば通る:

```bash
npm_config_userconfig=/dev/null npm install
npm_config_userconfig=/dev/null npm test
```

`~/.npmrc` に `allow-scripts[]` が無い環境（CI・素の macOS）では、素の
`npm install` がそのまま通る。

### 2-2. `prepare: tsc` が走らなくてもテストが通る理由

install は 8 個の依存について
`packages have install scripts not yet covered by allowScripts` と警告し、
`@etzhayyim/sdk` の `prepare: tsc` は**走らない**。それでもテストが緑なのは、
`kotoba/src` が SDK を **型としてしか使っていない**からである:

```bash
grep -n 'from "@etzhayyim' kotoba/src/*.ts
# kotoba/src/collect.ts:16:import type { Etzhayyim } from "@etzhayyim/sdk";
# kotoba/src/registry.ts:18:import type { Etzhayyim } from "@etzhayyim/sdk";
```

`import type` は実行時に消える。テストが実際に注入するのは
`@etzhayyim/sdk-mock` の `MockEtzhayyim` なので、SDK の `dist/` は要らない。
**この性質に依存しているのはテスト経路だけで、`xrpc-adapter` は
`@etzhayyim/sdk-auth` を値として import するため同じ回避は効かない。**

### 2-3. install が作る未追跡ファイル

`npm install` は `kotoba/node_modules/`（134 package）と
`kotoba/package-lock.json` を作る。`.gitignore` はこの repo に元々無かったので
追加してある（lockfile は commit するかどうかが未決定なので、無視せず
`git status` に出したままにしてある）。

## 3. テストが何を守っていて、何を守っていないか

**この検査は落ちる。** ISIN 検査桁の英字→数字変換（A=10 なので `charCode − 55`）を
1 だけずらすと、壊した箇所そのものを名指しして赤くなる:

```bash
sed -i '' 's/digits += String(c.charCodeAt(0) - 55)/digits += String(c.charCodeAt(0) - 54)/' \
  kotoba/src/types.ts
npm_config_userconfig=/dev/null npm test
```

```
 FAIL  test/isin.test.ts > isin kotoba > registerSecurity > registers a security with valid ISIN and name
AssertionError: expected 'invalidIsin' to be 'registered'
 …
 FAIL  test/isin.test.ts > isin kotoba > ISIN validation helpers > validates well-known ISINs
AssertionError: expected false to be true

 Test Files  1 failed (1)
      Tests  19 failed | 8 passed (27)
```

⚠ **置換先を `digits += …` まで含めて指定すること。** `c.charCodeAt(0) - 55` だけを
狙うと `isValidLei` の同じ式（ISO 17442 の英字→数字変換）にも当たり、**2 つ壊れる**
（`21 failed | 6 passed`）。壊した対象と報告された対象を一致させられなくなるので、
ここでは ISIN 側 1 箇所だけを壊している。

無改変では 27 passed。**両方向を確認済み**なので、この検査の緑には意味がある。
（元に戻すのを忘れないこと: `git checkout -- kotoba/src/types.ts`）

**ただし守備範囲は 11 コマンド中 6 つしかない。** テストがどのコマンドを
1 度でも呼んでいるかを数える:

```bash
for c in collectEntityIR collectSecurities enrichISIN getDashboard getSecurity \
         listByCountry listSecurities registerEntity registerSecurity \
         searchSecurities validateIsin; do
  printf '%-20s %s\n' "$c" "$(grep -c "\b$c(" kotoba/test/isin.test.ts)"
done
```

実測:

```
collectEntityIR      0     ← 無検査
collectSecurities    0     ← 無検査
enrichISIN           0     ← 無検査
getDashboard         0     ← 無検査
getSecurity          6
listByCountry        2
listSecurities       4
registerEntity       4
registerSecurity     14
searchSecurities     0     ← 無検査
validateIsin         3
```

**この 5 つは壊しても緑のままである。** 実演 —— `getDashboard` の国別集計を
1 件あたり 999 に膨らませる:

```bash
sed -i '' 's/byCountry\[s.value.country\] = (byCountry\[s.value.country\] ?? 0) + 1;/byCountry[s.value.country] = (byCountry[s.value.country] ?? 0) + 999;/' \
  kotoba/src/registry.ts
npm_config_userconfig=/dev/null npm test
```

```
 Test Files  1 passed (1)
      Tests  27 passed (27)
```

（元に戻す: `git checkout -- kotoba/src/registry.ts`）

つまり「27 passed」は **`registerSecurity` 周辺と検査桁が正しい**ことしか
言っていない。collect / enrich / search / dashboard について何も言っていない。

## 4. 詰まっている 3 点

### 4-1. `xrpc-adapter/` は依存解決の手前で落ちる（workspace root が無い）

```bash
cd xrpc-adapter && npm install
```

```
npm error code EUNSUPPORTEDPROTOCOL
npm error Unsupported URL Type "workspace:": workspace:*
```

`xrpc-adapter/package.json` は `"@etzhayyim/isin-kotoba": "workspace:*"` を
宣言しているが、**この repo には root の `package.json` が無い**:

```bash
ls package.json                                        # No such file or directory
grep -rn '"workspaces"' --include=package.json .       # 出力なし
```

抽出前のモノレポには workspace root が在ったので、これは**抽出時に落ちた配線**で
あって書き間違いではない。

⚠ **root に npm workspaces を足しても直らない。** 実際に試した:

```bash
echo '{"name":"isin","private":true,"workspaces":["kotoba","xrpc-adapter"]}' > package.json
npm install
# npm error code EUNSUPPORTEDPROTOCOL
# npm error Unsupported URL Type "workspace:": workspace:*
```

`workspace:` プロトコルは pnpm / yarn の語彙で、**npm は workspaces を有効に
していても解釈しない**。npm で通すなら `xrpc-adapter/package.json` の依存指定
自体を `"*"` に書き換える必要があり、これは抽出物の内容を変える判断なので
ADR-0001 に送ってある。

### 4-2. `appview/` の依存はこの repo に存在しない

```bash
cat appview/etzhayyim-wasm-isin-is1n8k2x/package.json
# "@etzhayyim/kotodama-host-sdk": "workspace:*"
# "@etzhayyim/xrpc": "workspace:*"
```

4-1 と違い、こちらは**参照先のパッケージ自体がこの repo に無い**（`kotoba/` は
`@etzhayyim/isin-kotoba` として実在する）。workspace root を作っても解決しない。

### 4-3. deploy 先の DNS が無い（= 未デプロイ）

```bash
dig isin.etzhayyim.com +noall +comment | grep -o 'status: [A-Z]*'
# status: NXDOMAIN
```

zone 自体は在って、隣のサブドメインは解決する:

```bash
dig +short NS etzhayyim.com      # everton.ns.cloudflare.com. / vivienne.ns.cloudflare.com.
dig +short pds.etzhayyim.com     # 172.67.179.128 / 104.21.51.111
```

`xrpc-adapter/wrangler.jsonc` の route は `isin.etzhayyim.com/xrpc/*`（zone
`etzhayyim.com`）だが、Cloudflare の Worker route はホスト名の DNS レコードが要る。
**NXDOMAIN は「route が一度も有効化されていない」ことを意味する。**
`xrpc-adapter/README.md` の「Deploys to isin.etzhayyim.com/xrpc/\*」は意図で
あって現況ではない。

**deploy を試みる前に**: この repo は `orgs/cloud-itonami/` 配下の west project
なので、superproject の deploy guard（`origin/main` 同期の強制）が効く。加えて
`wrangler.jsonc` の `account_id` と PDS のセッション（`PDS_ACCESS_JWT` /
`PDS_REFRESH_JWT`）が要る —— **どちらもこの repo には入っていない**。そもそも
4-1 のため adapter はビルドできない。

## 5. 依存を 1 つも入れずにできる棚卸し（通る）

**11 個の kotoba コマンドと 11 本の adapter ルートが同じ集合であること**を、
`npm install` 抜きで確かめられる:

```bash
grep -hoE '^export (async )?function [a-zA-Z]+' kotoba/src/*.ts \
  | sed 's/.*function //' \
  | grep -vE '^(entityDid|entityRkey|securityDid|securityRkey|isValidIsin|isValidLei|isinCheckDigit|normalizeIsin)$' \
  | sort > /tmp/isin-cmds.txt
grep -oE '\$\{NSID_BASE\}\.[a-zA-Z]+' xrpc-adapter/src/index.ts \
  | sed 's/.*\.//' | sort > /tmp/isin-routes.txt

echo "commands: $(wc -l < /tmp/isin-cmds.txt)  routes: $(wc -l < /tmp/isin-routes.txt)"
diff /tmp/isin-cmds.txt /tmp/isin-routes.txt && echo "OK: sets identical"
```

実測（clean な clone）:

```
commands:       11  routes:       11
OK: sets identical
```

除いている 8 個は XRPC コマンドではない（DID / rkey の導出と検査桁のヘルパー。
export は全部で 19 個）。

## 6. 何を読むと設計が分かるか — と、読んではいけないもの

| 読む | 何が書いてあるか |
|---|---|
| `README.md` | この repo の役割と、`isic` / `cloud-itonami-lei-*` との境界 |
| `kotoba/README.md` | Option B（PDS XRPC 書き込み）を採った理由、ISIN / LEI 検査桁の算法 |
| `docs/adr/0001-verified-state-and-blockers.md` | 上のブロッカーをどう扱うか |

**`CLAUDE.md` をこの実装の説明として読まない。** 60 か国の country DID、heartbeat、
`kotodama.ATPost(...)`、`G("Security").Match(...)`、18 Minerva competencies ——
どれも Go の別実装の設計であって、ここ（TypeScript / PDS XRPC）に対応物が無い:

```bash
grep -rn "ATPost\|Minerva\|country_code" kotoba/src/ xrpc-adapter/src/   # 出力なし
```

同様に `appview/*/kotodama.jsonld` の `"SEC EDGAR"` / OpenFIGI も、この repo が
自分で引くという意味ではない（`kotoba/src` に `fetch(` は 0 件で、`enrichISIN` の
実装コメントが「外部取得は LangServer pod 側」と明記している）。

設計の正本 ADR-2605203000 / ADR-2605210000 / ADR-2605111200 は抽出元の
`etzhayyim/root` にあり、**この repo には入っていない**。`kotoba/README.md` 中の
`../../../90-docs/adr/...` 相対リンクはここでは解決しない。
