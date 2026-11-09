// WhatsApp alerts to the GoArena team (not to customers), through CallMeBot's free
// "message yourself" API. Setup, once: from the admin's WhatsApp, send
// "I allow callmebot to send me messages" to the number on callmebot.com, then save the
// API key it replies with:  npx wrangler secret put CALLMEBOT_KEY
// ADMIN_WHATSAPP (wrangler.toml) is the number that receives the alerts.
import { logError } from './tracking.js';

export const alertsReady = (env) => !!(env.CALLMEBOT_KEY && env.ADMIN_WHATSAPP);

// Never throws: a failed alert must not break a sign-up. Returns true when sent.
export async function notifyAdmin(env, text, { groundId = null } = {}) {
  if (!alertsReady(env)) return false;
  const url = 'https://api.callmebot.com/whatsapp.php?' + new URLSearchParams({
    phone: '+' + String(env.ADMIN_WHATSAPP).replace(/\D/g, ''), text, apikey: env.CALLMEBOT_KEY,
  });
  try {
    const res = await (env.NOTIFY_FETCH || fetch)(url, { signal: AbortSignal.timeout(6000) });
    const body = await res.text();
    if (!res.ok || /error|invalid|not\s+activ/i.test(body.slice(0, 400))) throw new Error(`CallMeBot ${res.status}: ${body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)}`);
    return true;
  } catch (e) {
    await logError(env.DB, { groundId, source: 'server', path: 'whatsapp-alert', code: 'notify_failed', message: String(e.message || e) }).catch(() => {});
    return false;
  }
}
