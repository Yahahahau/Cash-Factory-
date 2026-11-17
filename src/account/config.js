// Public configuration of the account system. Everything here is read from Vite env variables (VITE_*), i.e. it ends up in the
// shipped JavaScript: only public values (project URL + publishable key) belong here. See .env.example.
const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
const list = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);

export const KNOWN_PROVIDERS = ['google', 'discord', 'github', 'apple']; // providers the UI knows how to brand
export const PROVIDER_LABEL = { google: 'Google', discord: 'Discord', github: 'GitHub', apple: 'Apple' };
export const AVATARS = ['coin', 'gem', 'ball', 'trophy', 'boost', 'flag', 'gear', 'chart']; // must match the profiles check constraint

export function readConfig(e = env) {
  const url = String(e.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = String(e.VITE_SUPABASE_ANON_KEY || '').trim();
  const valid = /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(url) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(url);
  return {
    configured: !!(valid && key.length > 20),
    url, key,
    gameId: String(e.VITE_GAME_ID || 'pixel-coin-pusher').trim() || 'pixel-coin-pusher',
    providerHint: list(e.VITE_AUTH_PROVIDERS).filter((p) => KNOWN_PROVIDERS.includes(p)), // empty = auto-detect from the project
    linking: String(e.VITE_ENABLE_LINKING || '') === '1',
    trustedHosts: list(e.VITE_TRUSTED_HOST_ORIGINS).filter((o) => /^https?:\/\/[^*/]+$/.test(o)), // exact origins only, never wildcards
  };
}
export const CONFIG = readConfig();
