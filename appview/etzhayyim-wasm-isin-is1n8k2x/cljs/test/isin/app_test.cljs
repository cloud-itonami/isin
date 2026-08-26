(ns isin.app-test
  (:require [cljs.test :refer [deftest is testing use-fixtures]]
            [re-frame.core :as rf]
            [re-frame.db :as rf-db]
            [isin.app :as app]))

(use-fixtures :each
  {:before (fn [] (rf/clear-subscription-cache!) (reset! rf-db/app-db {}))})

(deftest initialize-db-sets-defaults
  (testing ":initialize-db populates every fact the Svelte scaffold held,
            corrected for wrangler.jsonc's actual routes/vars and for
            xrpc now being unwired"
    (rf/dispatch-sync [:initialize-db])
    (is (= app/default-db @rf-db/app-db))
    (is (= "Isin Is1n8k2x" @(rf/subscribe [:app/title])))
    (is (= "etzhayyim-wasm-isin-is1n8k2x" @(rf/subscribe [:app/name])))
    (is (= "etzhayyim-project-isin" @(rf/subscribe [:app/project])))
    (is (= "appview" @(rf/subscribe [:app/kind])))
    (is (= 1 @(rf/subscribe [:app/route-count])))
    (is (= ["is1n8k2x.etzhayyim.com/*"] @(rf/subscribe [:app/routes])))
    (is (= ["APP_CAPABILITIES" "APP_DEPLOY_AT" "APP_DEPLOY_SHA" "APP_DESCRIPTION"
            "APP_DISPLAY_NAME" "APP_EMBED_URL" "APP_FRAMEWORK" "APP_NANOID"
            "APP_PERFORMER_TYPE" "APP_SOURCE" "APP_TEMPLATE" "APP_UI_TYPE"
            "APP_VERSION" "AGENTGATEWAY_MCP_ROUTER_URL"]
           @(rf/subscribe [:app/vars])))
    (is (false? @(rf/subscribe [:app/xrpc?])))
    (is (= "appview/etzhayyim-wasm-isin-is1n8k2x/cljs/src/isin/app.cljs"
           @(rf/subscribe [:app/relative-path])))))

(deftest routes-sub-reflects-db
  (testing ":app/routes reads whatever is in the db, not a fixed value"
    (reset! rf-db/app-db {:app/routes ["only-one.example.com/*"]})
    (is (= ["only-one.example.com/*"] @(rf/subscribe [:app/routes])))))

(deftest vars-sub-reflects-db
  (testing ":app/vars reads whatever is in the db, not a fixed value"
    (reset! rf-db/app-db {:app/vars []})
    (is (= [] @(rf/subscribe [:app/vars])))))

(deftest xrpc-sub-reflects-db
  (testing ":app/xrpc? reads whatever is in the db, not a fixed value"
    (reset! rf-db/app-db {:app/xrpc? true})
    (is (true? @(rf/subscribe [:app/xrpc?])))))

(deftest initialize-db-overwrites-prior-state
  (testing ":initialize-db resets to defaults even if the db already had other data"
    (reset! rf-db/app-db {:app/title "stale" :app/xrpc? true :unrelated 42})
    (rf/dispatch-sync [:initialize-db])
    (is (= app/default-db @rf-db/app-db))))
