export function createSlack(token, log = console) {
  async function api(method, body) {
    const res = await fetch(`https://slack.com/api/${method}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!json.ok) {
      const err = new Error(json.error || `Slack ${method} failed`);
      err.code = json.error;
      throw err;
    }
    return json;
  }

  return {
    postMessage(args) {
      return api("chat.postMessage", { unfurl_links: true, unfurl_media: false, ...args });
    },
    async addReaction(args) {
      try {
        await api("reactions.add", args);
      } catch (err) {
        if (err.code === "already_reacted" || err.code === "message_not_found") return;
        log.error?.(`[bridge] reaction failed: ${err.code || err.message}`);
      }
    },
    async createChannel({ name, isPrivate }) {
      try {
        const created = await api("conversations.create", { name, is_private: Boolean(isPrivate) });
        return created.channel;
      } catch (err) {
        if (err.code !== "name_taken") throw err;
        const created = await api("conversations.create", {
          name: `${name.slice(0, 72)}-${Date.now().toString().slice(-4)}`,
          is_private: Boolean(isPrivate),
        });
        return created.channel;
      }
    },
    async invite(channel, userId) {
      if (!userId) return;
      try {
        await api("conversations.invite", { channel, users: userId });
      } catch (err) {
        if (["already_in_channel", "cant_invite_self", "cant_invite"].includes(err.code)) return;
        throw err;
      }
    },
    async setPurpose(channel, purpose) {
      try {
        await api("conversations.setPurpose", { channel, purpose: String(purpose).slice(0, 250) });
      } catch (err) {
        log.error?.(`[bridge] channel purpose not set: ${err.code || err.message}`);
      }
    },
    publishView(userId, view) {
      return api("views.publish", { user_id: userId, view });
    },
  };
}
