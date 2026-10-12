import express from "express";
import bolt from "@slack/bolt";
import { loadEnvFile } from "./env.js";
import { SENDVISE_SUBSCRIBE, WEBHOOK_PATH, loadConfig, webhookUrl } from "./config.js";
import { verifySendvise } from "./bridge.js";
import { createStore } from "./store.js";
import { createSendvise, createTemplateSource } from "./sendvise.js";
import { createSlack } from "./slack.js";
import { handleSendvise, handleSlackMessage, startOutbound, templateMeta } from "./inbox.js";
import {
  composeModal,
  detailsModal,
  loadingModal,
  previewFromState,
  publishHome,
  readCompose,
  readDetails,
  sendingModal,
  successModal,
  validateCompose,
  validateDetails,
} from "./home.js";

const { App } = bolt;

loadEnvFile();
const config = loadConfig();

if (config.missing.length) {
  console.error(`Missing environment: ${config.missing.join(", ")}`);
  console.error("Copy .env.example to .env and fill in the Sendvise and Slack values.");
  process.exit(1);
}

const store = createStore(config.dataPath);
const sendvise = createSendvise({
  apiKey: config.sendviseApiKey,
  baseUrl: config.sendviseBaseUrl,
  phoneNumberId: config.sendvisePhoneNumberId,
});
const slack = createSlack(config.slackBotToken);
const templates = createTemplateSource(sendvise);
const deps = { store, sendvise, slack, templates, config, log: console };

const http = express();
http.use(
  express.json({
    limit: "1mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString("utf8");
    },
  }),
);

http.get("/health", (_req, res) => {
  res.json({
    ok: true,
    sendvise_webhook_url: webhookUrl(config),
    subscribe: SENDVISE_SUBSCRIBE,
  });
});

http.get(WEBHOOK_PATH, (_req, res) => {
  res.type("text").send("Sendvise webhook endpoint. Register this URL with a POST subscription.");
});

http.post(WEBHOOK_PATH, async (req, res) => {
  const timestamp = req.get("x-sendvise-timestamp");
  const signature = req.get("x-sendvise-signature");
  if (!verifySendvise(req.rawBody || "", timestamp, signature, config.sendviseWebhookSecret)) {
    res.status(401).json({ ok: false });
    return;
  }
  const deliveryId = req.get("x-sendvise-delivery-id") || "";
  try {
    await handleSendvise(req.body || {}, deliveryId, deps);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(`[bridge] webhook failed: ${err.message}`);
    res.status(500).json({ ok: false });
  }
});

const slackApp = new App({
  token: config.slackBotToken,
  signingSecret: config.slackSigningSecret,
  socketMode: true,
  appToken: config.slackAppToken,
});

slackApp.event("app_home_opened", async ({ event }) => {
  await publishHome(event.user, deps);
});

slackApp.action("open_new_message", async ({ ack, body, client }) => {
  await ack();
  const opened = await client.views.open({ trigger_id: body.trigger_id, view: loadingModal() });
  try {
    const approved = await templates.approved();
    await client.views.update({ view_id: opened.view.id, view: composeModal(approved) });
  } catch (err) {
    console.error(`[bridge] template list failed: ${err.message}`);
    await client.views.update({
      view_id: opened.view.id,
      view: {
        type: "modal",
        title: { type: "plain_text", text: "New message" },
        close: { type: "plain_text", text: "Close" },
        blocks: [
          {
            type: "section",
            text: { type: "mrkdwn", text: `Couldn't load templates. ${err.message}` },
          },
        ],
      },
    });
  }
});

slackApp.action(/^open_channel_/, async ({ ack }) => {
  await ack();
});

slackApp.action("refresh_preview", async ({ ack, body, client }) => {
  await ack();
  try {
    await client.views.update({ view_id: body.view.id, view: previewFromState(body.view) });
  } catch (err) {
    console.error(`[bridge] preview update failed: ${err.message}`);
  }
});

slackApp.view("pick_template", async ({ ack, view }) => {
  const parsed = readCompose(view);
  const errors = validateCompose(parsed);
  if (errors) {
    await ack({ response_action: "errors", errors });
    return;
  }
  let template;
  try {
    template = await templates.get(parsed.templateUuid);
  } catch (err) {
    await ack({
      response_action: "errors",
      errors: { template: "Couldn't load that template. Try again." },
    });
    console.error(`[bridge] template fetch failed: ${err.message}`);
    return;
  }
  const meta = templateMeta(template, {
    name: parsed.name,
    phone: parsed.phone,
    agentsConfigured: config.agentUserIds.length > 0,
  });
  await ack({ response_action: "update", view: detailsModal({ meta }) });
});

slackApp.view("send_outbound", async ({ ack, view, body, client }) => {
  const parsed = readDetails(view);
  const errors = validateDetails(parsed);
  if (errors) {
    await ack({ response_action: "errors", errors });
    return;
  }
  await ack({ response_action: "update", view: sendingModal(parsed.meta) });
  try {
    const result = await startOutbound(
      {
        userId: body.user.id,
        meta: parsed.meta,
        values: parsed.values,
        headerText: parsed.headerText,
        headerMediaUrl: parsed.headerMediaUrl,
        assign: parsed.assign,
      },
      deps,
    );
    await client.views.update({ view_id: view.id, view: successModal(result) });
  } catch (err) {
    console.error(`[bridge] outbound failed: ${err.message}`);
    try {
      await client.views.update({
        view_id: view.id,
        view: detailsModal({
          meta: parsed.meta,
          values: parsed.values,
          headerText: parsed.headerText,
          headerMediaUrl: parsed.headerMediaUrl,
          assign: parsed.assign,
          error: err.message,
        }),
      });
    } catch (updateErr) {
      console.error(`[bridge] could not show the send error: ${updateErr.message}`);
    }
  }
});

slackApp.message(async ({ message, body }) => {
  await handleSlackMessage({ message, eventId: body.event_id }, deps);
});

const server = http.listen(config.port, () => {
  const url = webhookUrl(config);
  console.log(`HTTP listening on port ${config.port}`);
  console.log(`Give Sendvise this webhook URL: ${url}`);
  console.log(`Subscribe: ${[...SENDVISE_SUBSCRIBE.required, ...SENDVISE_SUBSCRIBE.recommended].join(", ")}`);
});

try {
  await slackApp.start();
  console.log("Slack Socket Mode connected. Open the app's Home tab to send the first WhatsApp message.");
} catch (err) {
  console.error(`[bridge] Slack connection failed: ${err.message}`);
  server.close();
  process.exit(1);
}
