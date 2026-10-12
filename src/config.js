export const WEBHOOK_PATH = "/webhooks/sendvise";

export const SENDVISE_SUBSCRIBE = {
  required: ["message.received"],
  recommended: ["message.sent", "opt_in", "opt_out", "contact.created"],
  optional: ["order.paid", "campaign.completed", "message.delivered", "message.read", "message.failed"],
};

const REQUIRED = [
  "SENDVISE_API_KEY",
  "SENDVISE_WEBHOOK_SECRET",
  "SLACK_BOT_TOKEN",
  "SLACK_SIGNING_SECRET",
  "SLACK_APP_TOKEN",
];

export function loadConfig(env = process.env) {
  const missing = REQUIRED.filter((key) => !env[key]);
  return {
    port: Number(env.PORT || 3000),
    publicBaseUrl: (env.PUBLIC_BASE_URL || "").replace(/\/$/, ""),
    sendviseApiKey: env.SENDVISE_API_KEY || "",
    sendviseBaseUrl: (env.SENDVISE_BASE_URL || "https://app.sendvise.com/api").replace(/\/$/, ""),
    sendviseWebhookSecret: env.SENDVISE_WEBHOOK_SECRET || "",
    sendvisePhoneNumberId: env.SENDVISE_PHONE_NUMBER_ID || "",
    sendviseTemplateLanguage: env.SENDVISE_TEMPLATE_LANGUAGE || "en",
    slackBotToken: env.SLACK_BOT_TOKEN || "",
    slackSigningSecret: env.SLACK_SIGNING_SECRET || "",
    slackAppToken: env.SLACK_APP_TOKEN || "",
    agentUserIds: (env.SLACK_AGENT_USER_IDS || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
    privateChannels: env.SLACK_PRIVATE_CHANNELS !== "false",
    dataPath: env.DATA_PATH || "./data/bridge.sqlite",
    missing,
  };
}

export function webhookUrl(config) {
  const base = config.publicBaseUrl || `http://localhost:${config.port}`;
  return `${base}${WEBHOOK_PATH}`;
}
