# WhatsApp Inbox

Two ways a WhatsApp conversation starts, same place it continues.

- **You go first.** The Slack app Home tab sends an approved template. A private channel opens, and you are in it.
- **They go first.** The message opens a private channel and the next person on the rota is added, same idea as a guest channel with a default agent.

Replies after that are normal channel messages. WhatsApp only accepts free-form replies for 24 hours after the customer last wrote. Until then, send another template from Home.

Slack uses Socket Mode. Sendvise is the only public webhook.

## Webhook to give Sendvise

Register **one** URL in **Dashboard → Settings → Webhook Integrations**:

```
https://<PUBLIC_BASE_URL>/webhooks/sendvise
```

Subscribe that URL to `message.received`, `message.sent`, `opt_in`, `opt_out`, and `contact.created`. Add `message.delivered`, `message.read`, and `message.failed` if the dashboard lists them. Put the signing secret in `SENDVISE_WEBHOOK_SECRET`.

## Slack app

The app manifest is `manifest.json`. Deploy it with the Slack CLI onto the warpdrivegridsandbox org, granted to the Warpdrive demo Sandbox workspace:

```bash
slack deploy --team warpdrivegridsandbox --org-workspace-grant T095EQWNGFN
```

Slack installs the app and turns on Socket Mode. It does not host this process. Copy the signing secret, the bot token (`xoxb-`), and an app-level token (`xapp-`) with `connections:write` into `.env`. Put the people who should receive new inbound chats in `SLACK_AGENT_USER_IDS`, comma-separated member IDs, in the order they should rotate.

There is no slash command and no single inbox channel. The Home tab is how outbound messages start. Each phone number gets its own channel.

The Convex trial lives in a separate project, `../ibgroup-convex`. This folder stays the on-prem version: Socket Mode, a server in the client's office, and the database on that machine.

## Run

```bash
cp .env.example .env
npm install
npm start
```

Expose the server over HTTPS and register `/webhooks/sendvise` with Sendvise. In Slack, open **WhatsApp → Home**.

**New message** asks for a name, a number, and an approved template, then shows the sentence with the blanks filled in. Send adds you to the channel. Choose **Hand the reply to the next person** when someone else should own the follow-up. You are still added so you can see it.

Node 22 or newer.

## Tests

```bash
npm test
```
