// Claude API direkt aus dem Browser (Bring-your-own-key).
// - Der API-Key liegt nur lokal in IndexedDB dieses Geräts und wird NIE mit Dropbox synchronisiert.
// - Direct Browser Access braucht den Header "anthropic-dangerous-direct-browser-access: true".
// - Strukturierte Ausgabe über output_config.format (JSON-Schema) → zuverlässig parsebar.
// - Kostenzähler pro Tag mit Limit; ohne Key oder über Limit wirft call() einen AiUnavailable-Fehler,
//   und die Module zeigen stattdessen Musterlösung + Checkliste.
import { db } from "./db.js";
import { store, dayKey } from "./store.js";

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2026-10-21";

// Preise in US-$ pro 1 Mio. Tokens (Stand 11/2026, platform.claude.com/pricing)
export const MODELS = {
  "claude-sonnet-5-5": { name: "Claude Sonnet 5.5 (empfohlen)", in: 2, out: 10, cacheRead: 0.1, fallback: true },
  "claude-opus-5-5": { name: "Claude Opus 5.5 (noch genauer, doppelt so teuer)", in: 4, out: 20, cacheRead: 0.2, fallback: true },
  "claude-haiku-5-5": { name: "Claude Haiku 5.5 (sehr günstig, einfacher)", in: 0.1, out: 0.5, cacheRead: 0.01, fallback: false },
};

export class AiUnavailable extends Error {
  constructor(reason, msg) {
    super(msg);
    this.reason = reason; // "nokey" | "limit" | "offline" | "error" | "refusal"
  }
}

export const ai = {
  key: null,

  async init() {
    this.key = await db.kvGet("apiKey", null);
  },
  async setKey(k) {
    this.key = (k || "").trim() || null;
    if (this.key) await db.kvSet("apiKey", this.key);
    else await db.kvDel("apiKey");
  },
  hasKey() { return !!this.key; },

  async costs() {
    return (await db.kvGet("aiCosts", {})) || {};
  },
  async spentToday() {
    return (await this.costs())[dayKey()]?.usd || 0;
  },
  async addCost(usd, model) {
    const c = await this.costs();
    const d = dayKey();
    c[d] = c[d] || { usd: 0, calls: 0 };
    c[d].usd += usd;
    c[d].calls += 1;
    c[d].model = model;
    await db.kvSet("aiCosts", c);
  },
  async spentTotal() {
    return Object.values(await this.costs()).reduce((s, x) => s + (x.usd || 0), 0);
  },

  async available() {
    if (!this.key) return { ok: false, reason: "nokey", msg: "Kein API-Key hinterlegt – du bekommst Musterlösung und Checkliste." };
    if (!navigator.onLine) return { ok: false, reason: "offline", msg: "Offline – KI-Feedback ist nur mit Internet möglich." };
    const spent = await this.spentToday();
    const limit = store.settings.aiDailyLimitUsd;
    if (spent >= limit) return { ok: false, reason: "limit", msg: `Tageslimit erreicht (${spent.toFixed(2)} $ von ${limit.toFixed(2)} $). Morgen geht es weiter – oder Limit in den Einstellungen erhöhen.` };
    return { ok: true };
  },

  /**
   * Ein Aufruf mit JSON-Schema-Ausgabe.
   * @param {{system:string, messages:Array, schema?:object, maxTokens?:number, effort?:string}} p
   * @returns {Promise<{data:any, text:string, usd:number}>}
   */
  async call({ system, messages, schema, maxTokens = 16000, effort }) {
    const av = await this.available();
    if (!av.ok) throw new AiUnavailable(av.reason, av.msg);
    const model = store.settings.aiModel in MODELS ? store.settings.aiModel : "claude-sonnet-5-5";
    const info = MODELS[model];
    const body = {
      model,
      max_tokens: maxTokens,
      system,
      messages,
      output_config: { effort: effort || store.settings.aiEffort || "medium" },
    };
    if (schema) body.output_config.format = { type: "json_schema", schema };
    const headers = {
      "content-type": "application/json",
      "x-api-key": this.key,
      "anthropic-version": API_VERSION,
      "anthropic-dangerous-direct-browser-access": "true",
    };
    if (info.fallback) {
      // Server-seitiger Fallback, falls ein Sicherheitsfilter fälschlich ablehnt
      body.fallbacks = "default";
      headers["anthropic-beta"] = "server-side-fallback-2026-07-01";
    }
    let r;
    try {
      r = await fetch(ENDPOINT, { method: "POST", headers, body: JSON.stringify(body) });
    } catch (e) {
      throw new AiUnavailable("offline", "Keine Verbindung zur KI. Bitte Internet prüfen.");
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const m = j?.error?.message || r.status;
      if (r.status === 401) throw new AiUnavailable("error", "API-Key ungültig. Bitte in den Einstellungen prüfen.");
      if (r.status === 429) throw new AiUnavailable("error", "Zu viele Anfragen – bitte kurz warten und erneut versuchen.");
      if (r.status === 529 || r.status >= 500) throw new AiUnavailable("error", "Die KI ist gerade überlastet. Bitte gleich noch einmal versuchen.");
      throw new AiUnavailable("error", "KI-Fehler: " + m);
    }
    const u = j.usage || {};
    const usd = ((u.input_tokens || 0) * info.in + (u.cache_creation_input_tokens || 0) * info.in * 1.25 + (u.cache_read_input_tokens || 0) * info.cacheRead + (u.output_tokens || 0) * info.out) / 1e6;
    await this.addCost(usd, model);
    if (j.stop_reason === "refusal") throw new AiUnavailable("refusal", "Die KI hat diese Anfrage abgelehnt. Bitte Text prüfen oder Musterlösung nutzen.");
    const text = (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    if (j.stop_reason === "max_tokens") throw new AiUnavailable("error", "Die Antwort war zu lang und wurde abgeschnitten. Bitte erneut versuchen.");
    let data = null;
    if (schema) {
      try { data = JSON.parse(text); } catch (e) { throw new AiUnavailable("error", "Antwort der KI war nicht lesbar. Bitte erneut versuchen."); }
    }
    return { data, text, usd };
  },

  /** Schätzung für die Anzeige vor dem Senden (grob, in US-$). */
  estimate(inTokens, outTokens) {
    const info = MODELS[store.settings.aiModel] || MODELS["claude-sonnet-5-5"];
    return (inTokens * info.in + outTokens * info.out) / 1e6;
  },
};

/** Kontext über die Lernerin für System-Prompts (aus den Einstellungen, nie im Code). */
export function learnerContext() {
  const s = store.settings;
  const wer = s.name ? `Die Lernerin heißt ${s.name}` : "Die Lernerin";
  return `${wer} hat Niveau B2/C1 und bereitet sich auf „telc Deutsch C1 Hochschule“ vor.` + (s.profil ? ` Hintergrund: ${s.profil}` : "");
}

// Gemeinsame Schema-Bausteine
export const S = {
  str: { type: "string" },
  int: { type: "integer" },
  num: { type: "number" },
  bool: { type: "boolean" },
  arr: (items) => ({ type: "array", items }),
  obj: (props, req = Object.keys(props)) => ({ type: "object", properties: props, required: req, additionalProperties: false }),
  enm: (...v) => ({ type: "string", enum: v }),
};
