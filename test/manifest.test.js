import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { SENDVISE_SUBSCRIBE, WEBHOOK_PATH } from "../src/config.js";

test("Slack manifest uses the Home tab and can open channels", () => {
  const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url)));
  assert.equal(manifest.features.app_home.home_tab_enabled, true);
  assert.equal(manifest.features.app_home.messages_tab_enabled, false);
  assert.equal(manifest.features.slash_commands, undefined);
  assert.equal(manifest.settings.socket_mode_enabled, true);
  assert.equal(manifest.settings.interactivity.is_enabled, true);
  assert.equal(manifest.settings.interactivity.request_url, undefined);
  assert.ok(manifest.settings.event_subscriptions.bot_events.includes("app_home_opened"));
  assert.ok(manifest.settings.event_subscriptions.bot_events.includes("message.groups"));
  assert.ok(manifest.oauth_config.scopes.bot.includes("groups:write"));
  assert.ok(manifest.oauth_config.scopes.bot.includes("channels:manage"));
});

test("Sendvise gets a single webhook path", () => {
  assert.equal(WEBHOOK_PATH, "/webhooks/sendvise");
  assert.deepEqual(SENDVISE_SUBSCRIBE.required, ["message.received"]);
  assert.ok(SENDVISE_SUBSCRIBE.recommended.includes("message.sent"));
  assert.ok(SENDVISE_SUBSCRIBE.recommended.includes("opt_out"));
});
