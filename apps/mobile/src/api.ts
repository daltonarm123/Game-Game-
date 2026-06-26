import { API_BASE } from "./config";

// ── helpers ──────────────────────────────────────────────────────────────────

function headers(token?: string) {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

async function req<T = any>(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: headers(token),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json as T;
}

const get = <T = any>(path: string, token?: string) => req<T>("GET", path, undefined, token);
const post = <T = any>(path: string, body: unknown, token?: string) => req<T>("POST", path, body, token);

// ── auth ─────────────────────────────────────────────────────────────────────

export const authApi = {
  register: (email: string, username: string, password: string, kingdomName: string) =>
    post("/api/auth/register", { email, username, password, kingdomName }),

  login: (emailOrUsername: string, password: string) =>
    post("/api/auth/login", { emailOrUsername, password }),

  me: (token: string) => get("/api/auth/me", token),

  logout: (token: string) => post("/api/auth/logout", {}, token),

  verifyEmail: (token: string) => post("/api/auth/verify-email", { token }),

  resendVerification: (token: string) => post("/api/auth/resend-verification", {}, token),

  forgotPassword: (email: string) => post("/api/auth/forgot-password", { email }),

  resetPassword: (token: string, newPassword: string) =>
    post("/api/auth/reset-password", { token, newPassword }),
};

// ── kingdom ───────────────────────────────────────────────────────────────────

export const kingdomApi = {
  get: (name: string, token?: string) =>
    get(`/api/kingdom/${encodeURIComponent(name)}`, token),

  build: (name: string, buildingCode: string, token: string) =>
    post(`/api/kingdom/${encodeURIComponent(name)}/build`, { buildingCode }, token),

  train: (name: string, troopCode: string, quantity: number, token: string) =>
    post(`/api/kingdom/${encodeURIComponent(name)}/train`, { troopCode, quantity }, token),

  disband: (name: string, troopCode: string, quantity: number, token: string) =>
    post(`/api/kingdom/${encodeURIComponent(name)}/disband`, { troopCode, quantity }, token),

  setTax: (name: string, taxRate: number, token: string) =>
    post(`/api/kingdom/${encodeURIComponent(name)}/tax`, { taxRate }, token),

  activateShield: (name: string, token: string, days: 1 | 2 | 7 | 14 | 30 = 1) =>
    post(`/api/kingdom/${encodeURIComponent(name)}/shield/activate`, { days }, token),

  cancelShield: (name: string, token: string) =>
    post(`/api/kingdom/${encodeURIComponent(name)}/shield/cancel`, {}, token),

  claimDailyBonus: (name: string, token: string) =>
    post(`/api/kingdom/${encodeURIComponent(name)}/daily-bonus/claim`, {}, token),

  search: (q: string, token?: string) =>
    get(`/api/kingdom-search?q=${encodeURIComponent(q)}`, token),
};

// ── war room ──────────────────────────────────────────────────────────────────

export const warApi = {
  getWarRoom: (kingdom: string, token?: string) =>
    get(`/api/war-room/${encodeURIComponent(kingdom)}`, token),

  attack: (attacker: string, target: string, troops: Record<string, number>, token: string) =>
    post(`/api/war-room/${encodeURIComponent(attacker)}/attack`, { defenderKingdom: target, sentTroops: troops }, token),

  // sentTroops must have at least one troop > 0; caller should supply available troops
  explore: (attacker: string, token: string, sentTroops: Record<string, number> = { soldiers: 1 }) =>
    post(`/api/war-room/${encodeURIComponent(attacker)}/explore`, { sentTroops }, token),

  spy: (attacker: string, target: string, spyCount: number, token: string) =>
    post(`/api/war-room/${encodeURIComponent(attacker)}/spy`, { defenderKingdom: target, spiesToSend: spyCount }, token),

  getReports: (kingdom: string, type: string, page: number, token?: string) =>
    get(`/api/war-room/reports/${encodeURIComponent(kingdom)}?type=${type}&page=${page}`, token),
};

// ── pray ──────────────────────────────────────────────────────────────────────

export const prayApi = {
  get: (kingdom: string, token?: string) =>
    get(`/api/pray/${encodeURIComponent(kingdom)}`, token),

  start: (kingdom: string, prayerCode: string, days: number, token: string) =>
    post(`/api/pray/${encodeURIComponent(kingdom)}/start`, { prayerCode, days }, token),

  stop: (kingdom: string, prayerId: number, token: string) =>
    post(`/api/pray/${encodeURIComponent(kingdom)}/stop`, { prayerId }, token),
};

// ── market ────────────────────────────────────────────────────────────────────

export const marketApi = {
  browse: (resource?: string) =>
    get(`/api/market${resource && resource !== "all" ? `?resource=${resource}` : ""}`),

  history: (kingdom: string, token?: string) =>
    get(`/api/market/${encodeURIComponent(kingdom)}/history`, token),

  list: (kingdom: string, resource: string, quantity: number, pricePerUnit: number, token: string) =>
    post(`/api/market/${encodeURIComponent(kingdom)}/list`, { resource, quantity, pricePerUnit }, token),

  buy: (kingdom: string, listingId: number, quantity: number, token: string) =>
    post(`/api/market/${encodeURIComponent(kingdom)}/buy`, { listingId, quantity }, token),

  cancel: (kingdom: string, listingId: number, token: string) =>
    post(`/api/market/${encodeURIComponent(kingdom)}/cancel`, { listingId }, token),
};

// ── rankings ──────────────────────────────────────────────────────────────────

export const rankingsApi = {
  getKingdoms: (limit = 50, offset = 0, search = "") =>
    get(`/api/rankings/kingdoms?limit=${limit}&offset=${offset}&search=${encodeURIComponent(search)}`),

  getNwHistory: (name: string) =>
    get(`/api/rankings/kingdoms/${encodeURIComponent(name)}/nw-history`),
};

// ── research ──────────────────────────────────────────────────────────────────

export const researchApi = {
  get: (kingdom: string, token?: string) =>
    get(`/api/research/${encodeURIComponent(kingdom)}`, token),

  start: (kingdom: string, techCode: string, token: string) =>
    post(`/api/research/${encodeURIComponent(kingdom)}/start`, { researchCode: techCode }, token),
};

// ── settlements ───────────────────────────────────────────────────────────────

export const settlementApi = {
  get: (kingdom: string, token?: string) =>
    get(`/api/settlements/${encodeURIComponent(kingdom)}`, token),

  getBuildingTypes: (kingdom: string, token?: string) =>
    get(`/api/settlements/${encodeURIComponent(kingdom)}/building-types`, token),

  found: (kingdom: string, settlementType: string, name: string, token: string) =>
    post(`/api/settlements/${encodeURIComponent(kingdom)}/found`, { settlementType, name }, token),

  buildBuilding: (kingdom: string, settlementId: number, buildingCode: string, token: string) =>
    post(`/api/settlements/${encodeURIComponent(kingdom)}/build-building`, { settlementId, buildingCode }, token),

  upgradeBuilding: (kingdom: string, settlementId: number, buildingCode: string, token: string) =>
    post(`/api/settlements/${encodeURIComponent(kingdom)}/upgrade-building`, { settlementId, buildingCode }, token),
};

// ── alliance ──────────────────────────────────────────────────────────────────

export const allianceApi = {
  get: (kingdom: string, token?: string) =>
    get(`/api/alliance/${encodeURIComponent(kingdom)}`, token),

  create: (kingdom: string, name: string, tag: string, token: string) =>
    post(`/api/alliance/${encodeURIComponent(kingdom)}/create`, { name, slug: tag }, token),

  join: (kingdom: string, slug: string, token: string) =>
    post(`/api/alliance/${encodeURIComponent(kingdom)}/join`, { slug }, token),

  leave: (kingdom: string, token: string) =>
    post(`/api/alliance/${encodeURIComponent(kingdom)}/leave`, {}, token),

  setRelation: (kingdom: string, targetName: string, relationType: string, note: string, token: string) =>
    post(`/api/alliance/${encodeURIComponent(kingdom)}/relation`, { targetName, relationType, note }, token),

  contribute: (kingdom: string, buildingCode: string, gold: number, stone: number, wood: number, token: string) =>
    post(`/api/alliance/${encodeURIComponent(kingdom)}/contribute`, { buildingCode, gold, stone, wood }, token),
};

// ── pigeons ───────────────────────────────────────────────────────────────────

export const pigeonsApi = {
  get: (kingdom: string, token?: string) =>
    get(`/api/pigeons/${encodeURIComponent(kingdom)}`, token),

  send: (kingdom: string, toKingdom: string, subject: string, body: string, token: string) =>
    post(`/api/pigeons/${encodeURIComponent(kingdom)}/send`, { toKingdom, subject, body }, token),

  read: (kingdom: string, mailId: number, token: string) =>
    post(`/api/pigeons/${encodeURIComponent(kingdom)}/${mailId}/read`, {}, token),
};

// ── notifications ─────────────────────────────────────────────────────────────

export const notifApi = {
  get: (kingdom: string, token: string) =>
    get(`/api/notifications/${encodeURIComponent(kingdom)}`, token),

  ack: (kingdom: string, ids: number[], token: string) =>
    post(`/api/notifications/${encodeURIComponent(kingdom)}/ack`, { ids }, token),
};

// ── admin ─────────────────────────────────────────────────────────────────────

export const adminApi = {
  getStats: (token: string) => get("/api/admin/stats", token),
  getKingdoms: (token: string, search = "", limit = 50, offset = 0) =>
    get(`/api/admin/kingdoms?search=${encodeURIComponent(search)}&limit=${limit}&offset=${offset}`, token),
  getUsers: (token: string, search = "", limit = 50, offset = 0) =>
    get(`/api/admin/users?search=${encodeURIComponent(search)}&limit=${limit}&offset=${offset}`, token),
  ban: (userId: string, reason: string, token: string) =>
    post("/api/admin/ban", { userId, reason }, token),
  unban: (userId: string, token: string) =>
    post("/api/admin/unban", { userId }, token),
  setAdmin: (userId: string, grant: boolean, token: string) =>
    post("/api/admin/set-admin", { userId, grant }, token),
};
