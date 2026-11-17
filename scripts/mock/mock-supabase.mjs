// TEST-ONLY mock of the small part of Supabase that the game uses (GoTrue + PostgREST). It lets the REAL supabase-js client and the
// real game UI run end to end without a Supabase project. It is NOT the real service: it proves the client logic, not the backend
// (the backend SQL is tested separately against real Postgres by scripts/sql-test.sh). Never deploy or point production at it.
import http from 'node:http';

export function startMock(port = 54400) {
  const users = new Map();   // email -> {id,email,password,confirmed,identities,created}
  const saves = new Map();   // userId -> row
  const profiles = new Map();
  const log = [];
  let tokenSeq = 0;
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = (u) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: u.id, email: u.email, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.mocksig`;
  const pub = (u) => ({ id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: u.confirmed ? new Date().toISOString() : null, app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [{ provider: 'email' }], created_at: new Date().toISOString() });
  const session = (u) => ({ access_token: jwt(u) + '.' + (++tokenSeq), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r' + u.id + (++tokenSeq), user: pub(u) });
  const byToken = (req) => { const t = (req.headers.authorization || '').replace(/^Bearer /, ''); try { const p = JSON.parse(Buffer.from(t.split('.')[1], 'base64url')); return [...users.values()].find((u) => u.id === p.sub); } catch { return null; } };

  const server = http.createServer(async (req, res) => {
    const cors = { 'access-control-allow-origin': req.headers.origin || '*', 'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info, x-supabase-api-version, prefer, accept, accept-profile, content-profile, range', 'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS', 'access-control-expose-headers': 'content-range', vary: 'origin' };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    const url = new URL(req.url, 'http://x'); const path = url.pathname;
    let body = ''; for await (const c of req) body += c; let json = {}; try { json = body ? JSON.parse(body) : {}; } catch { /* ignore */ }
    const send = (code, obj, extra = {}) => { res.writeHead(code, { 'content-type': 'application/json', ...cors, ...extra }); res.end(obj === undefined ? '' : JSON.stringify(obj)); };
    log.push(`${req.method} ${path}`);
    // ---- test control
    if (path === '/__confirm') { const u = users.get(url.searchParams.get('email')); if (u) u.confirmed = true; return send(200, { ok: !!u }); }
    if (path === '/__log') return send(200, log);
    if (path === '/__down') { mock.down = url.searchParams.get('on') === '1'; return send(200, { down: mock.down }); }
    if (path === '/__saves') return send(200, [...saves.values()]);
    if (mock.down && path.startsWith('/rest/')) return send(503, { message: 'down' });
    // ---- auth
    if (path === '/auth/v1/settings') return send(200, { external: { email: true, google: true, github: true, discord: false, apple: false }, disable_signup: false, mailer_autoconfirm: false });
    if (path === '/auth/v1/signup') {
      const email = String(json.email || '').toLowerCase();
      if (users.has(email)) return send(200, { ...pub(users.get(email)), identities: [] });
      const u = { id: 'u-' + (users.size + 1) + '-' + Math.random().toString(16).slice(2, 8), email, password: json.password, confirmed: false };
      users.set(email, u); return send(200, pub(u));
    }
    if (path === '/auth/v1/token') {
      if (url.searchParams.get('grant_type') === 'password') {
        const u = users.get(String(json.email || '').toLowerCase());
        if (!u || u.password !== json.password) return send(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
        if (!u.confirmed) return send(400, { code: 400, error_code: 'email_not_confirmed', msg: 'Email not confirmed' });
        return send(200, session(u));
      }
      if (url.searchParams.get('grant_type') === 'refresh_token') {
        const u = [...users.values()].find((x) => String(json.refresh_token || '').startsWith('r' + x.id));
        return u ? send(200, session(u)) : send(400, { error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' });
      }
    }
    if (path === '/auth/v1/user') { const u = byToken(req); if (!u) return send(401, { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' }); if (req.method === 'PUT' && json.password) u.password = json.password; return send(200, pub(u)); }
    if (path === '/auth/v1/logout') return send(204);
    if (path === '/auth/v1/recover' || path === '/auth/v1/resend') return send(200, {});
    // ---- rest
    const u = byToken(req);
    if (path.startsWith('/rest/v1/') && !u) return send(401, { code: 'PGRST301', message: 'JWT expired' });
    const single = /pgrst\.object/.test(req.headers.accept || '');
    if (path === '/rest/v1/user_game_saves' && req.method === 'GET') {
      const r = saves.get(u.id);
      if (!r) return single ? send(406, { code: 'PGRST116', message: 'The result contains 0 rows' }) : send(200, []);
      return send(200, single ? r : [r]);
    }
    if (path === '/rest/v1/rpc/save_game') {
      const cur = saves.get(u.id);
      if (json.p_save_version > 3 || JSON.stringify(json.p_save_data).length > 500000) return send(400, { code: '22023', message: 'invalid save' });
      if (cur && !json.p_force && Number(json.p_base_revision) !== cur.revision) return send(200, { status: 'conflict', revision: cur.revision });
      if (!cur && json.p_base_revision != null) return send(200, { status: 'conflict', revision: 0 });
      const row = { save_data: json.p_save_data, save_version: json.p_save_version, revision: (cur ? cur.revision : 0) + 1, updated_at: new Date().toISOString(), client_saved_at: json.p_client_saved_at, progress_score: json.p_progress_score };
      saves.set(u.id, row); return send(200, { status: 'ok', revision: row.revision });
    }
    if (path === '/rest/v1/profiles') {
      if (req.method === 'GET') { const p = profiles.get(u.id); return p ? send(200, single ? p : [p]) : single ? send(406, { code: 'PGRST116', message: 'none' }) : send(200, []); }
      profiles.set(u.id, { id: u.id, display_name: json.display_name, avatar_id: json.avatar_id }); return send(201);
    }
    if (path === '/rest/v1/rpc/delete_my_account') { saves.delete(u.id); profiles.delete(u.id); users.delete(u.email); return send(200, null); }
    return send(404, { message: 'not mocked: ' + path });
  });
  const mock = { users, saves, log, down: false, server, port, close: () => new Promise((r) => server.close(r)), listen: () => new Promise((r) => server.listen(port, '127.0.0.1', r)) };
  return mock;
}
if (process.argv[1] && process.argv[1].endsWith('mock-supabase.mjs')) { const m = startMock(Number(process.env.PORT) || 54400); m.listen().then(() => console.log('TEST-ONLY mock supabase on :' + m.port)); }
