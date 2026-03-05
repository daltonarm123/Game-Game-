import dotenv from "dotenv";
import express from "express";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import rateLimit from "express-rate-limit";
import type { PoolClient } from "pg";
import { z } from "zod";
import {
  ECON_BUILDING_HOURLY,
  MANA_PER_PRIEST_PER_HOUR,
  PRAYERS,
  PRIESTS_PER_TEMPLE,
  DIPLOMATS_PER_EMBASSY,
  SEASONS,
  SETTLEMENT_TYPE_DEF,
  clampNumber,
  computeStorageCaps,
  effectivePeasantCap,
  expectedSettlementPlan,
  researchGoldCost,
  researchSeconds,
  settlementTypeDisplay,
  taxGoldMultiplier,
} from "../../../packages/shared/src/index.js";
import { ensureSchema, pool, withTx } from "./db.js";
import {
  HOLY_SPELL_COSTS,
  computeSabotageStolen,
  isAllianceModerator,
  resolveHolySpellDelta,
  resolveSabotageOutcome,
} from "./gameplay.js";
import { evaluateOpsAlerts } from "./ops.js";

dotenv.config();

/** Convert a ZodError into a readable string for API responses. */
function zodMsg(e: z.ZodError): string {
  const flat = e.flatten();
  const msgs = [...flat.formErrors, ...Object.values(flat.fieldErrors as Record<string, string[]>).flat()];
  return msgs.join("; ") || "Validation error";
}

const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGIN || "*")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);
function resolveAllowedOrigin(originHeader: string | undefined): string {
  if (ALLOWED_ORIGINS.includes("*")) return "*";
  const reqOrigin = String(originHeader || "").trim();
  if (reqOrigin && ALLOWED_ORIGINS.includes(reqOrigin)) return reqOrigin;
  return ALLOWED_ORIGINS[0] || "*";
}
const app = express();
app.set("trust proxy", 1); // Required for Railway — fixes rate limiter X-Forwarded-For error
app.use((req, res, next) => {
  const allowOrigin = resolveAllowedOrigin(req.headers.origin as string | undefined);
  res.setHeader("Access-Control-Allow-Origin", allowOrigin);
  if (allowOrigin !== "*") res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();
  return next();
});
app.use(express.json());

type RouteSample = { ms: number; at: number; status: number };
const routeSamples = new Map<string, RouteSample[]>();
const MAX_SAMPLES_PER_ROUTE = 400;
const PERF_BUDGET_P95_MS = 120;
function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}
function recordRouteSample(key: string, sample: RouteSample) {
  const arr = routeSamples.get(key) || [];
  arr.push(sample);
  if (arr.length > MAX_SAMPLES_PER_ROUTE) arr.splice(0, arr.length - MAX_SAMPLES_PER_ROUTE);
  routeSamples.set(key, arr);
}

const kingdomStreamClients = new Map<string, Set<express.Response>>();
function streamSetFor(kingdomName: string) {
  const key = String(kingdomName || "").trim().toLowerCase();
  if (!kingdomStreamClients.has(key)) kingdomStreamClients.set(key, new Set());
  return kingdomStreamClients.get(key)!;
}
function publishKingdomEvent(kingdomName: string, evt: string, payload: Record<string, unknown> = {}) {
  const key = String(kingdomName || "").trim().toLowerCase();
  if (!key) return;
  const listeners = kingdomStreamClients.get(key);
  if (!listeners || listeners.size === 0) return;
  const body = `event: ${evt}\ndata: ${JSON.stringify({ at: new Date().toISOString(), ...payload })}\n\n`;
  for (const client of listeners) {
    try {
      client.write(body);
    } catch {
      // ignore disconnected client
    }
  }
}

app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on("finish", () => {
    const key = `${req.method} ${req.path}`;
    recordRouteSample(key, { ms: Date.now() - startedAt, at: Date.now(), status: res.statusCode });
  });
  next();
});

app.use((req, res, next) => {
  res.on("finish", () => {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return;
    if (res.statusCode >= 500) return;
    const candidates = new Set<string>();
    const p = req.params as Record<string, string | undefined>;
    const b = (req.body || {}) as Record<string, unknown>;
    const maybeAdd = (v: unknown) => {
      const s = String(v || "").trim();
      if (s) candidates.add(s);
    };
    maybeAdd(p?.name);
    maybeAdd(p?.kingdom);
    maybeAdd(p?.attacker);
    maybeAdd((b as any)?.defenderKingdom);
    maybeAdd((b as any)?.toKingdom);
    for (const k of candidates) publishKingdomEvent(k, "refresh", { reason: `${req.method} ${req.path}` });
  });
  next();
});

// ── Rate limiting ────────────────────────────────────────────────────────────
const limiterKey = (req: express.Request) => {
  const token = String(req.headers.authorization || "").trim().replace(/^Bearer\s+/i, "");
  if (token) return `tok:${token.slice(0, 32)}`;
  return `ip:${String(req.ip || req.socket.remoteAddress || "unknown")}`;
};
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: limiterKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many attempts. Please wait 15 minutes." },
});
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 900,
  keyGenerator: limiterKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many requests. Please slow down." },
});
const actionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 90,
  keyGenerator: limiterKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many actions. Please wait a moment." },
});
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth/forgot-password", authLimiter);
app.use("/api/auth/reset-password", authLimiter);
app.use("/api/war-room/:attacker/attack", actionLimiter);
app.use("/api/war-room/:attacker/explore", actionLimiter);
app.use("/api/war-room/:attacker/spy", actionLimiter);
app.use("/api/guildhall/:kingdom/sabotage", actionLimiter);
app.use("/api/market/:kingdom/buy", actionLimiter);
app.use("/api", generalLimiter);

const API_PORT = Number(process.env.API_PORT || 8080);
const ATTACK_RETURN_MINUTES = Number(process.env.ATTACK_RETURN_MINUTES || 20);
const LOCAL_DEMO_FAST = String(process.env.LOCAL_DEMO_FAST || "").trim() === "1";
const FAST_BUILD_SECONDS = Math.max(1, Number(process.env.FAST_BUILD_SECONDS || 60));
const FAST_TRAIN_SECONDS = Math.max(1, Number(process.env.FAST_TRAIN_SECONDS || 30));
const FAST_RESEARCH_SECONDS = Math.max(5, Number(process.env.FAST_RESEARCH_SECONDS || 15));
const SHIELD_CANCEL_COOLDOWN_SECONDS = Math.max(60, Number(process.env.SHIELD_CANCEL_COOLDOWN_SECONDS || 24 * 3600));
const ATTACK_RETURN_SECONDS = Math.max(
  1,
  Number(process.env.ATTACK_RETURN_SECONDS || (LOCAL_DEMO_FAST ? 20 : ATTACK_RETURN_MINUTES * 60)),
);
const ATTACK_MIN_EFFECTIVE_POWER_FOR_SPOILS = Math.max(
  1,
  Number(process.env.ATTACK_MIN_EFFECTIVE_POWER_FOR_SPOILS || 120),
);
const ATTACK_FULL_EFFECTIVE_POWER_FOR_SPOILS = Math.max(
  ATTACK_MIN_EFFECTIVE_POWER_FOR_SPOILS + 1,
  Number(process.env.ATTACK_FULL_EFFECTIVE_POWER_FOR_SPOILS || 2200),
);
const SEASON_LENGTH_SECONDS = Math.max(30, Number(process.env.SEASON_LENGTH_SECONDS || (LOCAL_DEMO_FAST ? 60 : 7 * 24 * 3600)));
const EXPLORE_LAND_CAP = 20_000;
const EXPLORE_MIN_RETURN_SECONDS = LOCAL_DEMO_FAST ? 12 : 5 * 60;
const EXPLORE_MAX_RETURN_SECONDS = LOCAL_DEMO_FAST ? 40 : 8 * 3600;
const EXPLORE_MIN_EFFECTIVE_POWER = Math.max(1, Number(process.env.EXPLORE_MIN_EFFECTIVE_POWER || 25) || 25);
const EXPLORE_POWER_TO_LAND = Math.max(0.001, Number(process.env.EXPLORE_POWER_TO_LAND || 0.08) || 0.08);
const EXPLORE_LAND_PER_MISSION_CAP = Math.max(50, Number(process.env.EXPLORE_LAND_PER_MISSION_CAP || 550) || 550);
const EXPLORE_SMALL_KINGDOM_MIN_LAND = Math.max(0, Number(process.env.EXPLORE_SMALL_KINGDOM_MIN_LAND || 120) || 120);
const EXPLORE_KG_BONUS_AT_MIN_LAND = Math.max(0.2, Number(process.env.EXPLORE_KG_BONUS_AT_MIN_LAND || 1.8) || 1.8);
const EXPLORE_KG_BONUS_AT_CAP_LAND = Math.max(0.1, Number(process.env.EXPLORE_KG_BONUS_AT_CAP_LAND || 0.35) || 0.35);
const SPY_RETURN_SECONDS = LOCAL_DEMO_FAST ? 15 : 25 * 60;
const DAILY_STREAK_CAP = 365;
const OBS_TICK_INTERVAL_SECONDS = Math.max(1, Number(process.env.TICK_INTERVAL_SECONDS || (LOCAL_DEMO_FAST ? 5 : 300)));

const registerBody = z.object({
  userId: z.string().min(1),
  username: z.string().min(1),
  kingdomName: z.string().min(2),
});

const authRegisterBody = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(32),
  password: z.string().min(8).max(128),
  kingdomName: z.string().min(2).max(40),
});

const authLoginBody = z.object({
  emailOrUsername: z.string().min(1),
  password: z.string().min(8).max(128),
});

const buildBody = z.object({
  buildingCode: z.string().min(1),
  quantity: z.number().int().min(1).max(50000).optional().default(1),
});

const demolishBuildingBody = z.object({
  buildingCode: z.string().min(1),
  quantity: z.number().int().min(1).max(50000).optional().default(1),
});

const trainBody = z.object({
  troopCode: z.string().min(1),
  quantity: z.number().int().min(1).max(50000),
});

const queueCancelBody = z.object({
  queueId: z.number().int().positive(),
});

const disbandBody = z.object({
  troopCode: z.string().min(1),
  quantity: z.number().int().min(1).max(50000),
});

const attackBody = z.object({
  defenderKingdom: z.string().min(2),
  sentTroops: z.record(z.string(), z.number().int().min(0)).refine((v) => Object.values(v).some((n) => n > 0), {
    message: "At least one troop amount must be > 0",
  }),
});

const exploreBody = z.object({
  sentTroops: z.record(z.string(), z.number().int().min(0)).refine((v) => Object.values(v).some((n) => n > 0), {
    message: "At least one troop amount must be > 0",
  }),
});

const spyBody = z.object({
  defenderKingdom: z.string().min(2),
  spiesToSend: z.number().int().min(1).max(50000),
});

const sendPigeonBody = z.object({
  toKingdom: z.string().min(2),
  subject: z.string().min(1).max(120),
  body: z.string().min(1).max(4000),
});

const demoResetBody = z.object({
  attackerName: z.string().min(2).optional().default("Elixer"),
  defenderName: z.string().min(2).optional().default("Galileo"),
  attackerUserId: z.string().min(1).optional().default("u1"),
  defenderUserId: z.string().min(1).optional().default("u2"),
  attackerUsername: z.string().min(1).optional().default("envy90"),
  defenderUsername: z.string().min(1).optional().default("zoo"),
});

const researchStartBody = z.object({
  researchCode: z.string().min(1),
});

const settlementUpgradeBody = z.object({
  settlementId: z.number().int().positive(),
  buildingId: z.number().int().positive(),
});

const settlementRenameBody = z.object({
  settlementId: z.number().int().positive(),
  name: z.string().min(2).max(64),
});

const settlementFoundBody = z.object({
  name: z.string().min(2).max(64),
});

const settlementBuildBody = z.object({
  settlementId: z.number().int().positive(),
  buildingCode: z.string().min(1),
});

const settlementDestroyBody = z.object({
  settlementId: z.number().int().positive(),
  buildingId: z.number().int().positive(),
});

const settlementUpgradeCostBody = z.object({
  settlementId: z.number().int().positive(),
  buildingCode: z.string().min(1),
});

const settlementHistoryBody = z.object({
  settlementId: z.number().int().positive(),
});

const settlementGarrisonBody = z.object({
  settlementId: z.number().int().positive(),
  troopCode: z.string().min(1),
  amount: z.number().int().positive(),
});

const taxUpdateBody = z.object({
  taxRate: z.number().int().min(0).max(40),
});

const allianceCreateBody = z.object({
  slug: z.string().min(2),
  name: z.string().min(2),
  description: z.string().optional().default(""),
  imageUrl: z.string().optional().default(""),
});

const allianceJoinBody = z.object({
  allianceId: z.number().int().positive().optional(),
  slug: z.string().min(2).optional(),
}).refine((d) => d.allianceId || d.slug, { message: "provide allianceId or slug" });

const allianceRelationBody = z.object({
  relationType: z.enum(["ally", "nap", "enemy", "cease_fire", "joint_ops"]),
  targetName: z.string().min(2),
  note: z.string().optional().default(""),
});

const allianceContribBody = z.object({
  buildingCode: z.string().min(1),
  gold: z.number().int().min(0).optional().default(0),
  stone: z.number().int().min(0).optional().default(0),
  wood: z.number().int().min(0).optional().default(0),
});

const allianceForumCreateThreadBody = z.object({
  title: z.string().min(3).max(120),
  body: z.string().min(1).max(8000),
  pinned: z.boolean().optional().default(false),
});

const allianceForumCreatePostBody = z.object({
  body: z.string().min(1).max(8000),
});

const allianceForumModerateThreadBody = z.object({
  pinned: z.boolean().optional(),
  locked: z.boolean().optional(),
  deleteThread: z.boolean().optional(),
}).refine((d) => d.pinned !== undefined || d.locked !== undefined || d.deleteThread === true, {
  message: "at least one moderation action is required",
});

const allianceForumModeratePostBody = z.object({
  deletePost: z.literal(true),
});

const embassySendMissionBody = z.object({
  targetKingdom: z.string().min(2),
  missionType: z.enum(["peace", "trade", "intel"]),
  note: z.string().max(600).optional().default(""),
});

const embassyRespondMissionBody = z.object({
  missionId: z.number().int().positive(),
  action: z.enum(["accepted", "declined"]),
});

const guildSabotageBody = z.object({
  defenderKingdom: z.string().min(2),
  spiesToSend: z.number().int().min(1).max(50000),
  resource: z.enum(["gold", "food", "wood", "stone"]).optional().default("gold"),
  operation: z.enum(["resource_heist", "priest_assassination"]).optional().default("resource_heist"),
});

const holyCircleCastBody = z.object({
  spellCode: z.enum(["mana_surge", "blessing_of_plenty", "stoneskin", "war_zeal", "divine_barrier", "blight", "mana_leech"]),
  targetKingdom: z.string().min(2).max(64).optional(),
});


const TROOP_TRAIN_REQUIREMENTS: Record<string, { buildingCode: string; buildingName: string; minLevel: number }> = {
  archers: { buildingCode: "archery_ranges", buildingName: "Archery Ranges", minLevel: 1 },
  crossbowmen: { buildingCode: "archery_ranges", buildingName: "Archery Ranges", minLevel: 1 },
  footmen: { buildingCode: "barracks", buildingName: "Barracks", minLevel: 1 },
  pikemen: { buildingCode: "barracks", buildingName: "Barracks", minLevel: 1 },
  light_cavalry: { buildingCode: "stables", buildingName: "Stables", minLevel: 1 },
  heavy_cavalry: { buildingCode: "stables", buildingName: "Stables", minLevel: 1 },
  knights: { buildingCode: "castles", buildingName: "Castles", minLevel: 1 },
  spies: { buildingCode: "guildhalls", buildingName: "Guildhall", minLevel: 1 },
  priests: { buildingCode: "temples", buildingName: "Temple", minLevel: 1 },
};
const TROOP_TRAIN_PEASANT_COST: Record<string, number> = {
  footmen: 1,
  pikemen: 1,
  archers: 1,
  crossbowmen: 1,
  light_cavalry: 1,
  heavy_cavalry: 1,
  knights: 1,
};

function trainPeasantCostPerUnit(troopCode: string) {
  return Math.max(0, Number(TROOP_TRAIN_PEASANT_COST[String(troopCode || "").toLowerCase()] || 0));
}

const SPY_CAPACITY_PER_GUILDHALL = 5;

// How many of each troop type can be housed per level of their housing building
const TROOP_HOUSING_CAPS: Record<string, { buildingCode: string; perLevel: number }> = {
  footmen:       { buildingCode: "barracks",       perLevel: 50 },
  pikemen:       { buildingCode: "barracks",       perLevel: 50 },
  archers:       { buildingCode: "archery_ranges", perLevel: 20 },
  crossbowmen:   { buildingCode: "archery_ranges", perLevel: 20 },
  light_cavalry: { buildingCode: "stables",        perLevel: 10 },
  heavy_cavalry: { buildingCode: "stables",        perLevel: 10 },
  knights:       { buildingCode: "castles",        perLevel: 20 },
  spies:         { buildingCode: "guildhalls",     perLevel: 5  },
  priests:       { buildingCode: "temples",        perLevel: 5  },
  diplomats:     { buildingCode: "embassies",      perLevel: 3  },
};

const FOOTMAN_ELITE_PROMOTION_RATE = clamp(Number(process.env.FOOTMAN_ELITE_PROMOTION_RATE || 0.0025), 0, 0.05);
const AUTH_SESSION_DAYS = 30;
const APP_BASE_URL = String(process.env.APP_BASE_URL || "http://localhost:5173").replace(/\/$/, "");

// ── Email transport (Brevo HTTP API — avoids SMTP port blocking on Railway) ───
const BREVO_API_KEY = process.env.BREVO_API_KEY || "";
const SMTP_FROM_RAW = process.env.SMTP_FROM || "Crownforge <noreply@crownforge.game>";
// Parse "Name <email>" or plain "email"
const EMAIL_FROM_MATCH = SMTP_FROM_RAW.match(/^(.+?)\s*<(.+?)>$/) ;
const EMAIL_FROM_NAME = EMAIL_FROM_MATCH ? EMAIL_FROM_MATCH[1].trim() : "Crownforge";
const EMAIL_FROM_ADDR = EMAIL_FROM_MATCH ? EMAIL_FROM_MATCH[2].trim() : SMTP_FROM_RAW.trim();

if (!BREVO_API_KEY && process.env.NODE_ENV === "production") {
  console.warn("[EMAIL] ⚠️  BREVO_API_KEY is not set — email delivery is DISABLED in production. Set BREVO_API_KEY in Railway environment variables.");
}

async function sendEmail(to: string, subject: string, html: string) {
  if (!BREVO_API_KEY) {
    console.log(`[EMAIL - no BREVO_API_KEY]\nTo: ${to}\nSubject: ${subject}\n${html.replace(/<[^>]+>/g, "")}`);
    return;
  }
  console.log(`[EMAIL] Sending "${subject}" to ${to} via Brevo HTTP API as ${EMAIL_FROM_ADDR}`);
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      sender: { name: EMAIL_FROM_NAME, email: EMAIL_FROM_ADDR },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });
  const data = await res.json() as any;
  if (!res.ok) throw new Error(`Brevo API error ${res.status}: ${JSON.stringify(data)}`);
  console.log(`[EMAIL] Sent OK — messageId: ${data.messageId}`);
}

function normalizeEmail(input: string) {
  return String(input || "").trim().toLowerCase();
}

function normalizeUsername(input: string) {
  return String(input || "").trim();
}

function generateReferralCode() {
  return `GG${randomBytes(4).toString("hex").toUpperCase()}`;
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string | null | undefined) {
  if (!stored || !stored.startsWith("scrypt:")) return false;
  const parts = stored.split(":");
  if (parts.length !== 3) return false;
  const salt = parts[1];
  const expectedHex = parts[2];
  const actualHex = scryptSync(password, salt, 64).toString("hex");
  const expected = Buffer.from(expectedHex, "hex");
  const actual = Buffer.from(actualHex, "hex");
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

async function createAuthSession(c: PoolClient, userId: string) {
  const token = randomBytes(32).toString("hex");
  const q = await c.query(
    `
    INSERT INTO auth_sessions(token, user_id, expires_at)
    VALUES ($1,$2, now() + ($3 || ' days')::interval)
    RETURNING token, user_id, created_at, expires_at
    `,
    [token, userId, AUTH_SESSION_DAYS],
  );
  return q.rows[0];
}

async function getAuthSession(token: string) {
  const q = await pool.query(
    `SELECT s.token, s.user_id, s.created_at, s.expires_at,
            u.username, u.email, u.email_verified, u.is_admin, u.is_banned,
            u.premium_started_at, u.premium_ends_at, u.premium_shield_last_used_at
     FROM auth_sessions s
     JOIN app_users u ON u.id = s.user_id
     WHERE s.token=$1 AND s.expires_at > now()
     LIMIT 1`,
    [token],
  );
  return q.rows[0] || null;
}

async function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const existing = (req as any).authSession;
  if (existing && !existing.is_banned) return next();
  const token = extractAuthToken(req);
  if (!token) return res.status(401).json({ ok: false, error: "missing auth token" });
  const session = await getAuthSession(token);
  if (!session) return res.status(401).json({ ok: false, error: "invalid or expired session" });
  if (session.is_banned) return res.status(403).json({ ok: false, error: "account is banned" });
  (req as any).authSession = session;
  return next();
}

async function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = extractAuthToken(req);
  if (!token) return res.status(401).json({ ok: false, error: "missing auth token" });
  const session = await getAuthSession(token);
  if (!session) return res.status(401).json({ ok: false, error: "invalid or expired session" });
  if (!session.is_admin) return res.status(403).json({ ok: false, error: "admin access required" });
  (req as any).adminSession = session;
  return next();
}

function extractAuthToken(req: express.Request) {
  const h = String(req.headers.authorization || "").trim();
  if (h.toLowerCase().startsWith("bearer ")) return h.slice(7).trim();
  const alt = String(req.headers["x-auth-token"] || "").trim();
  return alt || "";
}

async function logAdminActionTx(
  c: PoolClient,
  session: any,
  action: string,
  targetKind: string,
  targetId: string,
  payload: Record<string, unknown> = {},
) {
  await c.query(
    `
    INSERT INTO admin_audit_log(actor_user_id, actor_username, action, target_kind, target_id, payload)
    VALUES ($1,$2,$3,$4,$5,$6::jsonb)
    `,
    [
      String(session?.user_id || ""),
      String(session?.username || "admin"),
      String(action || "unknown"),
      String(targetKind || "system"),
      String(targetId || ""),
      JSON.stringify(payload || {}),
    ],
  );
}

function requireOwnedKingdomParam(paramName: string) {
  const writeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!writeMethods.has(String(req.method || "GET").toUpperCase())) return next();
    const kingdomName = String((req.params as any)?.[paramName] || "").trim();
    if (!kingdomName) return res.status(400).json({ ok: false, error: "kingdom name required" });
    try {
      const token = extractAuthToken(req);
      if (!token) return res.status(401).json({ ok: false, error: "missing auth token" });
      const session = await getAuthSession(token);
      if (!session) return res.status(401).json({ ok: false, error: "invalid or expired session" });
      if (session.is_banned) return res.status(403).json({ ok: false, error: "account is banned" });
      const own = await pool.query(
        `SELECT id FROM kingdoms WHERE LOWER(name)=LOWER($1) AND user_id=$2 LIMIT 1`,
        [kingdomName, session.user_id],
      );
      if (!own.rowCount) return res.status(403).json({ ok: false, error: "cannot modify another kingdom" });
      (req as any).authSession = session;
      return next();
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  };
}

async function getAllianceMembershipByKingdom(q: { query: PoolClient["query"] }, kingdom: string) {
  const membership = await q.query(
    `
    SELECT
      k.id AS kingdom_id,
      k.name AS kingdom_name,
      u.username,
      am.role,
      a.id AS alliance_id,
      a.slug AS alliance_slug,
      a.name AS alliance_name
    FROM kingdoms k
    JOIN app_users u ON u.id = k.user_id
    JOIN alliance_members am ON am.kingdom_id = k.id
    JOIN alliances a ON a.id = am.alliance_id
    WHERE LOWER(k.name)=LOWER($1)
    LIMIT 1
    `,
    [kingdom],
  );
  if (!membership.rowCount) throw new Error("kingdom is not in an alliance");
  const m = membership.rows[0];
  return {
    kingdomId: Number(m.kingdom_id),
    kingdomName: String(m.kingdom_name || ""),
    username: String(m.username || ""),
    role: String(m.role || "member"),
    allianceId: Number(m.alliance_id),
    allianceSlug: String(m.alliance_slug || ""),
    allianceName: String(m.alliance_name || ""),
  };
}

async function cleanupExpiredEffectsTx(c: PoolClient, kingdomId?: number) {
  if (kingdomId && Number.isFinite(kingdomId)) {
    await c.query(`DELETE FROM kingdom_status_effects WHERE kingdom_id=$1 AND ends_at <= now()`, [kingdomId]);
    return;
  }
  await c.query(`DELETE FROM kingdom_status_effects WHERE ends_at <= now()`);
}

async function activeEffectMagnitudeTx(c: PoolClient, kingdomId: number, effectCode: string) {
  const q = await c.query(
    `
    SELECT COALESCE(SUM(magnitude),0)::numeric AS mag
    FROM kingdom_status_effects
    WHERE kingdom_id=$1 AND effect_code=$2 AND ends_at > now()
    `,
    [kingdomId, effectCode],
  );
  return Number(q.rows[0]?.mag || 0);
}

async function addTimedEffectTx(
  c: PoolClient,
  input: {
    kingdomId: number;
    effectCode: string;
    magnitude: number;
    hours: number;
    sourceKind: string;
    sourceRef?: number | null;
    payload?: Record<string, unknown>;
  },
) {
  const expiresAt = new Date(Date.now() + Math.max(1, input.hours) * 3600 * 1000).toISOString();
  await c.query(
    `
    INSERT INTO kingdom_status_effects(kingdom_id, effect_code, source_kind, source_ref, magnitude, payload, ends_at)
    VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
    `,
    [
      input.kingdomId,
      input.effectCode,
      input.sourceKind,
      input.sourceRef ?? null,
      input.magnitude,
      JSON.stringify(input.payload || {}),
      expiresAt,
    ],
  );
  return { expiresAt };
}

function seasonByIndex(index: number) {
  return SEASONS[((index % SEASONS.length) + SEASONS.length) % SEASONS.length];
}

async function getSeasonSnapshot() {
  return withTx(async (c) => {
    await c.query(
      `
      INSERT INTO game_state(id, season_index, season_code, season_started_at, season_ends_at, updated_at)
      VALUES (1, 0, 'spring', now(), now() + ($1 * INTERVAL '1 second'), now())
      ON CONFLICT (id) DO NOTHING
      `,
      [SEASON_LENGTH_SECONDS],
    );
    const q = await c.query(`SELECT season_index, season_started_at, season_ends_at FROM game_state WHERE id=1 FOR UPDATE`);
    const row = q.rows[0];

    let index = Math.max(0, Number(row?.season_index || 0));
    let startsAt = new Date(row?.season_started_at || Date.now());
    let endsAt = new Date(row?.season_ends_at || Date.now() + SEASON_LENGTH_SECONDS * 1000);
    const now = new Date();
    let changed = false;

    while (endsAt.getTime() <= now.getTime()) {
      index += 1;
      startsAt = endsAt;
      endsAt = new Date(startsAt.getTime() + SEASON_LENGTH_SECONDS * 1000);
      changed = true;
    }

    if (changed) {
      const s = seasonByIndex(index);
      await c.query(
        `
        UPDATE game_state
        SET season_index=$2, season_code=$3, season_started_at=$4, season_ends_at=$5, updated_at=now()
        WHERE id=$1
        `,
        [1, index, s.code, startsAt.toISOString(), endsAt.toISOString()],
      );
    } else {
      await c.query(`UPDATE game_state SET updated_at=now() WHERE id=1`);
    }

    const season = seasonByIndex(index);
    const remainingSeconds = Math.max(0, Math.floor((endsAt.getTime() - now.getTime()) / 1000));
    return {
      index,
      code: season.code,
      name: season.name,
      flavor: season.flavor,
      modifiers: season.modifiers,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      remainingSeconds,
    };
  });
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function downsampleSeries<T>(items: T[], maxPoints: number) {
  if (items.length <= maxPoints) return items;
  if (maxPoints <= 1) return [items[items.length - 1]];
  const step = (items.length - 1) / (maxPoints - 1);
  const out: T[] = [];
  for (let i = 0; i < maxPoints; i += 1) {
    out.push(items[Math.round(i * step)]);
  }
  return out;
}

function shieldStateFromRow(row: any, now = new Date()) {
  const status = String(row?.shield_status || "none");
  const requestedAt = row?.shield_requested_at ? new Date(row.shield_requested_at) : null;
  const startsAt = row?.shield_starts_at ? new Date(row.shield_starts_at) : null;
  const endsAt = row?.shield_ends_at ? new Date(row.shield_ends_at) : null;
  const cooldownEndsAt = row?.shield_cooldown_ends_at ? new Date(row.shield_cooldown_ends_at) : null;

  let activeUntil: Date | null = null;
  if (status === "pending" && startsAt) activeUntil = startsAt;
  if (status === "active" && endsAt) activeUntil = endsAt;
  if (status === "cooldown" && cooldownEndsAt) activeUntil = cooldownEndsAt;

  const remainingSeconds = activeUntil ? Math.max(0, Math.floor((activeUntil.getTime() - now.getTime()) / 1000)) : 0;
  // pending  = no first strike, retaliation allowed, can be attacked, market open
  // active   = fully locked — no attacks, cannot be attacked, no market
  // cooldown = no first strike, retaliation allowed, can be attacked, market open
  const retaliationOnly = status === "pending" || status === "cooldown";
  const canAttack = status === "none";
  const canBeAttacked = status !== "active";
  return {
    status,
    requestedAt: requestedAt ? requestedAt.toISOString() : null,
    startsAt: startsAt ? startsAt.toISOString() : null,
    endsAt: endsAt ? endsAt.toISOString() : null,
    cooldownEndsAt: cooldownEndsAt ? cooldownEndsAt.toISOString() : null,
    remainingSeconds,
    canAttack,
    canBeAttacked,
    retaliationOnly,
  };
}

function isPremiumActive(row: any, now = new Date()) {
  const endsAt = row?.premium_ends_at ? new Date(row.premium_ends_at) : null;
  return Boolean(endsAt && endsAt.getTime() > now.getTime());
}

function premiumLoyaltyDays(row: any, now = new Date()) {
  if (!isPremiumActive(row, now)) return 0;
  const startedAt = row?.premium_started_at ? new Date(row.premium_started_at) : now;
  const days = Math.floor((now.getTime() - startedAt.getTime()) / 86_400_000) + 1;
  return Math.max(1, days);
}

function premiumGemMultiplier(row: any, now = new Date()) {
  if (!isPremiumActive(row, now)) return 1;
  const days = premiumLoyaltyDays(row, now);
  const loyaltySteps = Math.max(0, Math.floor(days / 30));
  return Number((1.25 + Math.min(0.75, loyaltySteps * 0.05)).toFixed(2));
}

const PREMIUM_PLANS = [
  { code: "1m", label: "1 Month", months: 1, days: 30, priceUsd: 5, savingsUsd: 0, savingsPercent: 0, benefit: "Daily Blue Gems" },
  { code: "3m", label: "3 Months", months: 3, days: 90, priceUsd: 14, savingsUsd: 1, savingsPercent: 7, benefit: "Daily Blue Gems" },
  { code: "6m", label: "6 Months", months: 6, days: 180, priceUsd: 25, savingsUsd: 5, savingsPercent: 16, benefit: "Daily Blue Gems" },
  { code: "12m", label: "12 Months", months: 12, days: 365, priceUsd: 45, savingsUsd: 15, savingsPercent: 25, benefit: "Daily Blue Gems" },
];

function premiumPlansPayload() {
  return PREMIUM_PLANS.map((p) => ({ ...p }));
}

function premiumStatusFromRow(row: any, now = new Date()) {
  const active = isPremiumActive(row, now);
  const startedAt = row?.premium_started_at ? new Date(row.premium_started_at) : null;
  const endsAt = row?.premium_ends_at ? new Date(row.premium_ends_at) : null;
  const lastShieldUse = row?.premium_shield_last_used_at ? new Date(row.premium_shield_last_used_at) : null;
  const nextShieldAt = lastShieldUse ? new Date(lastShieldUse.getTime() + 30 * 24 * 3600 * 1000) : null;
  const shieldReady = active && (!nextShieldAt || nextShieldAt.getTime() <= now.getTime());
  const shieldReadyInSeconds = !active
    ? 0
    : nextShieldAt
      ? Math.max(0, Math.floor((nextShieldAt.getTime() - now.getTime()) / 1000))
      : 0;
  return {
    active,
    startedAt: startedAt ? startedAt.toISOString() : null,
    endsAt: endsAt ? endsAt.toISOString() : null,
    loyaltyDays: premiumLoyaltyDays(row, now),
    gemMultiplier: premiumGemMultiplier(row, now),
    monthlyShieldReady: shieldReady,
    shieldReadyInSeconds,
    lastShieldUsedAt: lastShieldUse ? lastShieldUse.toISOString() : null,
    nextShieldAt: nextShieldAt ? nextShieldAt.toISOString() : null,
  };
}

function combatResultFromRatio(ratio: number): string {
  if (ratio < 0.25) return "FLEE";
  if (ratio < 0.75) return "MAJOR LOSS";
  if (ratio < 0.95) return "MINOR LOSS";
  if (ratio < 1.15) return "STALEMATE";
  if (ratio < 1.4) return "MINOR VICTORY";
  if (ratio < 2.5) return "VICTORY";
  if (ratio < 5.0) return "MAJOR VICTORY";
  return "OVERWHELMING VICTORY";
}

function landPctForResult(result: string): number {
  if (result === "STALEMATE") return 0.0075;
  if (result === "MINOR VICTORY") return 0.015;
  if (result === "VICTORY") return 0.025;
  if (result === "MAJOR VICTORY") return 0.0375;
  if (result === "OVERWHELMING VICTORY") return 0.05;
  return 0;
}

function attackerLossPct(result: string): number {
  if (result === "FLEE") return 0.55;
  if (result === "MAJOR LOSS") return 0.36;
  if (result === "MINOR LOSS") return 0.26;
  if (result === "STALEMATE") return 0.18;
  if (result === "MINOR VICTORY") return 0.12;
  if (result === "VICTORY") return 0.08;
  if (result === "MAJOR VICTORY") return 0.055;
  return 0.03;
}

function defenderLossPct(result: string): number {
  if (result === "FLEE") return 0.01;
  if (result === "MAJOR LOSS") return 0.05;
  if (result === "MINOR LOSS") return 0.1;
  if (result === "STALEMATE") return 0.14;
  if (result === "MINOR VICTORY") return 0.2;
  if (result === "VICTORY") return 0.28;
  if (result === "MAJOR VICTORY") return 0.36;
  return 0.45;
}

function applyLosses(units: Record<string, number>, pct: number, scope?: Record<string, number>) {
  const losses: Record<string, number> = {};
  const result: Record<string, number> = { ...units };
  const keys = Object.keys(scope || units);
  for (const k of keys) {
    const base = Number(scope ? scope[k] || 0 : units[k] || 0);
    const cur = Number(result[k] || 0);
    if (base <= 0 || cur <= 0) continue;
    const loss = clamp(Math.floor(base * pct), 0, cur);
    losses[k] = loss;
    result[k] = cur - loss;
  }
  return { losses, remaining: result };
}

function totalUnitCount(units: Record<string, number>) {
  return Object.values(units).reduce((acc, n) => acc + Number(n || 0), 0);
}

function forceSingleCasualty(
  losses: Record<string, number>,
  remaining: Record<string, number>,
  source: Record<string, number>,
) {
  const ordered = Object.entries(source)
    .map(([code, qty]) => [code, Number(qty || 0)] as const)
    .filter(([, qty]) => qty > 0)
    .sort((a, b) => b[1] - a[1]);
  for (const [code] of ordered) {
    const cur = Number(remaining[code] || 0);
    if (cur <= 0) continue;
    remaining[code] = cur - 1;
    losses[code] = Number(losses[code] || 0) + 1;
    return true;
  }
  return false;
}

const TROOP_CLASS: Record<string, "infantry" | "pikemen" | "archer" | "cavalry" | "support"> = {
  peasants: "support",
  footmen: "infantry",
  pikemen: "pikemen",
  elites: "infantry",
  archers: "archer",
  crossbowmen: "archer",
  light_cavalry: "cavalry",
  heavy_cavalry: "cavalry",
  knights: "cavalry",
  diplomats: "support",
  priests: "support",
  spies: "support",
};
const NON_DEFENSIVE_ATTACK_UNITS = new Set(["peasants", "diplomats", "priests", "spies"]);
const ILLEGAL_ATTACK_SEND_UNITS = new Set(["diplomats", "priests", "spies"]);

// Correct chain: Pikemen > Cavalry > Archers > Infantry
const RPS_MULTIPLIER: Record<string, number> = {
  "archer:infantry": 1.28,
  "cavalry:archer": 1.28,
  "pikemen:cavalry": 1.50,
  "infantry:archer": 0.82,
  "archer:cavalry": 0.82,
  "cavalry:pikemen": 0.70,
  "cavalry:infantry": 1.12,
  "infantry:cavalry": 0.90,
  "pikemen:infantry": 1.10,
  "infantry:pikemen": 0.92,
};

function classForTroop(code: string): "infantry" | "pikemen" | "archer" | "cavalry" | "support" {
  return TROOP_CLASS[String(code || "").toLowerCase()] || "support";
}

function isCombatTroop(code: string): boolean {
  return !NON_DEFENSIVE_ATTACK_UNITS.has(String(code || "").toLowerCase());
}

function matchupMultiplier(attackerCode: string, defenderCode: string): number {
  const atkClass = classForTroop(attackerCode);
  const defClass = classForTroop(defenderCode);
  return Number(RPS_MULTIPLIER[`${atkClass}:${defClass}`] || 1);
}

function normalizedShares(units: Record<string, number>) {
  const entries = Object.entries(units).filter(([, qty]) => Number(qty || 0) > 0);
  const total = entries.reduce((acc, [, qty]) => acc + Number(qty || 0), 0);
  if (total <= 0) return [] as Array<[string, number]>;
  return entries.map(([code, qty]) => [code, Number(qty || 0) / total] as [string, number]);
}

function effectivePowerVsComposition(
  ownTroops: Record<string, number>,
  ratings: Record<string, number>,
  enemyTroops: Record<string, number>,
) {
  const enemyShares = normalizedShares(enemyTroops);
  if (enemyShares.length === 0) {
    return Object.entries(ownTroops).reduce((acc, [code, qty]) => acc + Number(qty || 0) * Number(ratings[code] || 0), 0);
  }
  let total = 0;
  for (const [ownCode, ownQtyRaw] of Object.entries(ownTroops)) {
    const ownQty = Number(ownQtyRaw || 0);
    if (ownQty <= 0) continue;
    const ownRating = Number(ratings[ownCode] || 0);
    if (ownRating <= 0) continue;
    let weighted = 0;
    for (const [enemyCode, share] of enemyShares) {
      weighted += share * matchupMultiplier(ownCode, enemyCode);
    }
    total += ownQty * ownRating * weighted;
  }
  return total;
}

function formatSecondsAsClock(seconds: number): string {
  const s = Math.max(0, Math.floor(Number(seconds || 0)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

async function sendMailTx(
  c: PoolClient,
  kingdomId: number,
  mailKind: "system" | "attack" | "spy" | "player",
  subject: string,
  body: string,
) {
  await c.query(
    `INSERT INTO kingdom_mail(kingdom_id, mail_kind, subject, body) VALUES ($1,$2,$3,$4)`,
    [kingdomId, mailKind, subject, body],
  );
}

async function sendNoticeTx(
  c: PoolClient,
  kingdomId: number,
  noticeType: "info" | "success" | "warning" | "error",
  message: string,
  payload: Record<string, any> = {},
) {
  await c.query(
    `INSERT INTO kingdom_notifications(kingdom_id, notice_type, message, payload) VALUES ($1,$2,$3,$4::jsonb)`,
    [kingdomId, noticeType, message, JSON.stringify(payload || {})],
  );
}

function toLevelMap(rows: any[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[String(r.building_code)] = Number(r.level || 0);
  return out;
}

function computeEconomyHourly(
  land: number,
  buildingLevels: Record<string, number>,
  troopRows: any[],
  taxRate?: number,
  modifiers?: { food?: number; gold?: number; wood?: number; stone?: number; horse?: number },
  researchBonus?: { food?: number; gold?: number },
  settlementBonus?: { food?: number; gold?: number; wood?: number; stone?: number; foodCap?: number },
) {
  const farm = Number(buildingLevels.farm || 0);
  const lumber = Number(buildingLevels.lumberyard || 0);
  const quarry = Number(buildingLevels.quarry || 0);
  const horseFarms = Number(buildingLevels.horse_farms || 0);

  const foodIncomeRaw = farm * ECON_BUILDING_HOURLY.farmFood;
  const goldIncomeRaw = land * ECON_BUILDING_HOURLY.baseGoldPerLand;
  const woodIncomeRaw = lumber * ECON_BUILDING_HOURLY.lumberWood;
  const stoneIncomeRaw = quarry * ECON_BUILDING_HOURLY.quarryStone;
  const horseIncomeRaw = horseFarms * ECON_BUILDING_HOURLY.horseFarmHorses;

  const resFoodMult = 1 + Number(researchBonus?.food ?? 0);
  const resGoldMult = 1 + Number(researchBonus?.gold ?? 0);
  const foodIncome = foodIncomeRaw * Number(modifiers?.food ?? 1) * resFoodMult;
  const tax = clamp(Math.floor(Number(taxRate ?? 25)), 0, 40);
  const taxGoldMult = clamp(1 + (tax - 25) * 0.04, 0.2, 2.2);
  const goldIncome = goldIncomeRaw * Number(modifiers?.gold ?? 1) * taxGoldMult * resGoldMult;
  const woodIncome = woodIncomeRaw * Number(modifiers?.wood ?? 1);
  const stoneIncome = stoneIncomeRaw * Number(modifiers?.stone ?? 1);
  const horseIncome = horseIncomeRaw * Number(modifiers?.horse ?? 1);

  // Settlement building flat bonuses (granary, inn, carpenter, mason)
  const sFood  = Number(settlementBonus?.food  ?? 0);
  const sGold  = Number(settlementBonus?.gold  ?? 0);
  const sWood  = Number(settlementBonus?.wood  ?? 0);
  const sStone = Number(settlementBonus?.stone ?? 0);

  let foodUpkeep = 0;
  let goldUpkeep = 0;
  let priestCount = 0;
  let diplomatCount = 0;
  for (const row of troopRows) {
    const amount = Number(row.amount || 0);
    foodUpkeep += amount * Number(row.upkeep_food || 0);
    goldUpkeep += amount * Number(row.upkeep_gold || 0);
    if (String(row.troop_code) === "priests") priestCount += amount;
    if (String(row.troop_code) === "diplomats") diplomatCount += amount;
  }
  const priestFoodReduction = priestCount * 2;
  const effectiveFoodUpkeep = Math.max(0, foodUpkeep - priestFoodReduction);
  const diplomatGoldIncome = diplomatCount * 75;

  const baseCaps = computeStorageCaps(buildingLevels);
  const storageCaps = { ...baseCaps, food: baseCaps.food + Number(settlementBonus?.foodCap ?? 0) };

  return {
    perHour: {
      food: foodIncome + sFood - effectiveFoodUpkeep,
      gold: goldIncome + sGold - goldUpkeep + diplomatGoldIncome,
      wood: woodIncome + sWood,
      stone: stoneIncome + sStone,
      horses: horseIncome,
    },
    storageCaps,
    raw: {
      foodIncomeRaw,
      goldIncomeRaw,
      taxRate: tax,
      taxGoldMult,
      woodIncomeRaw,
      stoneIncomeRaw,
      horseIncomeRaw,
      foodIncome,
      foodUpkeep,
      priestFoodReduction,
      goldIncome,
      goldUpkeep,
      diplomatGoldIncome,
      woodIncome,
      stoneIncome,
      horseIncome,
      settlementFoodBonus: sFood,
      settlementGoldBonus: sGold,
      settlementWoodBonus: sWood,
      settlementStoneBonus: sStone,
    },
  };
}


async function ensureSettlementsForKingdom(c: PoolClient, kingdomId: number, kingdomName: string, land: number) {
  const current = await c.query(`SELECT id, name FROM settlements WHERE kingdom_id=$1 ORDER BY id ASC`, [kingdomId]);
  const plan = expectedSettlementPlan(land);
  const expectedTypes = plan.types;

  if (!expectedTypes.length) return;

  // Keep existing settlements aligned to currently unlocked size/types, but do not
  // auto-create every unlocked slot. Additional slots are filled via "found settlement".
  const keepCount = Math.min(current.rows.length, expectedTypes.length);
  for (let i = 0; i < keepCount; i += 1) {
    const t = expectedTypes[i];
    const def = SETTLEMENT_TYPE_DEF[t];
    const slots = i === 0 ? Math.floor(def.slots * 1.3) : def.slots;
    const cur = current.rows[i];
    await c.query(
      `UPDATE settlements SET settlement_type=$3, level=$4, slots_total=$5 WHERE id=$1 AND kingdom_id=$2`,
      [cur.id, kingdomId, t, def.level, slots],
    );
  }

  if (current.rows.length === 0) {
    const firstType = expectedTypes[0];
    const firstDef = SETTLEMENT_TYPE_DEF[firstType];
    const firstSlots = Math.floor(firstDef.slots * 1.3);
    const ins = await c.query(
      `INSERT INTO settlements(kingdom_id, name, settlement_type, level, slots_total, wellbeing, wall_level)
       VALUES ($1,$2,$3,$4,$5,0,0)
       RETURNING id`,
      [kingdomId, `${kingdomName} Capital`, firstType, firstDef.level, firstSlots],
    );
    const settlementId = Number(ins.rows[0].id);
    await c.query(
      `INSERT INTO settlement_history(settlement_id, item, datetime) VALUES ($1,$2,now())`,
      [settlementId, "Settlement founded"],
    );
  }
}

async function normalizeShieldStateTx(c: PoolClient, kingdomId: number) {
  const q = await c.query(
    `
    SELECT id, shield_status, shield_requested_at, shield_starts_at, shield_ends_at, shield_cooldown_ends_at
    FROM kingdoms
    WHERE id=$1
    FOR UPDATE
    `,
    [kingdomId],
  );
  if (!q.rowCount) return null;
  const row = q.rows[0];
  const now = new Date();
  let status = String(row.shield_status || "none");
  const startsAt = row.shield_starts_at ? new Date(row.shield_starts_at) : null;
  const endsAt = row.shield_ends_at ? new Date(row.shield_ends_at) : null;
  const cooldownEndsAt = row.shield_cooldown_ends_at ? new Date(row.shield_cooldown_ends_at) : null;
  let changed = false;

  if (status === "pending" && startsAt && startsAt.getTime() <= now.getTime()) {
    status = "active";
    changed = true;
  }
  if (status === "active" && endsAt && endsAt.getTime() <= now.getTime()) {
    status = "cooldown";
    changed = true;
  }
  if (status === "cooldown" && cooldownEndsAt && cooldownEndsAt.getTime() <= now.getTime()) {
    status = "none";
    changed = true;
  }

  if (changed) {
    await c.query(`UPDATE kingdoms SET shield_status=$2 WHERE id=$1`, [kingdomId, status]);
    row.shield_status = status;
  }

  return row;
}

function sanitizeAllianceSlug(input: string) {
  const normalized = String(input || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (normalized.length < 2 || normalized.length > 32) throw new Error("slug must be 2-32 chars (a-z, 0-9, -, _)");
  return normalized;
}

function allianceProjectTarget(base: number, level: number) {
  return Math.max(1, Math.floor(Number(base || 0) * Math.max(1, Number(level || 0) + 1)));
}

function allianceMemberCap(hallLevel: number) {
  return 15 + Math.max(0, Math.floor(Number(hallLevel || 0)));
}

async function seedKingdom(c: PoolClient, opts: {
  userId: string;
  username: string;
  email?: string | null;
  passwordHash?: string | null;
  kingdomName: string;
  gold: number;
  food: number;
  wood: number;
  stone: number;
  land: number;
  horses?: number;
  buildingLevels?: Record<string, number>;
  troopAmounts?: Record<string, number>;
  researchLevels?: Record<string, number>;
}) {
  await c.query(
    `INSERT INTO app_users(id, username, email, password_hash)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (id) DO UPDATE SET
       username=EXCLUDED.username,
       email=COALESCE(EXCLUDED.email, app_users.email),
       password_hash=COALESCE(EXCLUDED.password_hash, app_users.password_hash)`,
    [opts.userId, opts.username, opts.email || null, opts.passwordHash || null],
  );
  const k = await c.query(
    `INSERT INTO kingdoms(user_id, name, gold, food, wood, stone, land, horses)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id, name`,
    [opts.userId, opts.kingdomName, opts.gold, opts.food, opts.wood, opts.stone, opts.land, Math.max(0, Math.floor(Number(opts.horses || 0)))],
  );
  const kingdom = k.rows[0];
  await c.query(
    `INSERT INTO kingdom_buildings(kingdom_id, building_code, level)
     SELECT $1::bigint, code, 0 FROM building_types
     ON CONFLICT (kingdom_id, building_code) DO NOTHING`,
    [kingdom.id],
  );
  await c.query(
    `INSERT INTO kingdom_troops(kingdom_id, troop_code, amount)
     SELECT $1::bigint, code, 0 FROM troop_types
     ON CONFLICT (kingdom_id, troop_code) DO NOTHING`,
    [kingdom.id],
  );
  if (opts.buildingLevels && Object.keys(opts.buildingLevels).length > 0) {
    for (const [code, level] of Object.entries(opts.buildingLevels)) {
      await c.query(
        `UPDATE kingdom_buildings SET level=$3 WHERE kingdom_id=$1 AND building_code=$2`,
        [kingdom.id, code, Math.max(0, Math.floor(Number(level || 0)))],
      );
    }
  }
  if (opts.troopAmounts && Object.keys(opts.troopAmounts).length > 0) {
    for (const [code, amount] of Object.entries(opts.troopAmounts)) {
      await c.query(
        `UPDATE kingdom_troops SET amount=$3 WHERE kingdom_id=$1 AND troop_code=$2`,
        [kingdom.id, code, Math.max(0, Math.floor(Number(amount || 0)))],
      );
    }
  }
  if (opts.researchLevels && Object.keys(opts.researchLevels).length > 0) {
    for (const [code, level] of Object.entries(opts.researchLevels)) {
      await c.query(
        `
        INSERT INTO kingdom_research(kingdom_id, research_code, level)
        VALUES ($1,$2,$3)
        ON CONFLICT (kingdom_id, research_code) DO UPDATE
        SET level = EXCLUDED.level
        `,
        [kingdom.id, code, Math.max(0, Math.floor(Number(level || 0)))],
      );
    }
  }
  await ensureSettlementsForKingdom(c, Number(kingdom.id), opts.kingdomName, Number(opts.land));
  return kingdom;
}

// Ownership guard for authenticated kingdom write routes.
app.use("/api/kingdom/:name", requireOwnedKingdomParam("name"));
app.use("/api/war-room/:attacker/attack", requireOwnedKingdomParam("attacker"));
app.use("/api/war-room/:attacker/explore", requireOwnedKingdomParam("attacker"));
app.use("/api/war-room/:attacker/spy", requireOwnedKingdomParam("attacker"));
app.use("/api/research/:kingdom", requireOwnedKingdomParam("kingdom"));
app.use("/api/settlements/:kingdom", requireOwnedKingdomParam("kingdom"));
app.use("/api/alliance/:kingdom", requireOwnedKingdomParam("kingdom"));
app.use("/api/alliance-forums/:kingdom", requireOwnedKingdomParam("kingdom"));
app.use("/api/embassy/:kingdom", requireOwnedKingdomParam("kingdom"));
app.use("/api/guildhall/:kingdom", requireOwnedKingdomParam("kingdom"));
app.use("/api/pray/:kingdom", requireOwnedKingdomParam("kingdom"));
app.use("/api/market/:kingdom", requireOwnedKingdomParam("kingdom"));
app.use("/api/pigeons/:kingdom/send", requireOwnedKingdomParam("kingdom"));
app.use("/api/pigeons/:kingdom/delete-many", requireOwnedKingdomParam("kingdom"));
app.use("/api/pigeons/:kingdom/:mailId/read", requireOwnedKingdomParam("kingdom"));
app.use("/api/notifications/:kingdom/ack", requireOwnedKingdomParam("kingdom"));

app.get("/healthz", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, service: "api", db: "up", ts: new Date().toISOString() });
  } catch (e: any) {
    res.status(500).json({ ok: false, service: "api", db: "down", error: String(e?.message || e) });
  }
});

app.get("/readyz", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    const gs = await pool.query(`SELECT worker_last_tick_at FROM game_state WHERE id=1 LIMIT 1`);
    const lastTickAt = new Date(gs.rows[0]?.worker_last_tick_at || Date.now());
    const tickLagSeconds = Math.max(0, Math.floor((Date.now() - lastTickAt.getTime()) / 1000));
    const maxLag = Math.max(30, OBS_TICK_INTERVAL_SECONDS * 3);
    const ready = tickLagSeconds <= maxLag;
    return res.status(ready ? 200 : 503).json({
      ok: ready,
      service: "api",
      db: "up",
      workerLastTickAt: lastTickAt.toISOString(),
      workerLagSeconds: tickLagSeconds,
      maxLagSeconds: maxLag,
      ts: new Date().toISOString(),
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, service: "api", db: "down", error: String(e?.message || e) });
  }
});

app.post("/api/auth/register", async (req, res) => {
  const parsed = authRegisterBody.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });
  const email = normalizeEmail(parsed.data.email);
  const username = normalizeUsername(parsed.data.username);
  const password = String(parsed.data.password || "");
  const kingdomName = String(parsed.data.kingdomName || "").trim();
  if (!email || !username || !password || !kingdomName) {
    return res.status(400).json({ ok: false, error: "email, username, password, kingdomName required" });
  }

  try {
    const out = await withTx(async (c) => {
      const emailUsed = await c.query(`SELECT 1 FROM app_users WHERE LOWER(email)=LOWER($1) LIMIT 1`, [email]);
      if (emailUsed.rowCount) throw new Error("email already in use");
      const usernameUsed = await c.query(`SELECT 1 FROM app_users WHERE LOWER(username)=LOWER($1) LIMIT 1`, [username]);
      if (usernameUsed.rowCount) throw new Error("username already in use");
      const kingdomUsed = await c.query(`SELECT 1 FROM kingdoms WHERE LOWER(name)=LOWER($1) LIMIT 1`, [kingdomName]);
      if (kingdomUsed.rowCount) throw new Error("kingdom name already in use");

      const userId = `u_${randomBytes(12).toString("hex")}`;
      const regIp = String(req.ip || (req as any).socket?.remoteAddress || "").trim().slice(0, 100) || null;
      const kingdom = await seedKingdom(c, {
        userId,
        username,
        email,
        passwordHash: hashPassword(password),
        kingdomName,
        gold: 50_000,
        food: 50_000,
        wood: 5_000,
        stone: 5_000,
        land: 1_000,
        horses: 0,
        buildingLevels: {
          castles: 1,
          farm: 20,        // 20 farms × 120 food/hr = 2,400/hr, covers 1k peasant upkeep (2,000/hr) + surplus
          lumberyard: 5,   // basic wood production so new players can build
          quarry: 5,       // basic stone production so new players can build
          houses: 5,       // 5 houses × 10 peasants = 50 extra pop cap; shows housing system to new players
          barracks: 1,     // lets new players train footmen immediately
        },
        troopAmounts: { peasants: 1000 },
      });
      if (regIp) await c.query(`UPDATE app_users SET registration_ip=$2 WHERE id=$1`, [userId, regIp]);
      const session = await createAuthSession(c, userId);
      await c.query(`DELETE FROM email_verification_tokens WHERE user_id=$1 AND used_at IS NULL`, [userId]);
      const verifyToken = randomBytes(32).toString("hex");
      await c.query(`INSERT INTO email_verification_tokens(token, user_id) VALUES($1,$2)`, [verifyToken, userId]);
      return {
        session,
        user: {
          id: userId,
          username,
          email,
          emailVerified: false,
          isAdmin: false,
          premium: premiumStatusFromRow(null),
        },
        kingdom: { id: Number(kingdom.id), name: String(kingdom.name) },
        verifyToken,
      };
    });
    const verifyEmailHtml = `<p>Hi ${out.user.username},</p><p><a href="${APP_BASE_URL}/?verify=${out.verifyToken}">Verify Email</a></p><p>Expires in 24 hours.</p>`;
    void sendEmail(out.user.email, "Verify your Crownforge email", verifyEmailHtml).catch((e: any) => {
      console.error("Failed to send verification email on register", e);
    });
    const { verifyToken: _verifyToken, ...responseOut } = out;
    return res.json({ ok: true, ...responseOut });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const parsed = authLoginBody.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });
  const emailOrUsername = String(parsed.data.emailOrUsername || "").trim();
  const password = String(parsed.data.password || "");
  if (!emailOrUsername || !password) return res.status(400).json({ ok: false, error: "credentials required" });
  try {
    const out = await withTx(async (c) => {
      const u = await c.query(
        `SELECT id, username, email, password_hash, email_verified, is_admin, is_banned, banned_reason,
                premium_started_at, premium_ends_at, premium_shield_last_used_at
         FROM app_users
         WHERE LOWER(email)=LOWER($1) OR LOWER(username)=LOWER($1)
         LIMIT 1`,
        [emailOrUsername],
      );
      if (!u.rowCount) throw new Error("invalid credentials");
      const user = u.rows[0];
      if (!verifyPassword(password, user.password_hash)) throw new Error("invalid credentials");
      if (user.is_banned) throw new Error(`Account banned${user.banned_reason ? ": " + String(user.banned_reason) : ""}`);
      const k = await c.query(`SELECT id, name FROM kingdoms WHERE user_id=$1 LIMIT 1`, [user.id]);
      if (!k.rowCount) throw new Error("account has no kingdom");
      const session = await createAuthSession(c, String(user.id));
      return {
        session,
        user: {
          id: String(user.id),
          username: String(user.username),
          email: String(user.email || ""),
          emailVerified: Boolean(user.email_verified),
          isAdmin: Boolean(user.is_admin),
          premium: premiumStatusFromRow(user),
        },
        kingdom: { id: Number(k.rows[0].id), name: String(k.rows[0].name) },
      };
    });
    return res.json({ ok: true, ...out });
  } catch (e: any) {
    return res.status(401).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/api/auth/me", async (req, res) => {
  const token = extractAuthToken(req);
  if (!token) return res.status(401).json({ ok: false, error: "missing auth token" });
  try {
    const session = await getAuthSession(token);
    if (!session) return res.status(401).json({ ok: false, error: "invalid or expired session" });
    const kingdom = await pool.query(`SELECT id, name FROM kingdoms WHERE user_id=$1 LIMIT 1`, [session.user_id]);
    return res.json({
      ok: true,
      session: {
        token: String(session.token),
        userId: String(session.user_id),
        createdAt: session.created_at,
        expiresAt: session.expires_at,
      },
      user: {
        id: String(session.user_id),
        username: String(session.username),
        email: String(session.email || ""),
        emailVerified: Boolean(session.email_verified),
        isAdmin: Boolean(session.is_admin),
        premium: premiumStatusFromRow(session),
      },
      kingdom: kingdom.rowCount ? { id: Number(kingdom.rows[0].id), name: String(kingdom.rows[0].name) } : null,
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/api/premium/status", requireAuth, async (req, res) => {
  const session = (req as any).authSession;
  return res.json({
    ok: true,
    paymentEnabled: false,
    premium: premiumStatusFromRow(session),
    plans: premiumPlansPayload(),
  });
});

app.get("/api/premium/plans", async (_req, res) => {
  return res.json({
    ok: true,
    paymentEnabled: false,
    plans: premiumPlansPayload(),
  });
});

app.get("/api/stream/:kingdom", async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const clients = streamSetFor(kingdom);
  clients.add(res);
  res.write(`event: connected\ndata: ${JSON.stringify({ ok: true, kingdom, at: new Date().toISOString() })}\n\n`);

  const heartbeat = setInterval(() => {
    try {
      res.write(`event: heartbeat\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
    } catch {
      // ignore write race while closing
    }
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });
});

app.get("/api/account/referral", requireAuth, async (req, res) => {
  try {
    const session = (req as any).authSession;
    const userId = String(session?.user_id || "");
    if (!userId) return res.status(401).json({ ok: false, error: "missing user session" });

    const out = await withTx(async (c) => {
      const uq = await c.query(`SELECT id, referral_code FROM app_users WHERE id=$1 LIMIT 1 FOR UPDATE`, [userId]);
      if (!uq.rowCount) throw new Error("user not found");

      let referralCode = String(uq.rows[0]?.referral_code || "").trim().toUpperCase();
      if (!referralCode) {
        for (let attempt = 0; attempt < 8; attempt += 1) {
          const candidate = generateReferralCode();
          try {
            const up = await c.query(
              `UPDATE app_users SET referral_code=$2 WHERE id=$1 AND referral_code IS NULL RETURNING referral_code`,
              [userId, candidate],
            );
            if (up.rowCount) {
              referralCode = String(up.rows[0]?.referral_code || candidate).trim().toUpperCase();
              break;
            }
            const existing = await c.query(`SELECT referral_code FROM app_users WHERE id=$1 LIMIT 1`, [userId]);
            referralCode = String(existing.rows[0]?.referral_code || "").trim().toUpperCase();
            if (referralCode) break;
          } catch (e: any) {
            if (String(e?.code || "") !== "23505") throw e;
          }
        }
      }

      if (!referralCode) throw new Error("failed to generate referral code");

      const kq = await c.query(`SELECT name FROM kingdoms WHERE user_id=$1 LIMIT 1`, [userId]);
      const kingdomName = String(kq.rows[0]?.name || "");
      const referralUrl = `${APP_BASE_URL}/?ref=${encodeURIComponent(referralCode)}`;
      return { referralCode, referralUrl, kingdomName };
    });

    return res.json({ ok: true, ...out });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.delete("/api/account/delete", requireAuth, async (req, res) => {
  try {
    const session = (req as any).authSession;
    const userId = String(session?.user_id || "");
    if (!userId) return res.status(401).json({ ok: false, error: "missing user session" });
    const confirm = String(req.body?.confirm || "").trim();
    if (confirm !== "DELETE") return res.status(400).json({ ok: false, error: "send confirm: 'DELETE' to proceed" });
    // Cascade deletes kingdom, troops, buildings, sessions, etc.
    await pool.query(`DELETE FROM app_users WHERE id=$1`, [userId]);
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/auth/logout", async (req, res) => {
  const token = extractAuthToken(req);
  if (!token) return res.status(400).json({ ok: false, error: "missing auth token" });
  try {
    await pool.query(`DELETE FROM auth_sessions WHERE token=$1`, [token]);
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/auth/verify-email", async (req, res) => {
  const token = String(req.body?.token || "").trim();
  if (!token) return res.status(400).json({ ok: false, error: "token required" });
  try {
    const t = await pool.query(`SELECT user_id, expires_at, used_at FROM email_verification_tokens WHERE token=$1 LIMIT 1`, [token]);
    if (!t.rowCount) return res.status(400).json({ ok: false, error: "Invalid or expired verification link." });
    const row = t.rows[0];
    if (row.used_at) return res.status(400).json({ ok: false, error: "This link has already been used." });
    if (new Date(row.expires_at) < new Date()) return res.status(400).json({ ok: false, error: "Verification link expired." });
    await pool.query(`UPDATE app_users SET email_verified=TRUE WHERE id=$1`, [row.user_id]);
    await pool.query(`UPDATE email_verification_tokens SET used_at=now() WHERE token=$1`, [token]);
    return res.json({ ok: true, message: "Email verified successfully." });
  } catch (e: any) { return res.status(500).json({ ok: false, error: String(e?.message || e) }); }
});

app.post("/api/auth/resend-verification", async (req, res) => {
  const token = extractAuthToken(req);
  if (!token) return res.status(401).json({ ok: false, error: "not authenticated" });
  try {
    const session = await getAuthSession(token);
    if (!session) return res.status(401).json({ ok: false, error: "invalid session" });
    const u = await pool.query(`SELECT id, email, username, email_verified FROM app_users WHERE id=$1`, [session.user_id]);
    if (!u.rowCount) return res.status(404).json({ ok: false, error: "user not found" });
    const user = u.rows[0];
    if (user.email_verified) return res.status(400).json({ ok: false, error: "Email is already verified." });
    await pool.query(`DELETE FROM email_verification_tokens WHERE user_id=$1 AND used_at IS NULL`, [user.id]);
    const verifyToken = randomBytes(32).toString("hex");
    await pool.query(`INSERT INTO email_verification_tokens(token, user_id) VALUES($1,$2)`, [verifyToken, user.id]);
    void sendEmail(user.email, "Verify your Crownforge email", `<p>Hi ${String(user.username)},</p><p><a href="${APP_BASE_URL}/?verify=${verifyToken}">Verify Email</a></p><p>Expires in 24 hours.</p>`).catch((e: any) => { console.error("Failed to send resend-verification email", e); });
    return res.json({ ok: true, message: "Verification email sent." });
  } catch (e: any) { return res.status(500).json({ ok: false, error: String(e?.message || e) }); }
});

app.post("/api/auth/forgot-password", async (req, res) => {
  const email = String(req.body?.email || "").toLowerCase().trim();
  if (!email) return res.status(400).json({ ok: false, error: "email required" });
  try {
    const u = await pool.query(`SELECT id, username, email FROM app_users WHERE LOWER(email)=LOWER($1) LIMIT 1`, [email]);
    if (!u.rowCount) return res.json({ ok: true, message: "If that email exists, a reset link has been sent." });
    const user = u.rows[0];
    await pool.query(`DELETE FROM password_reset_tokens WHERE user_id=$1 AND used_at IS NULL`, [user.id]);
    const resetToken = randomBytes(32).toString("hex");
    await pool.query(`INSERT INTO password_reset_tokens(token, user_id) VALUES($1,$2)`, [resetToken, user.id]);
    void sendEmail(user.email, "Reset your Crownforge password", `<p>Hi ${String(user.username)},</p><p><a href="${APP_BASE_URL}/?reset=${resetToken}">Reset Password</a></p><p>Expires in 1 hour.</p><p style="color:#888;font-size:12px">If you didn't request this, ignore this email.</p>`).catch((e: any) => { console.error("Failed to send forgot-password email", e); });
    return res.json({ ok: true, message: "If that email exists, a reset link has been sent." });
  } catch (e: any) { return res.status(500).json({ ok: false, error: String(e?.message || e) }); }
});

app.post("/api/auth/reset-password", async (req, res) => {
  const token = String(req.body?.token || "").trim();
  const newPassword = String(req.body?.newPassword || "");
  if (!token) return res.status(400).json({ ok: false, error: "token required" });
  if (newPassword.length < 8) return res.status(400).json({ ok: false, error: "Password must be at least 8 characters." });
  try {
    const t = await pool.query(`SELECT user_id, expires_at, used_at FROM password_reset_tokens WHERE token=$1 LIMIT 1`, [token]);
    if (!t.rowCount) return res.status(400).json({ ok: false, error: "Invalid or expired reset link." });
    const row = t.rows[0];
    if (row.used_at) return res.status(400).json({ ok: false, error: "This reset link has already been used." });
    if (new Date(row.expires_at) < new Date()) return res.status(400).json({ ok: false, error: "Reset link expired." });
    await pool.query(`UPDATE app_users SET password_hash=$1 WHERE id=$2`, [hashPassword(newPassword), row.user_id]);
    await pool.query(`UPDATE password_reset_tokens SET used_at=now() WHERE token=$1`, [token]);
    await pool.query(`DELETE FROM auth_sessions WHERE user_id=$1`, [row.user_id]);
    return res.json({ ok: true, message: "Password reset successfully. Please log in." });
  } catch (e: any) { return res.status(500).json({ ok: false, error: String(e?.message || e) }); }
});

// ── Block all dev routes in production ────────────────────────────────────────
app.use("/api/dev", (req, res, next) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ ok: false, error: "Not found" });
  }
  return next();
});

app.post("/api/dev/demo-reset", async (req, res) => {
  const parsed = demoResetBody.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });
  const body = parsed.data;

  try {
    const out = await withTx(async (c) => {
      await c.query(`TRUNCATE troop_movements, attack_reports, alliance_buildings, alliance_relations, alliance_members, alliances, settlement_capture_log, settlement_build_queue, settlement_buildings, settlements, research_queue, kingdom_research, train_queue, build_queue, kingdom_troops, kingdom_buildings, kingdoms, app_users RESTART IDENTITY CASCADE`);

      const attacker = await seedKingdom(c, {
        userId: body.attackerUserId,
        username: body.attackerUsername,
        kingdomName: body.attackerName,
        gold: 15_000_000,
        food: 30_000_000,
        wood: 2_000_000,
        stone: 2_000_000,
        land: 80_000,
        buildingLevels: {
          farm: 2200,
          lumberyard: 1800,
          quarry: 1800,
          barracks: 300,
          stables: 1200,
          castles: 250,
        },
        troopAmounts: {
          footmen: 45_000,
          pikemen: 32_000,
          archers: 22_000,
          light_cavalry: 38_000,
          heavy_cavalry: 27_000,
        },
        researchLevels: {
          better_farming_methods: 7,
          crop_rotation: 5,
          animal_husbandry: 5,
          winter_crops: 4,
          engineering: 4,
          improved_metal_working: 3,
          improved_tools: 1,
          better_building_maintenance: 4,
          better_barns: 3,
          improved_market_wagons: 5,
          larger_archery_ranges: 6,
          larger_barracks: 6,
          spy_glass: 1,
          mathematics: 5,
          accounting: 4,
          monastery: 5,
          herbalism: 5,
          medicine: 2,
          better_training_methods: 5,
          tactics: 5,
          leadership_training: 4,
          phalanx: 7,
          sharpshooter: 3,
          loose_order_formation: 3,
        },
      });

      const defender = await seedKingdom(c, {
        userId: body.defenderUserId,
        username: body.defenderUsername,
        kingdomName: body.defenderName,
        gold: 800000,
        food: 900000,
        wood: 150000,
        stone: 150000,
        land: 25000,
        buildingLevels: {
          farm: 700,
          lumberyard: 550,
          quarry: 550,
          barracks: 120,
          stables: 350,
          castles: 80,
        },
        troopAmounts: {
          footmen: 11_000,
          pikemen: 8_000,
          archers: 6_500,
          light_cavalry: 9_000,
          heavy_cavalry: 7_000,
        },
      });

      const alliance = await c.query(
        `INSERT INTO alliances(slug, name, description, created_by_kingdom_id)
         VALUES ('kga', 'Kingdom Game Addicts', 'Demo alliance for testing.', $1)
         RETURNING id`,
        [attacker.id],
      );
      await c.query(
        `INSERT INTO alliance_members(alliance_id, kingdom_id, role)
         VALUES ($1,$2,'owner'), ($1,$3,'member')`,
        [alliance.rows[0].id, attacker.id, defender.id],
      );
      await c.query(
        `
        INSERT INTO alliance_buildings(alliance_id, building_code, level, progress_gold, progress_stone, progress_wood)
        SELECT $1::bigint, code, 0, 0, 0, 0 FROM alliance_building_types
        ON CONFLICT (alliance_id, building_code) DO NOTHING
        `,
        [alliance.rows[0].id],
      );

      return { attacker, defender, alliance: alliance.rows[0] };
    });

    return res.json({ ok: true, ...out });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/dev/register", async (req, res) => {
  const parsed = registerBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });
  }

  const body = parsed.data;

  try {
    const out = await withTx(async (c) => {
      await c.query(
        `INSERT INTO app_users(id, username) VALUES ($1,$2)
         ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username`,
        [body.userId, body.username],
      );

      const k = await c.query(
        `INSERT INTO kingdoms(user_id, name) VALUES ($1,$2)
         ON CONFLICT (name) DO UPDATE SET user_id = EXCLUDED.user_id
         RETURNING id, user_id, name, gold, wood, stone, food, land, created_at`,
        [body.userId, body.kingdomName],
      );
      const kingdom = k.rows[0];

      await c.query(
        `
        INSERT INTO kingdom_buildings(kingdom_id, building_code, level)
        SELECT $1::bigint, bt.code, 0
        FROM building_types bt
        ON CONFLICT (kingdom_id, building_code) DO NOTHING
        `,
        [kingdom.id],
      );

      await c.query(
        `
        INSERT INTO kingdom_troops(kingdom_id, troop_code, amount)
        SELECT $1::bigint, tt.code, 0
        FROM troop_types tt
        ON CONFLICT (kingdom_id, troop_code) DO NOTHING
        `,
        [kingdom.id],
      );

      return kingdom;
    });

    return res.json({ ok: true, kingdom: out });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Creates/resets the DEV admin account with a maxed-out kingdom
app.post("/api/dev/setup-dev-account", async (req, res) => {
  const DEV_PASSWORD = "devpassword123";
  try {
    const out = await withTx(async (c) => {
      const passwordHash = hashPassword(DEV_PASSWORD);

      // Find or create the DEV user — resolve by username to avoid UUID conflicts
      const existing = await c.query(`SELECT id FROM app_users WHERE LOWER(username)='dev' LIMIT 1`);
      let devUserId: string;
      if (existing.rowCount && existing.rowCount > 0) {
        devUserId = String(existing.rows[0].id);
        await c.query(
          `UPDATE app_users SET password_hash=$2, email_verified=true, is_admin=true WHERE id=$1`,
          [devUserId, passwordHash],
        );
      } else {
        devUserId = randomBytes(16).toString("hex");
        await c.query(
          `INSERT INTO app_users(id, username, email, password_hash, email_verified, is_admin)
           VALUES ($1,'DEV','dev@crownforge.local',$2,true,true)`,
          [devUserId, passwordHash],
        );
      }

      // Upsert kingdom by user_id
      const k = await c.query(
        `INSERT INTO kingdoms(user_id, name, gold, food, wood, stone, land, horses)
         VALUES ($1,'DEV Kingdom',999999999,999999999,999999999,999999999,500000,999999)
         ON CONFLICT (user_id) DO UPDATE SET
           gold=999999999, food=999999999, wood=999999999, stone=999999999,
           land=500000, horses=999999
         RETURNING id`,
        [devUserId],
      );
      const kingdomId = k.rows[0].id;
      await c.query(
        `INSERT INTO kingdom_buildings(kingdom_id, building_code, level)
         SELECT $1::bigint, code, 9999 FROM building_types
         ON CONFLICT (kingdom_id, building_code) DO UPDATE SET level=9999`,
        [kingdomId],
      );
      await c.query(
        `INSERT INTO kingdom_troops(kingdom_id, troop_code, amount)
         SELECT $1::bigint, code, 999999 FROM troop_types
         ON CONFLICT (kingdom_id, troop_code) DO UPDATE SET amount=999999`,
        [kingdomId],
      );
      const researchCodes = await c.query(`SELECT code FROM research_types`);
      for (const row of researchCodes.rows) {
        await c.query(
          `INSERT INTO kingdom_research(kingdom_id, research_code, level)
           VALUES ($1,$2,10)
           ON CONFLICT (kingdom_id, research_code) DO UPDATE SET level=10`,
          [kingdomId, row.code],
        );
      }
      const session = await createAuthSession(c, devUserId);
      return { session, kingdomId };
    });
    return res.json({ ok: true, username: "DEV", password: DEV_PASSWORD, token: out.session.token, kingdomId: out.kingdomId });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Boost any kingdom to dev-god status by kingdom name
app.post("/api/dev/boost-kingdom", async (req, res) => {
  const kingdomName = String(req.body?.kingdomName || "").trim();
  if (!kingdomName) return res.status(400).json({ ok: false, error: "kingdomName required" });
  try {
    await withTx(async (c) => {
      const kr = await c.query(`SELECT id FROM kingdoms WHERE LOWER(name)=LOWER($1) LIMIT 1`, [kingdomName]);
      if (!kr.rowCount) throw new Error(`Kingdom "${kingdomName}" not found`);
      const kid = kr.rows[0].id;

      // Max resources + land
      await c.query(
        `UPDATE kingdoms SET gold=999999999, food=999999999, wood=999999999, stone=999999999,
         land=400000, horses=500000, mana=999999 WHERE id=$1`,
        [kid],
      );

      // Max buildings — heavy on farms, lumberyards, quarries, castles, barracks, stables
      await c.query(
        `INSERT INTO kingdom_buildings(kingdom_id, building_code, level)
         SELECT $1::bigint, code, 0 FROM building_types
         ON CONFLICT (kingdom_id, building_code) DO NOTHING`,
        [kid],
      );
      const buildingBoosts: Record<string, number> = {
        farm: 8000, lumberyard: 6000, quarry: 6000, barns: 4000,
        barracks: 2000, stables: 2000, castles: 1500, archery_ranges: 1500,
        houses: 5000, horse_farms: 3000, markets: 1000, guildhalls: 500,
        temples: 500, embassies: 300,
      };
      for (const [code, level] of Object.entries(buildingBoosts)) {
        await c.query(
          `UPDATE kingdom_buildings SET level=$3 WHERE kingdom_id=$1 AND building_code=$2`,
          [kid, code, level],
        );
      }

      // Max troops
      await c.query(
        `INSERT INTO kingdom_troops(kingdom_id, troop_code, amount)
         SELECT $1::bigint, code, 0 FROM troop_types
         ON CONFLICT (kingdom_id, troop_code) DO NOTHING`,
        [kid],
      );
      const troopBoosts: Record<string, number> = {
        footmen: 500000, pikemen: 300000, archers: 200000,
        light_cavalry: 250000, heavy_cavalry: 150000, knights: 50000,
        elites: 25000, peasants: 1000000, spies: 10000, priests: 2000,
      };
      for (const [code, amount] of Object.entries(troopBoosts)) {
        await c.query(
          `UPDATE kingdom_troops SET amount=$3 WHERE kingdom_id=$1 AND troop_code=$2`,
          [kid, code, amount],
        );
      }

      // Max all research
      const rc = await c.query(`SELECT code FROM research_types`);
      for (const row of rc.rows) {
        await c.query(
          `INSERT INTO kingdom_research(kingdom_id, research_code, level)
           VALUES ($1,$2,10) ON CONFLICT (kingdom_id, research_code) DO UPDATE SET level=10`,
          [kid, row.code],
        );
      }

      // Create settlements matching 400k land plan
      const settlements = [
        { name: "Grand Capital", type: "large_city", level: 6, slots: 25, wall: 5 },
        { name: "Royal Harbor", type: "large_city", level: 6, slots: 25, wall: 5 },
        { name: "Iron Citadel", type: "large_city", level: 6, slots: 25, wall: 5 },
        { name: "Goldvein City", type: "medium_city", level: 5, slots: 17, wall: 4 },
        { name: "Stonekeep", type: "small_city", level: 4, slots: 12, wall: 3 },
        { name: "East March", type: "large_town", level: 3, slots: 8, wall: 2 },
        { name: "West Reach", type: "medium_town", level: 2, slots: 5, wall: 1 },
        { name: "Southgate", type: "small_town", level: 1, slots: 3, wall: 1 },
      ];
      for (const s of settlements) {
        await c.query(
          `INSERT INTO settlements(kingdom_id, name, settlement_type, level, slots_total, wellbeing, wall_level)
           VALUES ($1,$2,$3,$4,$5,100,$6)
           ON CONFLICT DO NOTHING`,
          [kid, s.name, s.type, s.level, s.slots, s.wall],
        );
      }
    });
    return res.json({ ok: true, message: `Kingdom "${kingdomName}" boosted to god-tier.` });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/dev/give-starter-troops", async (req, res) => {
  const kingdom = String(req.body?.kingdom || "").trim();
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });
  try {
    const k = await pool.query(`SELECT id, name FROM kingdoms WHERE LOWER(name)=LOWER($1) LIMIT 1`, [kingdom]);
    if (!k.rowCount) return res.status(404).json({ ok: false, error: "kingdom not found" });
    const kr = k.rows[0];
    await pool.query(
      `UPDATE kingdom_troops SET amount = GREATEST(amount, 1000) WHERE kingdom_id=$1 AND troop_code='peasants'`,
      [kr.id],
    );
    const cur = await pool.query(`SELECT amount FROM kingdom_troops WHERE kingdom_id=$1 AND troop_code='peasants' LIMIT 1`, [kr.id]);
    return res.json({ ok: true, message: `Kingdom "${kr.name}" now has ${Number(cur.rows[0]?.amount || 0).toLocaleString()} peasants.` });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Fix a kingdom's land if it went negative due to the free starter castle
app.post("/api/dev/fix-castle-land", async (req, res) => {
  const kingdom = String(req.body?.kingdom || "").trim();
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });
  try {
    const k = await pool.query(`SELECT id, name, land FROM kingdoms WHERE LOWER(name)=LOWER($1) LIMIT 1`, [kingdom]);
    if (!k.rowCount) return res.status(404).json({ ok: false, error: "kingdom not found" });
    const kr = k.rows[0];
    const usageQ = await pool.query(
      `SELECT COALESCE(SUM(kb.level * bt.land_cost), 0)::int AS used_land
       FROM kingdom_buildings kb JOIN building_types bt ON bt.code = kb.building_code
       WHERE kb.kingdom_id = $1`,
      [kr.id],
    );
    const usedLand = Number(usageQ.rows[0]?.used_land || 0);
    const currentLand = Number(kr.land || 0);
    if (usedLand > currentLand) {
      const needed = usedLand - currentLand + 50; // +50 buffer so they can build
      await pool.query(`UPDATE kingdoms SET land = land + $2 WHERE id=$1`, [kr.id, needed]);
    }
    const newLand = await pool.query(`SELECT land FROM kingdoms WHERE id=$1`, [kr.id]);
    return res.json({ ok: true, message: `${kr.name}: land fixed to ${Number(newLand.rows[0]?.land || 0).toLocaleString()} (was ${currentLand}, used ${usedLand})` });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/api/kingdom/:name", requireAuth, async (req, res) => {
  const name = String(req.params.name || "").trim();
  if (!name) return res.status(400).json({ ok: false, error: "kingdom name required" });

  try {
    // Only allow players to load their own kingdom data
    const session = (req as any).authSession;
    const ownKingdom = await pool.query(
      `SELECT 1 FROM kingdoms WHERE LOWER(name)=LOWER($1) AND user_id=$2 LIMIT 1`,
      [name, session.user_id],
    );
    if (!ownKingdom.rowCount) {
      return res.status(403).json({ ok: false, error: "You can only view your own kingdom data" });
    }

    const k = await pool.query(
      `SELECT id, user_id, name, gold, wood, stone, food, land, horses, mana, created_at, last_tick_at, tax_rate, shield_status, shield_requested_at, shield_starts_at, shield_ends_at, shield_cooldown_ends_at, daily_login_streak, daily_last_claimed_at
       FROM kingdoms WHERE LOWER(name)=LOWER($1) LIMIT 1`,
      [name],
    );
    if (!k.rowCount) return res.status(404).json({ ok: false, error: "kingdom not found" });

    const kingdom = k.rows[0];
    await withTx(async (c) => {
      await ensureSettlementsForKingdom(c, Number(kingdom.id), String(kingdom.name), Number(kingdom.land || 0));
      await normalizeShieldStateTx(c, Number(kingdom.id));
      return 0;
    });
    const kresync = await pool.query(
      `SELECT id, user_id, name, gold, wood, stone, food, land, horses, mana, created_at, last_tick_at, tax_rate, shield_status, shield_requested_at, shield_starts_at, shield_ends_at, shield_cooldown_ends_at, daily_login_streak, daily_last_claimed_at
       FROM kingdoms
       WHERE id=$1
       LIMIT 1`,
      [kingdom.id],
    );
    const kingdomSync = kresync.rows[0] || kingdom;

    const buildings = await pool.query(
      `
      SELECT kb.building_code, bt.name AS building_name, kb.level, bt.land_cost, bt.wood_cost, bt.stone_cost, bt.base_build_seconds
      FROM kingdom_buildings kb
      JOIN building_types bt ON bt.code = kb.building_code
      WHERE kb.kingdom_id = $1
      ORDER BY kb.building_code ASC
      `,
      [kingdom.id],
    );

    const troops = await pool.query(
      `
      SELECT kt.troop_code, tt.name AS troop_name, kt.amount, tt.gold_cost, tt.food_cost, tt.train_seconds,
             CASE WHEN tt.code IN ('footmen','pikemen','archers','crossbowmen','light_cavalry','heavy_cavalry','knights') THEN 1 ELSE 0 END AS peasant_cost,
             tt.horse_cost, tt.upkeep_food, tt.upkeep_gold, tt.att_rating, tt.def_rating, tt.nw_value, tt.housing, tt.notes, tt.is_trainable
      FROM kingdom_troops kt
      JOIN troop_types tt ON tt.code = kt.troop_code
      WHERE kt.kingdom_id = $1
      ORDER BY kt.troop_code ASC
      `,
      [kingdom.id],
    );

    const buildQueue = await pool.query(
      `
      SELECT id, building_code, quantity, target_level, started_at, completes_at, status
      FROM build_queue
      WHERE kingdom_id = $1
      ORDER BY started_at DESC
      LIMIT 20
      `,
      [kingdom.id],
    );

    const trainQueue = await pool.query(
      `
      SELECT id, troop_code, quantity, started_at, completes_at, status
      FROM train_queue
      WHERE kingdom_id = $1
      ORDER BY started_at DESC
      LIMIT 20
      `,
      [kingdom.id],
    );

    const season = await getSeasonSnapshot();
    const buildingLevels = toLevelMap(buildings.rows);
    const queuedTroops = await pool.query(
      `SELECT troop_code, COALESCE(SUM(quantity),0) AS qty
       FROM train_queue
       WHERE kingdom_id=$1 AND status='queued'
       GROUP BY troop_code`,
      [kingdom.id],
    );
    const awayTroops = await pool.query(
      `SELECT troop_code, COALESCE(SUM(quantity),0) AS qty
       FROM troop_movements
       WHERE owner_kingdom_id=$1 AND status='out' AND returns_at > now()
       GROUP BY troop_code`,
      [kingdom.id],
    );
    const queuedMap = new Map<string, number>();
    const awayMap = new Map<string, number>();
    for (const r of queuedTroops.rows) queuedMap.set(String(r.troop_code), Number(r.qty || 0));
    for (const r of awayTroops.rows) awayMap.set(String(r.troop_code), Number(r.qty || 0));
    const economyTroops = troops.rows.map((t) => {
      const code = String(t.troop_code || "");
      const home = Number(t.amount || 0);
      const train = Number(queuedMap.get(code) || 0);
      const away = Number(awayMap.get(code) || 0);
      return { ...t, amount: home + train + away };
    });
    const [econResearchQ, settlementBldgQ] = await Promise.all([
      pool.query(
        `SELECT research_code, level FROM kingdom_research WHERE kingdom_id=$1
         AND research_code IN ('better_farming_methods','crop_rotation','irrigation','manure','mathematics','accounting')`,
        [kingdom.id],
      ),
      pool.query(
        `SELECT sb.building_code, COALESCE(SUM(sb.level),0)::int AS total_level
         FROM settlement_buildings sb
         JOIN settlements s ON s.id = sb.settlement_id
         WHERE s.kingdom_id=$1 AND sb.level > 0
         GROUP BY sb.building_code`,
        [kingdom.id],
      ),
    ]);
    const econRes = Object.fromEntries(econResearchQ.rows.map((r: any) => [String(r.research_code), Number(r.level || 0)]));
    const econResBonus = {
      food: ((econRes.better_farming_methods || 0) + (econRes.crop_rotation || 0) + (econRes.irrigation || 0) + (econRes.manure || 0)) * 0.01,
      gold: ((econRes.mathematics || 0) + (econRes.accounting || 0)) * 0.01,
    };
    const sBldg = Object.fromEntries(settlementBldgQ.rows.map((r: any) => [String(r.building_code), Number(r.total_level || 0)]));
    const econSettlementBonus = {
      food:    (sBldg.granary   || 0) * 25,   // 25 food/hr per granary level
      gold:    (sBldg.inn       || 0) * 20,   // 20 gold/hr per inn level
      wood:    (sBldg.carpenter || 0) * 8,    //  8 wood/hr per carpenter level
      stone:   (sBldg.mason     || 0) * 8,    //  8 stone/hr per mason level
      foodCap: (sBldg.barn      || 0) * 500,  // 500 food cap per barn level
    };
    const economy = computeEconomyHourly(Number(kingdomSync.land || 0), buildingLevels, economyTroops, Number(kingdomSync.tax_rate || 25), season.modifiers, econResBonus, econSettlementBonus);

    return res.json({
      ok: true,
      kingdom: kingdomSync,
      buildings: buildings.rows,
      troops: troops.rows,
      buildQueue: buildQueue.rows,
      trainQueue: trainQueue.rows,
      economy,
      season,
      shield: shieldStateFromRow(kingdomSync),
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/kingdom/:name/build", requireAuth, async (req, res) => {
  const name = String(req.params.name || "").trim();
  const parsed = buildBody.safeParse(req.body);
  if (!name) return res.status(400).json({ ok: false, error: "kingdom name required" });
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });

  const buildingCode = parsed.data.buildingCode.toLowerCase();
  const qty = Math.max(1, Number(parsed.data.quantity || 1));

  try {
    const out = await withTx(async (c) => {
      const k = await c.query(`SELECT id, name, wood, stone, land FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`, [name]);
      if (!k.rowCount) throw new Error("kingdom not found");
      const kingdom = k.rows[0];

      const bt = await c.query(
        `SELECT code, name, land_cost, wood_cost, stone_cost, base_build_seconds FROM building_types WHERE code=$1 LIMIT 1`,
        [buildingCode],
      );
      if (!bt.rowCount) throw new Error("unknown building code");
      const def = bt.rows[0];

      const kb = await c.query(`SELECT level FROM kingdom_buildings WHERE kingdom_id=$1 AND building_code=$2 LIMIT 1`, [kingdom.id, buildingCode]);
      const currentLevel = Number(kb.rows[0]?.level || 0);

      const landUse = await c.query(
        `
        SELECT COALESCE(SUM(kb.level * bt.land_cost), 0) AS used_land
        FROM kingdom_buildings kb
        JOIN building_types bt ON bt.code = kb.building_code
        WHERE kb.kingdom_id = $1
        `,
        [kingdom.id],
      );
      const usedLand = Number(landUse.rows[0]?.used_land || 0);
      const queuedLandQ = await c.query(
        `
        SELECT COALESCE(SUM(bt.land_cost * COALESCE(bq.quantity, 1)), 0) AS queued_land
        FROM build_queue bq
        JOIN building_types bt ON bt.code = bq.building_code
        WHERE bq.kingdom_id = $1 AND bq.status='queued'
        `,
        [kingdom.id],
      );
      const queuedLand = Number(queuedLandQ.rows[0]?.queued_land || 0);
      const availableLand = Number(kingdom.land || 0) - usedLand - queuedLand;

      const q = await c.query(
        `SELECT COALESCE(MAX(target_level), $2::int) AS max_target
         FROM build_queue
         WHERE kingdom_id=$1 AND building_code=$3 AND status='queued'`,
        [kingdom.id, currentLevel, buildingCode],
      );
      const maxTarget = Number(q.rows[0]?.max_target || currentLevel);
      const targetLevel = maxTarget + qty;
      const woodCost = Math.floor(Number(def.wood_cost || 0) * qty);
      const stoneCost = Math.floor(Number(def.stone_cost || 0) * qty);
      const landCost = Math.floor(Number(def.land_cost || 0) * qty);
      if (availableLand < landCost) {
        throw new Error(`not enough land (need ${landCost}, available ${availableLand})`);
      }
      if (Number(kingdom.wood) < woodCost || Number(kingdom.stone) < stoneCost) {
        throw new Error(`not enough resources (need wood ${woodCost}, stone ${stoneCost})`);
      }

      await c.query(`UPDATE kingdoms SET wood = wood - $2, stone = stone - $3 WHERE id=$1`, [kingdom.id, woodCost, stoneCost]);

      const seconds = LOCAL_DEMO_FAST ? FAST_BUILD_SECONDS : Math.max(1, Number(def.base_build_seconds || 0));
      const existing = await c.query(
        `
        SELECT id, quantity, target_level, started_at, completes_at
        FROM build_queue
        WHERE kingdom_id=$1 AND building_code=$2 AND status='queued'
        ORDER BY id DESC
        LIMIT 1
        FOR UPDATE
        `,
        [kingdom.id, buildingCode],
      );
      if (existing.rowCount) {
        const row = existing.rows[0];
        const mergedQty = Number(row.quantity || 0) + qty;
        const mergedTarget = Math.max(targetLevel, Number(row.target_level || 0));
        const up = await c.query(
          `
          UPDATE build_queue
          SET quantity=$2,
              target_level=$3,
              completes_at=GREATEST(completes_at, now() + ($4 * INTERVAL '1 second'))
          WHERE id=$1
          RETURNING id, kingdom_id, building_code, quantity, target_level, started_at, completes_at, status
          `,
          [row.id, mergedQty, mergedTarget, seconds],
        );
        return { queue: up.rows[0], costs: { land: landCost, wood: woodCost, stone: stoneCost } };
      }

      const ins = await c.query(
        `INSERT INTO build_queue(kingdom_id, building_code, quantity, target_level, started_at, completes_at, status)
         VALUES ($1,$2,$3,$4, now(), now() + ($5 * INTERVAL '1 second'), 'queued')
         RETURNING id, kingdom_id, building_code, quantity, target_level, started_at, completes_at, status`,
        [kingdom.id, buildingCode, qty, targetLevel, seconds],
      );

      return { queue: ins.rows[0], costs: { land: landCost, wood: woodCost, stone: stoneCost } };
    });

    return res.json({ ok: true, ...out });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/kingdom/:name/build/cancel", requireAuth, async (req, res) => {
  const name = String(req.params.name || "").trim();
  const parsed = queueCancelBody.safeParse(req.body || {});
  if (!name) return res.status(400).json({ ok: false, error: "kingdom name required" });
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });

  try {
    const out = await withTx(async (c) => {
      const k = await c.query(`SELECT id FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`, [name]);
      if (!k.rowCount) throw new Error("kingdom not found");
      const kingdomId = Number(k.rows[0].id);
      const queueId = Number(parsed.data.queueId);

      const q = await c.query(
        `
        SELECT bq.id, bq.building_code, bq.quantity, bq.target_level, bt.name AS building_name, bt.wood_cost, bt.stone_cost
        FROM build_queue bq
        JOIN building_types bt ON bt.code = bq.building_code
        WHERE bq.id = $1 AND bq.kingdom_id = $2 AND bq.status = 'queued'
        FOR UPDATE
        `,
        [queueId, kingdomId],
      );
      if (!q.rowCount) throw new Error("build queue item not found or already processed");
      const row = q.rows[0];
      const qty = Math.max(1, Number(row.quantity || 1));
      const refundWood = Math.max(0, Math.floor(Number(row.wood_cost || 0) * qty));
      const refundStone = Math.max(0, Math.floor(Number(row.stone_cost || 0) * qty));

      await c.query(`UPDATE build_queue SET status='cancelled', completed_at=now() WHERE id=$1 AND status='queued'`, [queueId]);
      await c.query(`UPDATE kingdoms SET wood = wood + $2, stone = stone + $3 WHERE id=$1`, [kingdomId, refundWood, refundStone]);

      return {
        queueId,
        buildingCode: String(row.building_code || ""),
        buildingName: String(row.building_name || row.building_code || ""),
        quantity: qty,
        refunds: { wood: refundWood, stone: refundStone },
      };
    });

    return res.json({ ok: true, ...out });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/kingdom/:name/build/demolish", requireAuth, async (req, res) => {
  const name = String(req.params.name || "").trim();
  const parsed = demolishBuildingBody.safeParse(req.body || {});
  if (!name) return res.status(400).json({ ok: false, error: "kingdom name required" });
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });

  try {
    const out = await withTx(async (c) => {
      const k = await c.query(`SELECT id FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`, [name]);
      if (!k.rowCount) throw new Error("kingdom not found");
      const kingdomId = Number(k.rows[0].id);
      const buildingCode = String(parsed.data.buildingCode || "").toLowerCase().trim();
      const qty = Math.max(1, Math.floor(Number(parsed.data.quantity || 1)));

      const bt = await c.query(`SELECT code, name FROM building_types WHERE code=$1 LIMIT 1`, [buildingCode]);
      if (!bt.rowCount) throw new Error("unknown building code");

      const queued = await c.query(
        `SELECT 1 FROM build_queue WHERE kingdom_id=$1 AND building_code=$2 AND status='queued' LIMIT 1`,
        [kingdomId, buildingCode],
      );
      if (queued.rowCount) throw new Error("cancel queued upgrades for this building before demolishing");

      const kb = await c.query(
        `SELECT level FROM kingdom_buildings WHERE kingdom_id=$1 AND building_code=$2 LIMIT 1 FOR UPDATE`,
        [kingdomId, buildingCode],
      );
      const currentLevel = Number(kb.rows[0]?.level || 0);
      if (currentLevel <= 0) throw new Error("no built levels to demolish");
      if (qty > currentLevel) throw new Error(`cannot demolish ${qty} levels (built: ${currentLevel})`);

      const newLevel = Math.max(0, currentLevel - qty);
      await c.query(`UPDATE kingdom_buildings SET level=$3 WHERE kingdom_id=$1 AND building_code=$2`, [kingdomId, buildingCode, newLevel]);
      await sendNoticeTx(
        c,
        kingdomId,
        "info",
        `${String(bt.rows[0]?.name || buildingCode)} demolished by ${qty.toLocaleString()} level${qty !== 1 ? "s" : ""}.`,
        { buildingCode, demolished: qty, newLevel },
      );

      return {
        buildingCode,
        buildingName: String(bt.rows[0]?.name || buildingCode),
        demolished: qty,
        previousLevel: currentLevel,
        newLevel,
      };
    });
    return res.json({ ok: true, ...out });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/kingdom/:name/train", requireAuth, async (req, res) => {
  const name = String(req.params.name || "").trim();
  const parsed = trainBody.safeParse(req.body);
  if (!name) return res.status(400).json({ ok: false, error: "kingdom name required" });
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });

  const troopCode = parsed.data.troopCode.toLowerCase();
  const qty = parsed.data.quantity;

  try {
    const out = await withTx(async (c) => {
      const k = await c.query(`SELECT id, gold, food, horses FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`, [name]);
      if (!k.rowCount) throw new Error("kingdom not found");
      const kingdom = k.rows[0];

      const tt = await c.query(`SELECT code, name, gold_cost, food_cost, horse_cost, train_seconds, is_trainable FROM troop_types WHERE code=$1 LIMIT 1`, [troopCode]);
      if (!tt.rowCount) throw new Error("unknown troop code");
      const def = tt.rows[0];
      if (!Boolean(def.is_trainable)) throw new Error(`${troopCode} is not trainable`);
      const req = TROOP_TRAIN_REQUIREMENTS[troopCode];
      if (req) {
        const rq = await c.query(
          `SELECT COALESCE(level,0) AS lvl FROM kingdom_buildings WHERE kingdom_id=$1 AND building_code=$2 LIMIT 1`,
          [kingdom.id, req.buildingCode],
        );
        const lvl = Number(rq.rows[0]?.lvl || 0);
        if (lvl < req.minLevel) {
          throw new Error(`${def.name} requires ${req.buildingName} level ${req.minLevel} (current ${lvl})`);
        }
      }
      if (troopCode === "spies") {
        const guildhallsQ = await c.query(
          `SELECT COALESCE(level,0) AS lvl FROM kingdom_buildings WHERE kingdom_id=$1 AND building_code='guildhalls' LIMIT 1`,
          [kingdom.id],
        );
        const guildhalls = Number(guildhallsQ.rows[0]?.lvl || 0);
        const capacity = guildhalls * SPY_CAPACITY_PER_GUILDHALL;
        const [spiesHomeQ, spiesTrainQ, spiesAwayQ] = await Promise.all([
          c.query(
            `SELECT COALESCE(amount,0) AS qty
             FROM kingdom_troops
             WHERE kingdom_id=$1 AND troop_code='spies'
             LIMIT 1`,
            [kingdom.id],
          ),
          c.query(
            `SELECT COALESCE(SUM(quantity),0) AS qty
             FROM train_queue
             WHERE kingdom_id=$1 AND troop_code='spies' AND status='queued'`,
            [kingdom.id],
          ),
          c.query(
            `SELECT COALESCE(SUM(quantity),0) AS qty
             FROM troop_movements
             WHERE owner_kingdom_id=$1 AND troop_code='spies' AND status='out' AND returns_at > now()`,
            [kingdom.id],
          ),
        ]);
        const spiesUsed = Number(spiesHomeQ.rows[0]?.qty || 0) + Number(spiesTrainQ.rows[0]?.qty || 0) + Number(spiesAwayQ.rows[0]?.qty || 0);
        const spiesAvailable = Math.max(0, capacity - spiesUsed);
        if (qty > spiesAvailable) {
          throw new Error(`not enough guildhall spy capacity (available ${spiesAvailable}, requested ${qty})`);
        }
      }

      if (troopCode === "priests") {
        const [templesQ, priestsHomeQ, priestsTrainQ] = await Promise.all([
          c.query(`SELECT COALESCE(MAX(level),0) AS lvl FROM kingdom_buildings WHERE kingdom_id=$1 AND building_code='temples'`, [kingdom.id]),
          c.query(`SELECT COALESCE(amount,0) AS qty FROM kingdom_troops WHERE kingdom_id=$1 AND troop_code='priests'`, [kingdom.id]),
          c.query(`SELECT COALESCE(SUM(quantity),0) AS qty FROM train_queue WHERE kingdom_id=$1 AND troop_code='priests' AND status='queued'`, [kingdom.id]),
        ]);
        const priestCap = Number(templesQ.rows[0]?.lvl || 0) * PRIESTS_PER_TEMPLE;
        const priestsUsed = Number(priestsHomeQ.rows[0]?.qty || 0) + Number(priestsTrainQ.rows[0]?.qty || 0);
        const priestsAvailable = Math.max(0, priestCap - priestsUsed);
        if (qty > priestsAvailable) {
          throw new Error(`not enough temple capacity (cap ${priestCap}, used ${priestsUsed}, available ${priestsAvailable})`);
        }
      }

      if (troopCode === "diplomats") {
        const [embassyQ, diplomatsHomeQ, diplomatsTrainQ] = await Promise.all([
          c.query(`SELECT COALESCE(MAX(level),0) AS lvl FROM kingdom_buildings WHERE kingdom_id=$1 AND building_code='embassies'`, [kingdom.id]),
          c.query(`SELECT COALESCE(amount,0) AS qty FROM kingdom_troops WHERE kingdom_id=$1 AND troop_code='diplomats'`, [kingdom.id]),
          c.query(`SELECT COALESCE(SUM(quantity),0) AS qty FROM train_queue WHERE kingdom_id=$1 AND troop_code='diplomats' AND status='queued'`, [kingdom.id]),
        ]);
        const embassyLvl = Number(embassyQ.rows[0]?.lvl || 0);
        if (embassyLvl < 1) throw new Error("requires an Embassy to train Diplomats");
        const diplomatCap = embassyLvl * DIPLOMATS_PER_EMBASSY;
        const diplomatsUsed = Number(diplomatsHomeQ.rows[0]?.qty || 0) + Number(diplomatsTrainQ.rows[0]?.qty || 0);
        const diplomatsAvailable = Math.max(0, diplomatCap - diplomatsUsed);
        if (qty > diplomatsAvailable) {
          throw new Error(`not enough embassy capacity (cap ${diplomatCap}, used ${diplomatsUsed}, available ${diplomatsAvailable})`);
        }
      }

      const totalGold = Number(def.gold_cost) * qty;
      const totalFood = Number(def.food_cost) * qty;
      const totalHorses = Number(def.horse_cost || 0) * qty;
      const totalPeasants = trainPeasantCostPerUnit(troopCode) * qty;

      if (Number(kingdom.gold) < totalGold || Number(kingdom.food) < totalFood || Number(kingdom.horses || 0) < totalHorses) {
        throw new Error(`not enough resources (need gold ${totalGold}, food ${totalFood}, horses ${totalHorses})`);
      }
      if (totalPeasants > 0) {
        const pq = await c.query(
          `SELECT COALESCE(amount,0) AS qty
           FROM kingdom_troops
           WHERE kingdom_id=$1 AND troop_code='peasants'
           LIMIT 1
           FOR UPDATE`,
          [kingdom.id],
        );
        const havePeasants = Number(pq.rows[0]?.qty || 0);
        if (havePeasants < totalPeasants) {
          throw new Error(`not enough peasants (need ${totalPeasants}, have ${havePeasants})`);
        }
      }

      await c.query(`UPDATE kingdoms SET gold = gold - $2, food = food - $3, horses = horses - $4 WHERE id=$1`, [kingdom.id, totalGold, totalFood, totalHorses]);
      if (totalPeasants > 0) {
        await c.query(
          `UPDATE kingdom_troops
           SET amount = GREATEST(0, amount - $2)
           WHERE kingdom_id=$1 AND troop_code='peasants'`,
          [kingdom.id, totalPeasants],
        );
      }

      // Flat training time per request, regardless of quantity.
      // Use troop type's normal train_seconds so batches do not auto-complete unexpectedly fast.
      const totalSeconds = Math.max(1, Number(def.train_seconds));
      const existing = await c.query(
        `
        SELECT id, quantity, started_at, completes_at
        FROM train_queue
        WHERE kingdom_id=$1 AND troop_code=$2 AND status='queued'
        ORDER BY id DESC
        LIMIT 1
        FOR UPDATE
        `,
        [kingdom.id, troopCode],
      );
      if (existing.rowCount) {
        const row = existing.rows[0];
        const mergedQty = Number(row.quantity || 0) + qty;
        const up = await c.query(
          `
          UPDATE train_queue
          SET quantity=$2,
              completes_at=GREATEST(completes_at, now() + ($3 * INTERVAL '1 second'))
          WHERE id=$1
          RETURNING id, kingdom_id, troop_code, quantity, started_at, completes_at, status
          `,
          [row.id, mergedQty, totalSeconds],
        );
        return { queue: up.rows[0], costs: { gold: totalGold, food: totalFood, horses: totalHorses, peasants: totalPeasants } };
      }

      const ins = await c.query(
        `INSERT INTO train_queue(kingdom_id, troop_code, quantity, started_at, completes_at, status)
         VALUES ($1,$2,$3, now(), now() + ($4 * INTERVAL '1 second'), 'queued')
         RETURNING id, kingdom_id, troop_code, quantity, started_at, completes_at, status`,
        [kingdom.id, troopCode, qty, totalSeconds],
      );

      return { queue: ins.rows[0], costs: { gold: totalGold, food: totalFood, horses: totalHorses, peasants: totalPeasants } };
    });

    return res.json({ ok: true, ...out });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/kingdom/:name/train/cancel", requireAuth, async (req, res) => {
  const name = String(req.params.name || "").trim();
  const parsed = queueCancelBody.safeParse(req.body || {});
  if (!name) return res.status(400).json({ ok: false, error: "kingdom name required" });
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });

  try {
    const out = await withTx(async (c) => {
      const k = await c.query(`SELECT id FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`, [name]);
      if (!k.rowCount) throw new Error("kingdom not found");
      const kingdomId = Number(k.rows[0].id);
      const queueId = Number(parsed.data.queueId);

      const q = await c.query(
        `
        SELECT tq.id, tq.troop_code, tq.quantity, tt.name AS troop_name, tt.gold_cost, tt.food_cost, tt.horse_cost,
               CASE WHEN tt.code IN ('footmen','pikemen','archers','crossbowmen','light_cavalry','heavy_cavalry','knights') THEN 1 ELSE 0 END AS peasant_cost
        FROM train_queue tq
        JOIN troop_types tt ON tt.code = tq.troop_code
        WHERE tq.id = $1 AND tq.kingdom_id = $2 AND tq.status = 'queued'
        FOR UPDATE
        `,
        [queueId, kingdomId],
      );
      if (!q.rowCount) throw new Error("training queue item not found or already processed");
      const row = q.rows[0];
      const qty = Number(row.quantity || 0);
      const refundGold = Math.max(0, Math.floor(Number(row.gold_cost || 0) * qty));
      const refundFood = Math.max(0, Math.floor(Number(row.food_cost || 0) * qty));
      const refundHorses = Math.max(0, Math.floor(Number(row.horse_cost || 0) * qty));
      const refundPeasants = Math.max(0, Math.floor(Number(row.peasant_cost || 0) * qty));

      await c.query(`UPDATE train_queue SET status='cancelled', completed_at=now() WHERE id=$1 AND status='queued'`, [queueId]);
      await c.query(
        `UPDATE kingdoms SET gold = gold + $2, food = food + $3, horses = horses + $4 WHERE id=$1`,
        [kingdomId, refundGold, refundFood, refundHorses],
      );
      if (refundPeasants > 0) {
        await c.query(
          `INSERT INTO kingdom_troops(kingdom_id, troop_code, amount)
           VALUES ($1,'peasants',$2)
           ON CONFLICT (kingdom_id, troop_code)
           DO UPDATE SET amount = kingdom_troops.amount + EXCLUDED.amount`,
          [kingdomId, refundPeasants],
        );
      }

      return {
        queueId,
        troopCode: String(row.troop_code || ""),
        troopName: String(row.troop_name || row.troop_code || ""),
        quantity: qty,
        refunds: { gold: refundGold, food: refundFood, horses: refundHorses, peasants: refundPeasants },
      };
    });

    return res.json({ ok: true, ...out });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/kingdom/:name/disband", requireAuth, async (req, res) => {
  const name = String(req.params.name || "").trim();
  const parsed = disbandBody.safeParse(req.body);
  if (!name) return res.status(400).json({ ok: false, error: "kingdom name required" });
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });
  const troopCode = String(parsed.data.troopCode || "").toLowerCase().trim();
  const qty = Math.max(1, Math.floor(Number(parsed.data.quantity || 0)));

  try {
    const out = await withTx(async (c) => {
      const k = await c.query(`SELECT id FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`, [name]);
      if (!k.rowCount) throw new Error("kingdom not found");
      const kr = k.rows[0];

      const t = await c.query(
        `SELECT kt.amount, tt.horse_cost
         FROM kingdom_troops kt
         JOIN troop_types tt ON tt.code = kt.troop_code
         WHERE kt.kingdom_id=$1 AND kt.troop_code=$2
         LIMIT 1
         FOR UPDATE`,
        [kr.id, troopCode],
      );
      if (!t.rowCount) throw new Error("troop not found");
      const have = Number(t.rows[0].amount || 0);
      if (qty > have) throw new Error(`not enough troops to disband (have ${have}, requested ${qty})`);
      const horseRefund = Number(t.rows[0].horse_cost || 0) * qty;

      await c.query(`UPDATE kingdom_troops SET amount = amount - $3 WHERE kingdom_id=$1 AND troop_code=$2`, [kr.id, troopCode, qty]);
      if (horseRefund > 0) {
        await c.query(`UPDATE kingdoms SET horses = horses + $2 WHERE id=$1`, [kr.id, horseRefund]);
      }
      return { troopCode, quantity: qty, horsesRefunded: horseRefund };
    });
    return res.json({ ok: true, ...out });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/api/kingdom-search", async (req, res) => {
  const q = String(req.query.q || "").trim();
  const limit = clamp(Number(req.query.limit || 8), 1, 20);
  try {
    if (!q) {
      const rows = await pool.query(`SELECT name FROM kingdoms ORDER BY created_at DESC LIMIT $1`, [limit]);
      return res.json({ ok: true, items: rows.rows.map((r) => String(r.name)) });
    }
    const rows = await pool.query(
      `
      SELECT name
      FROM kingdoms
      WHERE LOWER(name) LIKE LOWER($1 || '%')
         OR LOWER(name) LIKE LOWER('%' || $1 || '%')
      ORDER BY CASE WHEN LOWER(name) LIKE LOWER($1 || '%') THEN 0 ELSE 1 END, name ASC
      LIMIT $2
      `,
      [q, limit],
    );
    return res.json({ ok: true, items: rows.rows.map((r) => String(r.name)) });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/kingdom/:name/tax", requireAuth, async (req, res) => {
  const name = String(req.params.name || "").trim();
  const parsed = taxUpdateBody.safeParse(req.body);
  if (!name) return res.status(400).json({ ok: false, error: "kingdom name required" });
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });

  try {
    const out = await withTx(async (c) => {
      const taxRate = clamp(Number(parsed.data.taxRate), 0, 40);
      const k = await c.query(
        `UPDATE kingdoms SET tax_rate=$2 WHERE LOWER(name)=LOWER($1) RETURNING id, name, tax_rate, shield_status, shield_requested_at, shield_starts_at, shield_ends_at, shield_cooldown_ends_at`,
        [name, taxRate],
      );
      if (!k.rowCount) throw new Error("kingdom not found");
      return k.rows[0];
    });
    return res.json({ ok: true, taxRate: Number(out.tax_rate || 25), shield: shieldStateFromRow(out) });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/kingdom/:name/shield/activate", requireAuth, async (req, res) => {
  const name = String(req.params.name || "").trim();
  if (!name) return res.status(400).json({ ok: false, error: "kingdom name required" });
  const session = (req as any).authSession;

  try {
    const out = await withTx(async (c) => {
      const kq = await c.query(
        `SELECT id, user_id, name, shield_status, shield_requested_at, shield_starts_at, shield_ends_at, shield_cooldown_ends_at FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`,
        [name],
      );
      if (!kq.rowCount) throw new Error("kingdom not found");
      const k = kq.rows[0];
      if (String(k.user_id) !== String(session.user_id)) throw new Error("cannot modify another kingdom");
      const normalized = await normalizeShieldStateTx(c, Number(k.id));
      const current = normalized || k;
      const status = String(current.shield_status || "none");
      if (status !== "none") throw new Error(`shield unavailable while status is ${status}`);

      const uq = await c.query(
        `SELECT id, premium_started_at, premium_ends_at, premium_shield_last_used_at
         FROM app_users
         WHERE id=$1
         LIMIT 1
         FOR UPDATE`,
        [session.user_id],
      );
      const user = uq.rows[0] || null;
      const premium = premiumStatusFromRow(user);
      const usePremiumShield = Boolean(premium.active && premium.monthlyShieldReady);

      const up = await c.query(
        `
        UPDATE kingdoms
        SET shield_status=$2,
            shield_requested_at=now(),
            shield_starts_at=CASE WHEN $3 THEN now() ELSE now() + interval '24 hours' END,
            shield_ends_at=now() + interval '48 hours',
            shield_cooldown_ends_at=now() + interval '72 hours'
        WHERE id=$1
        RETURNING id, name, shield_status, shield_requested_at, shield_starts_at, shield_ends_at, shield_cooldown_ends_at
        `,
        [k.id, usePremiumShield ? "active" : "pending", usePremiumShield],
      );
      if (usePremiumShield) {
        await c.query(`UPDATE app_users SET premium_shield_last_used_at=now() WHERE id=$1`, [session.user_id]);
      }
      return { ...up.rows[0], premiumShieldUsed: usePremiumShield };
    });
    return res.json({ ok: true, shield: shieldStateFromRow(out), premiumShieldUsed: Boolean(out.premiumShieldUsed) });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/kingdom/:name/shield/cancel", requireAuth, async (req, res) => {
  const name = String(req.params.name || "").trim();
  if (!name) return res.status(400).json({ ok: false, error: "kingdom name required" });
  const session = (req as any).authSession;

  try {
    const out = await withTx(async (c) => {
      const kq = await c.query(
        `SELECT id, user_id, name, shield_status, shield_requested_at, shield_starts_at, shield_ends_at, shield_cooldown_ends_at FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`,
        [name],
      );
      if (!kq.rowCount) throw new Error("kingdom not found");
      const k = kq.rows[0];
      if (String(k.user_id) !== String(session.user_id)) throw new Error("cannot modify another kingdom");
      const normalized = await normalizeShieldStateTx(c, Number(k.id));
      const current = normalized || k;
      const status = String(current.shield_status || "none");
      if (status !== "pending" && status !== "active") {
        throw new Error(`shield cannot be cancelled while status is ${status}`);
      }

      const up = await c.query(
        `
        UPDATE kingdoms
        SET shield_status='cooldown',
            shield_requested_at=COALESCE(shield_requested_at, now()),
            shield_starts_at=NULL,
            shield_ends_at=NULL,
            shield_cooldown_ends_at=now() + ($2 * INTERVAL '1 second')
        WHERE id=$1
        RETURNING id, name, shield_status, shield_requested_at, shield_starts_at, shield_ends_at, shield_cooldown_ends_at
        `,
        [k.id, SHIELD_CANCEL_COOLDOWN_SECONDS],
      );
      return up.rows[0];
    });
    return res.json({ ok: true, shield: shieldStateFromRow(out), cooldownSeconds: SHIELD_CANCEL_COOLDOWN_SECONDS });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/war-room/:attacker/attack", requireAuth, async (req, res) => {
  const attackerName = String(req.params.attacker || "").trim();
  const parsed = attackBody.safeParse(req.body);
  if (!attackerName) return res.status(400).json({ ok: false, error: "attacker kingdom required" });
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });

  const defenderName = parsed.data.defenderKingdom.trim();
  const sentTroopsRaw = Object.fromEntries(
    Object.entries(parsed.data.sentTroops).map(([k, v]) => [String(k).toLowerCase(), Number(v || 0)]),
  );

  try {
    const out = await withTx(async (c) => {
      const a = await c.query(
        `SELECT id, name, land, shield_status, shield_requested_at, shield_starts_at, shield_ends_at, shield_cooldown_ends_at FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`,
        [attackerName],
      );
      if (!a.rowCount) throw new Error("attacker kingdom not found");
      const d = await c.query(
        `SELECT id, name, land, shield_status, shield_requested_at, shield_starts_at, shield_ends_at, shield_cooldown_ends_at FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`,
        [defenderName],
      );
      if (!d.rowCount) throw new Error("defender kingdom not found");

      const atk = a.rows[0];
      const def = d.rows[0];
      if (Number(atk.id) === Number(def.id)) throw new Error("cannot attack self");

      // Block attacks on fellow alliance members
      const sameAllianceQ = await c.query(
        `SELECT 1 FROM alliance_members am1
         JOIN alliance_members am2 ON am2.alliance_id = am1.alliance_id
         WHERE am1.kingdom_id=$1 AND am2.kingdom_id=$2 LIMIT 1`,
        [atk.id, def.id],
      );
      if (sameAllianceQ.rowCount) throw new Error("cannot attack a member of your own alliance");

      // Anti-cheat: 24-hour cooldown per attacker-defender pair (1 hit then wait)
      const recentAttackCount = await c.query(
        `SELECT COUNT(*) AS cnt FROM attack_reports
         WHERE attacker_kingdom_id=$1 AND defender_kingdom_id=$2
           AND created_at > now() - interval '24 hours'`,
        [atk.id, def.id],
      );
      if (Number(recentAttackCount.rows[0]?.cnt || 0) >= 1) {
        throw new Error("You have already attacked this kingdom in the last 24 hours. You must wait before attacking them again.");
      }

      const atkShieldRow = await normalizeShieldStateTx(c, Number(atk.id));
      const defShieldRow = await normalizeShieldStateTx(c, Number(def.id));
      const atkShield = shieldStateFromRow(atkShieldRow || atk);
      const defShield = shieldStateFromRow(defShieldRow || def);

      if (!defShield.canBeAttacked) throw new Error("defender is shielded");
      if (!atkShield.canAttack) {
        if (!atkShield.retaliationOnly) throw new Error(`cannot attack while shield status is ${atkShield.status}`);
        const retaliationStart = atkShield.status === "pending"
          ? atkShield.requestedAt
          : atkShield.status === "cooldown"
            ? atkShield.endsAt
            : null;
        if (!retaliationStart) throw new Error("cannot attack right now");
        const retaliation = await c.query(
          `
          SELECT 1
          FROM attack_reports
          WHERE attacker_kingdom_id=$1
            AND defender_kingdom_id=$2
            AND created_at >= $3::timestamptz
          ORDER BY created_at DESC
          LIMIT 1
          `,
          [def.id, atk.id, retaliationStart],
        );
        if (!retaliation.rowCount) {
          throw new Error("attack locked: retaliation only during shield transition/cooldown");
        }
      }

      const atkRows = await c.query(
        `SELECT kt.troop_code, kt.amount, tt.att_rating, tt.def_rating
         FROM kingdom_troops kt
         JOIN troop_types tt ON tt.code = kt.troop_code
         WHERE kt.kingdom_id=$1`,
        [atk.id],
      );
      const defRows = await c.query(
        `SELECT kt.troop_code, kt.amount, tt.att_rating, tt.def_rating
         FROM kingdom_troops kt
         JOIN troop_types tt ON tt.code = kt.troop_code
         WHERE kt.kingdom_id=$1`,
        [def.id],
      );
      // Garrison troops from settlements also defend the kingdom
      const defGarrisonRows = await c.query(
        `SELECT sg.troop_code, SUM(sg.amount) AS amount, tt.att_rating, tt.def_rating
         FROM settlement_garrison sg
         JOIN settlements s ON s.id = sg.settlement_id
         JOIN troop_types tt ON tt.code = sg.troop_code
         WHERE s.kingdom_id=$1 AND sg.amount > 0
         GROUP BY sg.troop_code, tt.att_rating, tt.def_rating`,
        [def.id],
      );
      const defCastle = await c.query(
        `SELECT COALESCE(level,0) AS lvl FROM kingdom_buildings WHERE kingdom_id=$1 AND building_code='castles' LIMIT 1`,
        [def.id],
      );

      const attackerTroops: Record<string, number> = {};
      const defenderTroops: Record<string, number> = {};
      const troopAtt: Record<string, number> = {};
      const troopDef: Record<string, number> = {};
      for (const r of atkRows.rows) attackerTroops[String(r.troop_code)] = Number(r.amount || 0);
      for (const r of atkRows.rows) {
        troopAtt[String(r.troop_code)] = Number(r.att_rating || 0);
        troopDef[String(r.troop_code)] = Number(r.def_rating || 0);
      }
      for (const r of defRows.rows) defenderTroops[String(r.troop_code)] = Number(r.amount || 0);
      for (const r of defRows.rows) {
        troopAtt[String(r.troop_code)] = Number(r.att_rating || troopAtt[String(r.troop_code)] || 0);
        troopDef[String(r.troop_code)] = Number(r.def_rating || troopDef[String(r.troop_code)] || 0);
      }
      // Merge garrison troops into defender pool
      for (const r of defGarrisonRows.rows) {
        const code = String(r.troop_code);
        defenderTroops[code] = (defenderTroops[code] || 0) + Number(r.amount || 0);
        troopAtt[code] = troopAtt[code] || Number(r.att_rating || 0);
        troopDef[code] = troopDef[code] || Number(r.def_rating || 0);
      }

      for (const [code, sent] of Object.entries(sentTroopsRaw)) {
        if (sent <= 0) continue;
        const have = Number(attackerTroops[code] || 0);
        if (have < sent) throw new Error(`not enough ${code} (have ${have}, need ${sent})`);
      }

      // NW range check: prevent hitting kingdoms far below your own NW
      const [atkNwQ, defNwQ] = await Promise.all([
        c.query(`SELECT COALESCE(networth,0) AS nw FROM kingdom_networth_history WHERE kingdom_id=$1 ORDER BY recorded_at DESC LIMIT 1`, [atk.id]),
        c.query(`SELECT COALESCE(networth,0) AS nw FROM kingdom_networth_history WHERE kingdom_id=$1 ORDER BY recorded_at DESC LIMIT 1`, [def.id]),
      ]);
      const atkNw = Number(atkNwQ.rows[0]?.nw || 0);
      const defNw = Number(defNwQ.rows[0]?.nw || 0);
      const NW_RATIO_MIN = 0.25; // defender must be at least 25% of attacker NW
      if (atkNw > 1000 && defNw < atkNw * NW_RATIO_MIN) {
        throw new Error(
          `Cannot attack ${String(def.name)}: their networth (${Math.round(defNw).toLocaleString()}) is too low compared to yours (${Math.round(atkNw).toLocaleString()}). Minimum target NW: ${Math.round(atkNw * NW_RATIO_MIN).toLocaleString()}.`,
        );
      }

      const sentOnly = Object.fromEntries(Object.entries(sentTroopsRaw).filter(([, v]) => v > 0));
      const illegalSupportSends = Object.keys(sentOnly).filter((code) => ILLEGAL_ATTACK_SEND_UNITS.has(String(code || "").toLowerCase()));
      if (illegalSupportSends.length > 0) {
        throw new Error(`cannot send support units on attack (${illegalSupportSends.join(", ")})`);
      }
      const defenderCombatTroops = Object.fromEntries(
        Object.entries(defenderTroops).filter(([code, qty]) => isCombatTroop(code) && Number(qty || 0) > 0),
      );
      const totalSentCombatUnits = Object.entries(sentOnly).reduce(
        (acc, [code, qty]) => acc + (isCombatTroop(code) ? Number(qty || 0) : 0),
        0,
      );
      const totalDefCombatUnits = totalUnitCount(defenderCombatTroops);
      const rawSendPower = Object.entries(sentOnly).reduce(
        (acc, [code, qty]) => acc + Number(qty || 0) * Math.max(0, Number(troopAtt[code] || 0)),
        0,
      );
      const spoilsScale = rawSendPower < ATTACK_MIN_EFFECTIVE_POWER_FOR_SPOILS
        ? 0
        : clamp(
          (rawSendPower - ATTACK_MIN_EFFECTIVE_POWER_FOR_SPOILS)
            / (ATTACK_FULL_EFFECTIVE_POWER_FOR_SPOILS - ATTACK_MIN_EFFECTIVE_POWER_FOR_SPOILS),
          0,
          1,
        );
      const isPeasantOnlyAttack = Object.keys(sentOnly).length > 0
        && Object.entries(sentOnly).every(([code, sent]) => code === "peasants" && Number(sent) > 0);
      // Check attacker's active army_blessing effect
      const blessingQ = await c.query(
        `SELECT magnitude FROM kingdom_status_effects WHERE kingdom_id=$1 AND effect_code='army_blessing' AND ends_at > now() LIMIT 1`,
        [atk.id],
      );
      const armyBlessingBonus = blessingQ.rowCount ? Number(blessingQ.rows[0]?.magnitude || 0) : 0;

      // Research bonuses: attacker offense + casualty reduction; defender defense
      const [atkResQ, defResQ, casualtyResQ] = await Promise.all([
        c.query(
          `SELECT research_code, level FROM kingdom_research WHERE kingdom_id=$1
           AND research_code IN ('tactics','better_training_methods','horse_breeding','war_horse')`,
          [atk.id],
        ),
        c.query(
          `SELECT research_code, level FROM kingdom_research WHERE kingdom_id=$1
           AND research_code IN ('leadership_training','better_training_methods','city_walls','palisades','loose_order_formation','improved_defences','improved_castles_motte_bailey')`,
          [def.id],
        ),
        c.query(
          `SELECT research_code, level FROM kingdom_research WHERE kingdom_id=$1
           AND research_code IN ('herbalism','medicine','good_medical_practice','hospitals')`,
          [atk.id],
        ),
      ]);
      const atkRes = Object.fromEntries(atkResQ.rows.map((r: any) => [String(r.research_code), Number(r.level || 0)]));
      const defRes = Object.fromEntries(defResQ.rows.map((r: any) => [String(r.research_code), Number(r.level || 0)]));
      const casRes = Object.fromEntries(casualtyResQ.rows.map((r: any) => [String(r.research_code), Number(r.level || 0)]));
      // Each warfare tech level = +1% attack or +0.5% for secondary techs
      const atkResBonus =
        (atkRes.tactics || 0) * 0.01 +
        (atkRes.better_training_methods || 0) * 0.005 +
        (atkRes.horse_breeding || 0) * 0.005 +
        (atkRes.war_horse || 0) * 0.005;
      const defResBonus =
        (defRes.leadership_training || 0) * 0.01 +
        (defRes.better_training_methods || 0) * 0.005 +
        (defRes.city_walls || 0) * 0.005 +
        (defRes.palisades || 0) * 0.005 +
        (defRes.loose_order_formation || 0) * 0.005 +
        (defRes.improved_defences || 0) * 0.005 +
        (defRes.improved_castles_motte_bailey || 0) * 0.005;
      // Medical research reduces attacker casualties (each level = -0.5%)
      const casualtyReduction = Math.min(0.40,
        ((casRes.herbalism || 0) + (casRes.medicine || 0) + (casRes.good_medical_practice || 0) + (casRes.hospitals || 0)) * 0.005,
      );

      let attackerPower = effectivePowerVsComposition(sentOnly, troopAtt, defenderCombatTroops) * (1 + armyBlessingBonus) * (1 + atkResBonus);
      const defenderPowerRaw = effectivePowerVsComposition(defenderCombatTroops, troopDef, sentOnly);
      const castles = Number(defCastle.rows[0]?.lvl || 0);
      const castleBonus = castles > 0 ? Math.sqrt(castles) / 100 : 0;
      const defenderPower = defenderPowerRaw * (1 + castleBonus) * (1 + defResBonus);

      let ratio = attackerPower <= 0 ? 0 : attackerPower / Math.max(1, defenderPower);
      let result = combatResultFromRatio(ratio);

      let aLossPct = attackerLossPct(result) * (1 - casualtyReduction);
      let dLossPct = defenderLossPct(result);
      if (isPeasantOnlyAttack) {
        // Hard punish peasant-only attacks: no defender damage, attackers are wiped out.
        attackerPower = 0;
        ratio = 0;
        result = "FLEE";
        aLossPct = 1;
        dLossPct = 0;
      }

      const attackerAfterSend: Record<string, number> = { ...attackerTroops };
      for (const [code, sent] of Object.entries(sentOnly)) {
        attackerAfterSend[code] = Number(attackerAfterSend[code] || 0) - Number(sent);
      }
      const attackerBattle = applyLosses(sentOnly, aLossPct, sentOnly);
      const defenderBattle = applyLosses(defenderCombatTroops, dLossPct);

      // If both sides committed combat units, ensure at least one total casualty.
      // Tiny skirmishes can still have zero losses when one side had no combat force.
      if (totalSentCombatUnits > 0 && totalDefCombatUnits > 0) {
        const aLosses = totalUnitCount(attackerBattle.losses);
        const dLosses = totalUnitCount(defenderBattle.losses);
        if (aLosses + dLosses <= 0) {
          const attackerWon = ["MINOR VICTORY", "VICTORY", "MAJOR VICTORY", "OVERWHELMING VICTORY"].includes(result);
          const defenderWon = ["FLEE", "MAJOR LOSS", "MINOR LOSS"].includes(result);
          if (attackerWon) {
            if (!forceSingleCasualty(defenderBattle.losses, defenderBattle.remaining, defenderCombatTroops)) {
              void forceSingleCasualty(attackerBattle.losses, attackerBattle.remaining, sentOnly);
            }
          } else if (defenderWon) {
            if (!forceSingleCasualty(attackerBattle.losses, attackerBattle.remaining, sentOnly)) {
              void forceSingleCasualty(defenderBattle.losses, defenderBattle.remaining, defenderCombatTroops);
            }
          } else {
            if (!forceSingleCasualty(attackerBattle.losses, attackerBattle.remaining, sentOnly)) {
              void forceSingleCasualty(defenderBattle.losses, defenderBattle.remaining, defenderCombatTroops);
            }
          }
        }
      }

      const attackerLossesSentOnly = Object.fromEntries(
        Object.entries(attackerBattle.losses).filter(([code, n]) => Number(sentOnly[code] || 0) > 0 && Number(n || 0) > 0),
      );
      const attackerSurvivors: Record<string, number> = {};
      for (const [code, sent] of Object.entries(sentOnly)) {
        const survivors = Math.max(0, Number(sent) - Number(attackerBattle.losses[code] || 0));
        attackerSurvivors[code] = survivors;
      }
      let elitesPromoted = 0;
      const footmenSurvivors = Number(attackerSurvivors.footmen || 0);
      if (footmenSurvivors > 0) {
        elitesPromoted = Math.floor(footmenSurvivors * FOOTMAN_ELITE_PROMOTION_RATE);
        if (elitesPromoted <= 0) {
          const oneEliteRoll = Math.random() < footmenSurvivors * FOOTMAN_ELITE_PROMOTION_RATE;
          if (oneEliteRoll) elitesPromoted = 1;
        }
        elitesPromoted = clamp(elitesPromoted, 0, footmenSurvivors);
        if (elitesPromoted > 0) {
          attackerSurvivors.footmen = footmenSurvivors - elitesPromoted;
          attackerSurvivors.elites = Number(attackerSurvivors.elites || 0) + elitesPromoted;
        }
      }

      const landPct = landPctForResult(result);
      const defenderLand = Number(def.land || 0);
      // Land is based purely on battle result — spoilsScale only gates loot/gems.
      const landTaken = Math.max(0, Math.floor(defenderLand * landPct));
      const attackerLandNew = Number(atk.land || 0) + landTaken;
      const defenderLandNew = Math.max(0, defenderLand - landTaken);

      for (const [code, amount] of Object.entries(attackerAfterSend)) {
        await c.query(`UPDATE kingdom_troops SET amount=$3 WHERE kingdom_id=$1 AND troop_code=$2`, [atk.id, code, Math.max(0, Math.floor(amount))]);
      }
      for (const [code, amount] of Object.entries(defenderBattle.remaining)) {
        await c.query(`UPDATE kingdom_troops SET amount=$3 WHERE kingdom_id=$1 AND troop_code=$2`, [def.id, code, Math.max(0, Math.floor(amount))]);
      }

      await c.query(`UPDATE kingdoms SET land=$2 WHERE id=$1`, [atk.id, attackerLandNew]);
      await c.query(`UPDATE kingdoms SET land=$2 WHERE id=$1`, [def.id, defenderLandNew]);

      // If defender lost land, check if their buildings now exceed available land.
      // Randomly demolish non-castle buildings until land usage fits.
      if (landTaken > 0) {
        const usageQ = await c.query(
          `SELECT COALESCE(SUM(kb.level * bt.land_cost), 0)::int AS used_land
           FROM kingdom_buildings kb
           JOIN building_types bt ON bt.code = kb.building_code
           WHERE kb.kingdom_id = $1`,
          [def.id],
        );
        const usedLand = Number(usageQ.rows[0]?.used_land || 0);
        if (usedLand > defenderLandNew) {
          let overflow = usedLand - defenderLandNew;
          const bldgsQ = await c.query(
            `SELECT kb.building_code, kb.level, bt.land_cost, bt.name
             FROM kingdom_buildings kb
             JOIN building_types bt ON bt.code = kb.building_code
             WHERE kb.kingdom_id = $1
               AND kb.building_code != 'castles'
               AND kb.level > 0
               AND bt.land_cost > 0
             ORDER BY RANDOM()`,
            [def.id],
          );
          const demolished: string[] = [];
          for (const bldg of bldgsQ.rows) {
            if (overflow <= 0) break;
            const landCost = Number(bldg.land_cost);
            const currentLevel = Number(bldg.level);
            const levelsToRemove = Math.min(currentLevel, Math.ceil(overflow / landCost));
            const newLevel = Math.max(0, currentLevel - levelsToRemove);
            await c.query(
              `UPDATE kingdom_buildings SET level=$3 WHERE kingdom_id=$1 AND building_code=$2`,
              [def.id, bldg.building_code, newLevel],
            );
            overflow -= levelsToRemove * landCost;
            demolished.push(`${String(bldg.name)} → level ${newLevel}`);
          }
          if (demolished.length > 0) {
            await sendMailTx(
              c,
              Number(def.id),
              "system",
              `Buildings Demolished After Attack`,
              `After ${String(atk.name)}'s attack you lost ${landTaken.toLocaleString()} land. Buildings were randomly demolished to fit your remaining land:\n\n${demolished.join("\n")}\n\nYou now have ${defenderLandNew.toLocaleString()} land.`,
            );
          }
        }
      }

      // Resource looting: winner takes a % of defender's food/gold/wood/stone
      const LOOT_RATE: Record<string, number> = {
        "MINOR VICTORY": 0.05, "VICTORY": 0.10, "MAJOR VICTORY": 0.15, "OVERWHELMING VICTORY": 0.20,
      };
      const lootRate = (LOOT_RATE[result] || 0) * spoilsScale;
      let lootFood = 0, lootGold = 0, lootWood = 0, lootStone = 0;
      if (lootRate > 0) {
        const defResQ = await c.query(`SELECT food, gold, wood, stone FROM kingdoms WHERE id=$1`, [def.id]);
        const dr = defResQ.rows[0];
        lootFood = Math.floor(Number(dr?.food || 0) * lootRate);
        lootGold = Math.floor(Number(dr?.gold || 0) * lootRate);
        lootWood = Math.floor(Number(dr?.wood || 0) * lootRate);
        lootStone = Math.floor(Number(dr?.stone || 0) * lootRate);
        if (lootFood + lootGold + lootWood + lootStone > 0) {
          await c.query(`UPDATE kingdoms SET food=GREATEST(0,food-$2), gold=GREATEST(0,gold-$3), wood=GREATEST(0,wood-$4), stone=GREATEST(0,stone-$5) WHERE id=$1`, [def.id, lootFood, lootGold, lootWood, lootStone]);
          await c.query(`UPDATE kingdoms SET food=food+$2, gold=gold+$3, wood=wood+$4, stone=stone+$5 WHERE id=$1`, [atk.id, lootFood, lootGold, lootWood, lootStone]);
        }
      }

      // Gem rewards for victories
      const GEM_TABLE: Record<string, number> = {
        "MINOR VICTORY": Math.random() < 0.4 ? 1 : 0,
        "VICTORY": 1,
        "MAJOR VICTORY": 2,
        "OVERWHELMING VICTORY": Math.floor(Math.random() * 3) + 2,
      };
      const baseGemsAwarded = spoilsScale > 0 ? (GEM_TABLE[result] ?? 0) : 0;
      let gemsAwarded = baseGemsAwarded;
      if (baseGemsAwarded > 0) {
        const premiumQ = await c.query(
          `SELECT u.premium_started_at, u.premium_ends_at
           FROM kingdoms k
           JOIN app_users u ON u.id = k.user_id
           WHERE k.id=$1
           LIMIT 1`,
          [atk.id],
        );
        const gemMultiplier = premiumGemMultiplier(premiumQ.rows[0] || null);
        const scaled = baseGemsAwarded * gemMultiplier;
        const guaranteed = Math.floor(scaled);
        const fractional = scaled - guaranteed;
        gemsAwarded = guaranteed + (Math.random() < fractional ? 1 : 0);
      }
      if (gemsAwarded > 0) {
        await c.query(`UPDATE kingdoms SET green_gems = COALESCE(green_gems,0) + $2 WHERE id=$1`, [atk.id, gemsAwarded]);
      }

      // Fair settlement capture rules:
      // - max one settlement capture from same defender per 24h
      // - chance scales with land taken but reduced by target wall level
      // - defenders that hold more settlements than land-unlocked count are more vulnerable
      let capturedSettlement: any = null;
      if (landTaken > 0 && ["MINOR VICTORY", "VICTORY", "MAJOR VICTORY", "OVERWHELMING VICTORY"].includes(result)) {
        const recentCap = await c.query(
          `
          SELECT 1 FROM settlement_capture_log
          WHERE defender_kingdom_id=$1
            AND captured_at >= now() - interval '24 hours'
          LIMIT 1
          `,
          [def.id],
        );
        if (!recentCap.rowCount) {
          const defSetts = await c.query(
            `SELECT id, name, settlement_type, level, slots_total, wall_level
             FROM settlements
             WHERE kingdom_id=$1
             ORDER BY (level * (random() + 0.5)) ASC
             LIMIT 1`,
            [def.id],
          );
          const allDefSetts = await c.query(`SELECT COUNT(*)::int AS n FROM settlements WHERE kingdom_id=$1`, [def.id]);
          const allowedDef = expectedSettlementPlan(defenderLandNew).types.length;
          const overflow = Math.max(0, Number(allDefSetts.rows[0]?.n || 0) - allowedDef);
          if (defSetts.rowCount) {
            const s = defSetts.rows[0];
            const wallReduction = Math.min(0.75, Number(s.wall_level || 0) * 0.03);
            const LEVEL_RESISTANCE = [1.0, 0.80, 0.60, 0.45, 0.30, 0.20];
            const levelResistance = LEVEL_RESISTANCE[Math.min(5, Math.max(0, Number(s.level || 1) - 1))];
            const landFactor = defenderLand > 0 ? landTaken / defenderLand : 0;
            const baseChance = 0.02 + Math.min(0.10, landFactor * 0.5) + (overflow > 0 ? 0.15 : 0);
            const captureChance = Math.max(0, Math.min(0.85, baseChance * levelResistance * (1 - wallReduction)));
            if (Math.random() < captureChance) {
              await c.query(
                `UPDATE settlements
                 SET kingdom_id=$2, captured_from_kingdom_id=$1
                 WHERE id=$3`,
                [def.id, atk.id, s.id],
              );
              await c.query(`DELETE FROM settlement_garrison WHERE settlement_id=$1`, [s.id]);
              await c.query(
                `
                INSERT INTO settlement_capture_log(attacker_kingdom_id, defender_kingdom_id, settlement_id)
                VALUES ($1,$2,$3)
                `,
                [atk.id, def.id, s.id],
              );
              await c.query(
                `INSERT INTO settlement_history(settlement_id, item, datetime) VALUES ($1,$2,now())`,
                [s.id, `Settlement captured by ${String(atk.name)}`],
              );
              capturedSettlement = {
                id: s.id,
                name: s.name,
                type: s.settlement_type,
                level: s.level,
                wallLevel: s.wall_level,
              };
            }
          }
        }
      }

      const rep = await c.query(
        `INSERT INTO attack_reports(attacker_kingdom_id, defender_kingdom_id, attacker_name, defender_name, result, ratio, land_taken, attacker_power, defender_power, sent_troops, attacker_losses, defender_losses)\n         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb)\n         RETURNING id, created_at`,
        [
          atk.id,
          def.id,
          atk.name,
          def.name,
          result,
          ratio,
          landTaken,
          attackerPower,
          defenderPower,
          JSON.stringify(sentOnly),
          JSON.stringify(attackerLossesSentOnly),
          JSON.stringify(defenderBattle.losses),
        ],
      );

      for (const [code, survivors] of Object.entries(attackerSurvivors)) {
        if (Number(survivors) <= 0) continue;
        await c.query(
          `INSERT INTO troop_movements(owner_kingdom_id, owner_kingdom_name, target_kingdom_id, target_kingdom_name, troop_code, quantity, departed_at, returns_at, status, source_attack_report_id)
           VALUES ($1,$2,$3,$4,$5,$6,now(), now() + ($7 * INTERVAL '1 second'), 'out', $8)`,
          [atk.id, atk.name, def.id, def.name, code, Math.floor(survivors), ATTACK_RETURN_SECONDS, rep.rows[0].id],
        );
      }

      const isWin = ["MINOR VICTORY", "VICTORY", "MAJOR VICTORY", "OVERWHELMING VICTORY"].includes(result);
      const nwGained = Math.floor(landTaken * 0.04);
      const fmtLosses = (losses: Record<string, number>) => {
        const parts = Object.entries(losses).filter(([, v]) => v > 0).map(([k, v]) => `${v.toLocaleString()} ${k.replace(/_/g, " ")}`);
        return parts.length ? parts.join(", ") : "None";
      };
      const fmtTroops = (troopsSent: Record<string, number>) => {
        const parts = Object.entries(troopsSent).filter(([, v]) => Number(v || 0) > 0).map(([k, v]) => `${Number(v || 0).toLocaleString()} ${k.replace(/_/g, " ")}`);
        return parts.length ? parts.join(", ") : "None";
      };

      let attackerBody = `Attack Report: ${String(def.name)} (NW Gained: +${nwGained.toLocaleString()})\n`;
      attackerBody += `Attack Result: ${result}\n\n`;
      attackerBody += `Troops sent: ${fmtTroops(sentOnly)}\n\n`;
      if (isWin) {
        const gains: string[] = [];
        if (landTaken > 0) gains.push(`${landTaken.toLocaleString()} Land`);
        if (lootFood > 0) gains.push(`${lootFood.toLocaleString()} Food`);
        if (lootGold > 0) gains.push(`${lootGold.toLocaleString()} Gold`);
        if (lootStone > 0) gains.push(`${lootStone.toLocaleString()} Stone`);
        if (lootWood > 0) gains.push(`${lootWood.toLocaleString()} Wood`);
        if (gains.length) attackerBody += `You have gained the following during the attack: ${gains.join(", ")}\n\n`;
      }
      attackerBody += `We regret to inform you of the following casualties during the attack: ${fmtLosses(attackerLossesSentOnly)}\n`;
      attackerBody += `Enemy casualties: ${fmtLosses(defenderBattle.losses)}`;
      if (gemsAwarded > 0) attackerBody += `\n\nYou have also been awarded ${gemsAwarded} Green Gem${gemsAwarded !== 1 ? "s" : ""} for your victorious attack!`;

      let defenderBody = `Defence Report: ${String(atk.name)} attacked you!\n`;
      defenderBody += `Attack Result: ${result}\n\n`;
      defenderBody += `Enemy troops sent: ${fmtTroops(sentOnly)}\n\n`;
      if (isWin) {
        const lost: string[] = [];
        if (landTaken > 0) lost.push(`${landTaken.toLocaleString()} Land`);
        if (lootFood > 0) lost.push(`${lootFood.toLocaleString()} Food`);
        if (lootGold > 0) lost.push(`${lootGold.toLocaleString()} Gold`);
        if (lootStone > 0) lost.push(`${lootStone.toLocaleString()} Stone`);
        if (lootWood > 0) lost.push(`${lootWood.toLocaleString()} Wood`);
        if (lost.length) defenderBody += `You have lost the following: ${lost.join(", ")}\n\n`;
      }
      defenderBody += `Your casualties: ${fmtLosses(defenderBattle.losses)}\n`;
      defenderBody += `Enemy casualties: ${fmtLosses(attackerLossesSentOnly)}`;

      await sendMailTx(c, Number(atk.id), "attack", `Attack Report: ${String(def.name)}`, attackerBody);
      await sendMailTx(c, Number(def.id), "attack", `Defence Report: ${String(atk.name)} attacked you`, defenderBody);
      await sendNoticeTx(c, Number(atk.id), "success", `Attack ${result} vs ${def.name}. Land +${landTaken.toLocaleString()}${gemsAwarded > 0 ? ` • ${gemsAwarded} gem${gemsAwarded !== 1 ? "s" : ""}` : ""}`, { reportId: rep.rows[0].id });
      await sendNoticeTx(c, Number(def.id), landTaken > 0 ? "warning" : "info", `${atk.name} attacked you: ${result}. Land ${landTaken > 0 ? "-" : ""}${landTaken.toLocaleString()}`, { reportId: rep.rows[0].id });

      return {
        report: rep.rows[0],
        result,
        ratio: Number(ratio.toFixed(4)),
        attackerPower: Number(attackerPower.toFixed(2)),
        defenderPower: Number(defenderPower.toFixed(2)),
        landTaken,
        lootFood, lootGold, lootWood, lootStone,
        gemsAwarded,
        attackerLosses: attackerLossesSentOnly,
        defenderLosses: defenderBattle.losses,
        attackerSurvivorsAway: attackerSurvivors,
        elitesPromoted,
        capturedSettlement,
      };
    });

    return res.json({ ok: true, ...out });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/war-room/:attacker/explore", requireAuth, async (req, res) => {
  const attackerName = String(req.params.attacker || "").trim();
  const parsed = exploreBody.safeParse(req.body);
  if (!attackerName) return res.status(400).json({ ok: false, error: "attacker kingdom required" });
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });

  const sentTroopsRaw = Object.fromEntries(
    Object.entries(parsed.data.sentTroops).map(([k, v]) => [String(k).toLowerCase(), Number(v || 0)]),
  );

  try {
    const out = await withTx(async (c) => {
      const a = await c.query(
        `SELECT id, name, land, shield_status, shield_requested_at, shield_starts_at, shield_ends_at, shield_cooldown_ends_at FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`,
        [attackerName],
      );
      if (!a.rowCount) throw new Error("attacker kingdom not found");
      const atk = a.rows[0];
      if (Number(atk.land || 0) >= EXPLORE_LAND_CAP) {
        throw new Error(`explore unavailable at ${EXPLORE_LAND_CAP.toLocaleString()} land cap`);
      }

      const atkShieldRow = await normalizeShieldStateTx(c, Number(atk.id));
      const atkShield = shieldStateFromRow(atkShieldRow || atk);
      if (!atkShield.canAttack) {
        throw new Error(`cannot explore while shield status is ${atkShield.status}`);
      }

      const atkRows = await c.query(
        `SELECT kt.troop_code, kt.amount, tt.att_rating, tt.def_rating
         FROM kingdom_troops kt
         JOIN troop_types tt ON tt.code = kt.troop_code
         WHERE kt.kingdom_id=$1`,
        [atk.id],
      );

      const attackerTroops: Record<string, number> = {};
      const troopAtt: Record<string, number> = {};
      const troopDef: Record<string, number> = {};
      for (const r of atkRows.rows) {
        const code = String(r.troop_code || "");
        attackerTroops[code] = Number(r.amount || 0);
        troopAtt[code] = Number(r.att_rating || 0);
        troopDef[code] = Number(r.def_rating || 0);
      }

      const sentOnly = Object.fromEntries(Object.entries(sentTroopsRaw).filter(([, v]) => v > 0));
      for (const [code, sent] of Object.entries(sentOnly)) {
        const have = Number(attackerTroops[code] || 0);
        if (have < sent) throw new Error(`not enough ${code} (have ${have}, need ${sent})`);
      }

      const totalSent = Object.values(sentOnly).reduce((acc, v) => acc + Number(v || 0), 0);
      if (totalSent <= 0) throw new Error("send at least one troop to explore");

      const sentPower = Object.entries(sentOnly).reduce((acc, [code, qty]) => {
        const base = Number(qty || 0);
        const aRating = Number(troopAtt[code] || 0);
        const dRating = Number(troopDef[code] || 0);
        let unitPower = Math.max(0.1, aRating * 0.75 + dRating * 0.25);
        // Peasants can explore, but their efficiency is intentionally low.
        if (code === "peasants") unitPower *= 0.25;
        return acc + base * unitPower;
      }, 0);
      if (sentPower < EXPLORE_MIN_EFFECTIVE_POWER) {
        throw new Error(`explore party too small (need power ${EXPLORE_MIN_EFFECTIVE_POWER.toFixed(0)}, sent ${sentPower.toFixed(1)})`);
      }

      const kingdomLand = Number(atk.land || 0);
      const remainingCap = Math.max(0, EXPLORE_LAND_CAP - kingdomLand);
      const landProgress = clamp(kingdomLand / EXPLORE_LAND_CAP, 0, 1);
      const randomness = 0.85 + Math.random() * 0.30;
      // Keep some reward for larger parties, but kingdom size now drives the main explore yield.
      const sizeBonus = 0.95 + Math.min(0.30, Math.log10(totalSent + 10) * 0.10);
      const coordinationBonus = 1 + Math.min(0.15, Math.sqrt(totalSent) / 2000);
      const kgBonusHigh = Math.max(EXPLORE_KG_BONUS_AT_MIN_LAND, EXPLORE_KG_BONUS_AT_CAP_LAND);
      const kgBonusLow = Math.min(EXPLORE_KG_BONUS_AT_MIN_LAND, EXPLORE_KG_BONUS_AT_CAP_LAND);
      const kingdomSizeBonus = kgBonusHigh - (kgBonusHigh - kgBonusLow) * landProgress;
      const scaledLand = Math.floor(sentPower * EXPLORE_POWER_TO_LAND * sizeBonus * coordinationBonus * kingdomSizeBonus * randomness);
      const smallKingdomFloor = Math.floor((1 - landProgress) * EXPLORE_SMALL_KINGDOM_MIN_LAND);
      const baseLand = Math.max(scaledLand, smallKingdomFloor);
      if (baseLand <= 0) throw new Error("explore party was too small to claim land");
      const landFound = Math.min(remainingCap, EXPLORE_LAND_PER_MISSION_CAP, baseLand);
      if (landFound <= 0) throw new Error(`explore unavailable at ${EXPLORE_LAND_CAP.toLocaleString()} land cap`);

      const sentPressure = totalSent + sentPower * 0.14;
      const pace = clamp(sentPressure / 40000, 0, 1);
      const returnSeconds = Math.round(
        EXPLORE_MIN_RETURN_SECONDS + (EXPLORE_MAX_RETURN_SECONDS - EXPLORE_MIN_RETURN_SECONDS) * Math.pow(pace, 0.85),
      );

      const attackerAfterSend: Record<string, number> = { ...attackerTroops };
      for (const [code, sent] of Object.entries(sentOnly)) {
        attackerAfterSend[code] = Number(attackerAfterSend[code] || 0) - Number(sent);
      }
      for (const [code, amount] of Object.entries(attackerAfterSend)) {
        await c.query(`UPDATE kingdom_troops SET amount=$3 WHERE kingdom_id=$1 AND troop_code=$2`, [atk.id, code, Math.max(0, Math.floor(amount))]);
      }

      const newLand = Number(atk.land || 0) + landFound;
      await c.query(`UPDATE kingdoms SET land=$2 WHERE id=$1`, [atk.id, newLand]);

      for (const [code, qty] of Object.entries(sentOnly)) {
        await c.query(
          `INSERT INTO troop_movements(owner_kingdom_id, owner_kingdom_name, target_kingdom_id, target_kingdom_name, troop_code, quantity, departed_at, returns_at, status)
           VALUES ($1,$2,NULL,'Wilderness',$3,$4,now(), now() + ($5 * INTERVAL '1 second'), 'out')`,
          [atk.id, atk.name, code, Math.floor(Number(qty || 0)), returnSeconds],
        );
      }

      await sendMailTx(
        c,
        Number(atk.id),
        "system",
        "Explore Report",
        `Exploration succeeded.\nLand gained: ${landFound.toLocaleString()}\nNew total land: ${newLand.toLocaleString()}\nTroops return in: ${formatSecondsAsClock(returnSeconds)}`,
      );
      await sendNoticeTx(
        c,
        Number(atk.id),
        "success",
        `Explore +${landFound.toLocaleString()} land. Troops return in ${formatSecondsAsClock(returnSeconds)}.`,
        { landFound, returnSeconds },
      );

      return {
        landFound,
        newLand,
        sentTroops: sentOnly,
        returnSeconds,
        returnEta: formatSecondsAsClock(returnSeconds),
      };
    });

    return res.json({ ok: true, ...out });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/war-room/:attacker/spy", requireAuth, async (req, res) => {
  const attackerName = String(req.params.attacker || "").trim();
  const parsed = spyBody.safeParse(req.body);
  if (!attackerName) return res.status(400).json({ ok: false, error: "attacker kingdom required" });
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });
  const defenderName = parsed.data.defenderKingdom.trim();
  const spiesToSend = Math.max(1, Number(parsed.data.spiesToSend || 0));

  try {
    const out = await withTx(async (c) => {
      const a = await c.query(
        `SELECT id, name FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`,
        [attackerName],
      );
      if (!a.rowCount) throw new Error("attacker kingdom not found");
      const d = await c.query(
        `SELECT id, name, land, gold, food, wood, stone, horses, blue_gems, green_gems FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`,
        [defenderName],
      );
      if (!d.rowCount) throw new Error("defender kingdom not found");
      const atk = a.rows[0];
      const def = d.rows[0];
      if (Number(atk.id) === Number(def.id)) throw new Error("cannot spy yourself");

      const atkSpy = await c.query(
        `SELECT amount FROM kingdom_troops WHERE kingdom_id=$1 AND troop_code='spies' LIMIT 1`,
        [atk.id],
      );
      const defSpy = await c.query(
        `SELECT amount FROM kingdom_troops WHERE kingdom_id=$1 AND troop_code='spies' LIMIT 1`,
        [def.id],
      );
      const atkHave = Number(atkSpy.rows[0]?.amount || 0);
      const defHave = Number(defSpy.rows[0]?.amount || 0);
      if (atkHave < spiesToSend) throw new Error(`not enough spies (have ${atkHave}, need ${spiesToSend})`);

      const spyGlassAtk = await c.query(
        `SELECT level FROM kingdom_research WHERE kingdom_id=$1 AND research_code='spy_glass' LIMIT 1`,
        [atk.id],
      );
      const spyGlassDef = await c.query(
        `SELECT level FROM kingdom_research WHERE kingdom_id=$1 AND research_code='spy_glass' LIMIT 1`,
        [def.id],
      );
      const atkBonus = 1 + Number(spyGlassAtk.rows[0]?.level || 0) * 0.02;
      const defBonus = 1 + Number(spyGlassDef.rows[0]?.level || 0) * 0.02;

      const atkPower = spiesToSend * atkBonus;
      const defPower = Math.max(1, defHave * defBonus);
      const ratio = atkPower / defPower;
      const success = ratio >= 0.95 || Math.random() < ratio;

      let spyLosses = Math.max(0, Math.floor(spiesToSend * (success ? 0.08 : 0.3)));
      spyLosses = clamp(spyLosses, 0, spiesToSend);
      const survivors = spiesToSend - spyLosses;
      const defenderSpyLosses = success ? Math.max(0, Math.floor(defHave * 0.04)) : 0;

      await c.query(`UPDATE kingdom_troops SET amount=amount-$2 WHERE kingdom_id=$1 AND troop_code='spies'`, [atk.id, spiesToSend]);
      await c.query(`UPDATE kingdom_troops SET amount=GREATEST(0, amount-$2) WHERE kingdom_id=$1 AND troop_code='spies'`, [def.id, defenderSpyLosses]);

      if (survivors > 0) {
        await c.query(
          `INSERT INTO troop_movements(owner_kingdom_id, owner_kingdom_name, target_kingdom_id, target_kingdom_name, troop_code, quantity, departed_at, returns_at, status)
           VALUES ($1,$2,$3,$4,'spies',$5,now(), now() + ($6 * INTERVAL '1 second'), 'out')`,
          [atk.id, atk.name, def.id, def.name, survivors, SPY_RETURN_SECONDS],
        );
      }

      // Gather rich intel for the report
      // resultLevel must be anchored to success — a lucky low-ratio success should not
      // display "Mission Failed" while also showing full intel.
      const resultLevel = !success
        ? "Mission Failed"
        : ratio >= 2 ? "Complete Infiltration" : ratio >= 1.5 ? "Deep Infiltration" : "Partial Infiltration";

      let reportBody: string;
      if (success) {
        const [defTroopsQ, defCastlesQ, defAllianceQ, defNwQ, defAttacksQ] = await Promise.all([
          c.query(
            `SELECT tt.name AS troop_name, kt.amount, tt.def_rating FROM kingdom_troops kt JOIN troop_types tt ON tt.code=kt.troop_code WHERE kt.kingdom_id=$1 AND kt.amount>0 ORDER BY kt.amount DESC`,
            [def.id],
          ),
          c.query(`SELECT COALESCE(level,0)::int AS castles FROM kingdom_buildings WHERE kingdom_id=$1 AND building_code='castles' LIMIT 1`, [def.id]),
          c.query(`SELECT a.slug FROM alliances a JOIN alliance_members m ON m.alliance_id=a.id WHERE m.kingdom_id=$1 LIMIT 1`, [def.id]),
          c.query(
            `WITH tn AS (SELECT COALESCE(SUM(kt.amount * ty.nw_value),0) AS troop_nw FROM kingdom_troops kt JOIN troop_types ty ON ty.code=kt.troop_code WHERE kt.kingdom_id=$1)
             SELECT ROUND((k.land * 0.04 + k.food * 0.0001 + k.gold * 0.0005 + k.stone * 0.0002 + k.wood * 0.0002 + tn.troop_nw)::numeric, 0)::bigint AS networth,
               (SELECT COUNT(*)+1 FROM kingdoms k2 WHERE (k2.land * 0.04 + k2.food * 0.0001 + k2.gold * 0.0005 + k2.stone * 0.0002 + k2.wood * 0.0002) > (k.land * 0.04 + k.food * 0.0001 + k.gold * 0.0005 + k.stone * 0.0002 + k.wood * 0.0002))::int AS rank
             FROM kingdoms k, tn WHERE k.id=$1`,
            [def.id],
          ),
          c.query(
            `SELECT attacker_name, defender_name, result, created_at FROM attack_reports WHERE (attacker_kingdom_id=$1 OR defender_kingdom_id=$1) AND created_at > now() - interval '24 hours' ORDER BY created_at DESC LIMIT 8`,
            [def.id],
          ),
        ]);

        const defTroops = defTroopsQ.rows;
        const castles = Number(defCastlesQ.rows[0]?.castles || 0);
        const allianceTag = String(defAllianceQ.rows[0]?.slug || "None");
        const networth = Number(defNwQ.rows[0]?.networth || 0);
        const rank = Number(defNwQ.rows[0]?.rank || 0);
        const totalTroops = defTroops.reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
        const approxDefPower = defTroops.reduce((s: number, t: any) => s + Number(t.amount || 0) * Number(t.def_rating || 0), 0);

        const troopLines = defTroops.length > 0
          ? defTroops.map((t: any) => `  ${String(t.troop_name).padEnd(22)} ${Number(t.amount || 0).toLocaleString()}`).join("\n")
          : "  No troops detected.";

        const recentActivity = defAttacksQ.rows.length > 0
          ? defAttacksQ.rows.map((r: any) => {
              const time = new Date(r.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
              if (String(r.attacker_name).toLowerCase() === String(def.name).toLowerCase()) {
                return `  Launched an attack on ${r.defender_name} (${time})`;
              }
              return `  Attacked by ${r.attacker_name} (${time})`;
            }).join("\n")
          : "  No recent activity.";

        reportBody = [
          `Target: ${def.name}`,
          `Alliance: ${allianceTag}`,
          `Ranking: #${rank}`,
          `Networth: ${networth.toLocaleString()}`,
          `Result Level: ${resultLevel}`,
          ``,
          `Spies Sent: ${spiesToSend.toLocaleString()}`,
          `Spies Lost: ${spyLosses.toLocaleString()}`,
          `Spies Returning: ${survivors.toLocaleString()}`,
          `Number of Castles: ${castles.toLocaleString()}`,
          ``,
          `Resources:`,
          `  Gold:          ${Number(def.gold || 0).toLocaleString()}`,
          `  Food:          ${Number(def.food || 0).toLocaleString()}`,
          `  Wood:          ${Number(def.wood || 0).toLocaleString()}`,
          `  Stone:         ${Number(def.stone || 0).toLocaleString()}`,
          `  Land:          ${Number(def.land || 0).toLocaleString()}`,
          `  Horses:        ${Number(def.horses || 0).toLocaleString()}`,
          `  Blue Gems:     ${Number(def.blue_gems || 0).toLocaleString()}`,
          `  Green Gems:    ${Number(def.green_gems || 0).toLocaleString()}`,
          ``,
          `Troops:`,
          troopLines,
          ``,
          `  Total Troops:  ${totalTroops.toLocaleString()}`,
          `  Approx. Defensive Power: ${Math.floor(approxDefPower).toLocaleString()}`,
          ``,
          `Recent Activity (last 24h):`,
          recentActivity,
        ].join("\n");
      } else {
        reportBody = [
          `Target: ${def.name}`,
          `Result Level: ${resultLevel}`,
          ``,
          `Spies Sent: ${spiesToSend.toLocaleString()}`,
          `Spies Lost: ${spyLosses.toLocaleString()}`,
          `Spies Returning: ${survivors.toLocaleString()}`,
          ``,
          `Your spies were detected and could not gather intel.`,
        ].join("\n");
      }

      await sendMailTx(c, Number(atk.id), "spy", `Spy Report: ${def.name}`, reportBody);
      await sendMailTx(
        c,
        Number(def.id),
        "spy",
        `Counterintelligence Report`,
        [
          `${atk.name} sent spies to your kingdom.`,
          ``,
          `Enemy Spies Sent: ${spiesToSend.toLocaleString()}`,
          `Enemy Spies Lost: ${spyLosses.toLocaleString()}`,
          `Your Spies Lost: ${defenderSpyLosses.toLocaleString()}`,
          `Mission Outcome: ${success ? "Infiltration succeeded" : "Infiltration repelled"}`,
        ].join("\n"),
      );
      await sendNoticeTx(
        c,
        Number(atk.id),
        success ? "success" : "warning",
        success ? `Spy mission succeeded against ${def.name}.` : `Spy mission failed against ${def.name}.`,
        { defender: def.name, success, spyLosses, survivors },
      );
      await sendNoticeTx(
        c,
        Number(def.id),
        "warning",
        `${atk.name} attempted espionage on your kingdom.`,
        { attacker: atk.name, spiesToSend },
      );

      return {
        success,
        ratio: Number(ratio.toFixed(3)),
        resultLevel,
        spiesSent: spiesToSend,
        spyLosses,
        survivorsReturning: survivors,
        returnSeconds: SPY_RETURN_SECONDS,
      };
    });
    return res.json({ ok: true, ...out });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/api/war-room/:kingdom", requireAuth, async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });

  try {
    const session = (req as any).authSession;
    const ownKingdom = await pool.query(
      `SELECT 1 FROM kingdoms WHERE LOWER(name)=LOWER($1) AND user_id=$2 LIMIT 1`,
      [kingdom, session.user_id],
    );
    if (!ownKingdom.rowCount) {
      return res.status(403).json({ ok: false, error: "You can only view your own kingdom data" });
    }

    const season = await getSeasonSnapshot();
    const k = await pool.query(
      `SELECT id, name, land, food, gold, horses, tax_rate, shield_status, shield_requested_at, shield_starts_at, shield_ends_at, shield_cooldown_ends_at, created_at FROM kingdoms WHERE LOWER(name)=LOWER($1) LIMIT 1`,
      [kingdom],
    );
    if (!k.rowCount) return res.status(404).json({ ok: false, error: "kingdom not found" });
    let row = k.rows[0];
    await withTx(async (c) => {
      await normalizeShieldStateTx(c, Number(row.id));
      return 0;
    });
    const kr = await pool.query(
      `SELECT id, name, land, food, gold, horses, tax_rate, shield_status, shield_requested_at, shield_starts_at, shield_ends_at, shield_cooldown_ends_at, created_at FROM kingdoms WHERE id=$1 LIMIT 1`,
      [row.id],
    );
    row = kr.rows[0] || row;

    const rankQ = await pool.query(
      `WITH nw AS (
         WITH home AS (
           SELECT kingdom_id, troop_code, COALESCE(SUM(amount),0) AS qty
           FROM kingdom_troops
           GROUP BY kingdom_id, troop_code
         ),
         train AS (
           SELECT kingdom_id, troop_code, COALESCE(SUM(quantity),0) AS qty
           FROM train_queue
           WHERE status='queued'
           GROUP BY kingdom_id, troop_code
         ),
         away AS (
           SELECT owner_kingdom_id AS kingdom_id, troop_code, COALESCE(SUM(quantity),0) AS qty
           FROM troop_movements
           WHERE status='out' AND returns_at > now()
           GROUP BY owner_kingdom_id, troop_code
         ),
         troop_totals AS (
           SELECT
             COALESCE(h.kingdom_id, t.kingdom_id, a.kingdom_id) AS kingdom_id,
             COALESCE(h.troop_code, t.troop_code, a.troop_code) AS troop_code,
             COALESCE(h.qty,0) + COALESCE(t.qty,0) + COALESCE(a.qty,0) AS qty
           FROM home h
           FULL OUTER JOIN train t
             ON t.kingdom_id = h.kingdom_id
            AND t.troop_code = h.troop_code
           FULL OUTER JOIN away a
             ON a.kingdom_id = COALESCE(h.kingdom_id, t.kingdom_id)
            AND a.troop_code = COALESCE(h.troop_code, t.troop_code)
         ),
         troop_nw AS (
           SELECT tt.kingdom_id, COALESCE(SUM(tt.qty * ty.nw_value),0) AS troop_nw
           FROM troop_totals tt
           JOIN troop_types ty ON ty.code = tt.troop_code
           GROUP BY tt.kingdom_id
         )
         SELECT k.id,
                (k.land * 0.04 + k.food * 0.0001 + k.gold * 0.0005 + k.stone * 0.0002 + k.wood * 0.0002 + COALESCE(tn.troop_nw, 0)) AS networth
         FROM kingdoms k
         LEFT JOIN troop_nw tn ON tn.kingdom_id = k.id
       ),
       r AS (
         SELECT id, networth, ROW_NUMBER() OVER (ORDER BY networth DESC) AS rank
         FROM nw
       )
       SELECT rank, networth FROM r WHERE id = $1`,
      [row.id],
    );

    const homeRows = await pool.query(
      `SELECT tt.code, tt.name, tt.gold_cost, tt.food_cost, tt.horse_cost, tt.train_seconds,
              CASE WHEN tt.code IN ('footmen','pikemen','archers','crossbowmen','light_cavalry','heavy_cavalry','knights') THEN 1 ELSE 0 END AS peasant_cost,
              tt.att_rating, tt.def_rating, tt.upkeep_food, tt.upkeep_gold, tt.nw_value, tt.housing, tt.notes, tt.is_trainable,
              COALESCE(kt.amount,0) AS home
       FROM troop_types tt
       LEFT JOIN kingdom_troops kt ON kt.troop_code = tt.code AND kt.kingdom_id = $1
       ORDER BY tt.code`,
      [row.id],
    );

    const trainRows = await pool.query(
      `SELECT troop_code, COALESCE(SUM(quantity),0) AS qty
       FROM train_queue
       WHERE kingdom_id = $1 AND status='queued'
       GROUP BY troop_code`,
      [row.id],
    );
    const awayRows = await pool.query(
      `SELECT troop_code, COALESCE(SUM(quantity),0) AS qty
       FROM troop_movements
       WHERE owner_kingdom_id = $1 AND status='out' AND returns_at > now()
       GROUP BY troop_code`,
      [row.id],
    );
    const kingdomBuildings = await pool.query(
      `SELECT building_code, level FROM kingdom_buildings WHERE kingdom_id=$1`,
      [row.id],
    );

    const trainMap = new Map<string, number>();
    const awayMap = new Map<string, number>();
    const buildingLevelMap = new Map<string, number>();
    for (const tr of trainRows.rows) trainMap.set(String(tr.troop_code), Number(tr.qty || 0));
    for (const aw of awayRows.rows) awayMap.set(String(aw.troop_code), Number(aw.qty || 0));
    for (const b of kingdomBuildings.rows) buildingLevelMap.set(String(b.building_code), Number(b.level || 0));
    const guildhalls = Number(buildingLevelMap.get("guildhalls") || 0);
    const housesBuilt = Number(buildingLevelMap.get("houses") || 0);
    const castlesBuilt = Number(buildingLevelMap.get("castles") || 0);
    const popCap = effectivePeasantCap({ houses: housesBuilt, castles: castlesBuilt });
    const spiesHome = Number(homeRows.rows.find((t) => String(t.code) === "spies")?.home || 0);
    const spiesTrain = Number(trainMap.get("spies") || 0);
    const spiesAway = Number(awayMap.get("spies") || 0);
    const spiesCapacity = guildhalls * SPY_CAPACITY_PER_GUILDHALL;
    const spiesUsed = spiesHome + spiesTrain + spiesAway;
    const spiesAvailable = Math.max(0, spiesCapacity - spiesUsed);
    const kingdomGold = Number(row.gold || 0);
    const kingdomFood = Number(row.food || 0);
    const kingdomHorses = Number(row.horses || 0);
    const peasantsHome = Number(homeRows.rows.find((t) => String(t.code) === "peasants")?.home || 0);

    const maxByCost = (have: number, cost: number) =>
      cost > 0 ? Math.max(0, Math.floor(have / cost)) : Number.POSITIVE_INFINITY;

    const troops = homeRows.rows.map((t) => {
      const troopCode = String(t.code || "");
      const req = TROOP_TRAIN_REQUIREMENTS[troopCode] || null;
      const reqLevel = req ? Number(buildingLevelMap.get(req.buildingCode) || 0) : 0;
      const trainable = Boolean(t.is_trainable);
      const canTrainNow = trainable && (!req || reqLevel >= req.minLevel);
      const goldCost = Number(t.gold_cost || 0);
      const foodCost = Number(t.food_cost || 0);
      const peasantCost = Number(t.peasant_cost || 0);
      const horseCost = Number(t.horse_cost || 0);
      const housingDef = TROOP_HOUSING_CAPS[troopCode];
      const housingCap = troopCode === "peasants"
        ? popCap
        : housingDef
        ? Number(buildingLevelMap.get(housingDef.buildingCode) || 0) * housingDef.perLevel
        : null;
      const housingUsed = Number(t.home || 0) + Number(trainMap.get(troopCode) || 0) + Number(awayMap.get(troopCode) || 0);
      const housingRoom = housingCap !== null ? Math.max(0, housingCap - housingUsed) : null;
      let maxTrainNow = 0;
      if (canTrainNow) {
        const caps = [
          maxByCost(kingdomGold, goldCost),
          maxByCost(kingdomFood, foodCost),
          maxByCost(kingdomHorses, horseCost),
          maxByCost(peasantsHome, peasantCost),
          housingRoom !== null ? housingRoom : Number.POSITIVE_INFINITY,
        ];
        if (troopCode === "spies") caps.push(spiesAvailable);
        const finite = caps.filter((x) => Number.isFinite(x));
        maxTrainNow = finite.length ? Math.max(0, Math.min(...finite)) : 0;
      }
      return {
        troopCode,
        troopName: t.name,
        goldCost,
        foodCost,
        peasantCost,
        horseCost,
        trainSeconds: Number(t.train_seconds || 0),
        att: Number(t.att_rating || 0),
        def: Number(t.def_rating || 0),
        upkeepFood: Number(t.upkeep_food || 0),
        upkeepGold: Number(t.upkeep_gold || 0),
        nw: Number(t.nw_value || 0),
        housing: String(t.housing || ""),
        notes: String(t.notes || ""),
        isTrainable: trainable,
        requiredBuildingCode: req?.buildingCode || null,
        requiredBuildingName: req?.buildingName || null,
        requiredBuildingLevel: req?.minLevel || null,
        currentRequiredBuildingLevel: req ? reqLevel : null,
        canTrainNow,
        home: Number(t.home || 0),
        train: Number(trainMap.get(troopCode) || 0),
        away: Number(awayMap.get(troopCode) || 0),
        housingCap,
        housingUsed,
        housingRoom,
        maxTrainNow,
      };
    });

    const training = await pool.query(
      `SELECT id, troop_code, quantity, started_at, completes_at
       FROM train_queue
       WHERE kingdom_id = $1 AND status='queued'
       ORDER BY completes_at ASC
       LIMIT 50`,
      [row.id],
    );
    const movements = await pool.query(
      `SELECT id, troop_code, quantity, target_kingdom_name, departed_at, returns_at, status, source_attack_report_id
       FROM troop_movements
       WHERE owner_kingdom_id=$1 AND status='out' AND returns_at > now()
       ORDER BY returns_at ASC
       LIMIT 80`,
      [row.id],
    );

    return res.json({
      ok: true,
      kingdom: {
        id: row.id,
        name: row.name,
        rank: Number(rankQ.rows[0]?.rank || 0),
        networth: Number(rankQ.rows[0]?.networth || 0),
        land: Number(row.land || 0),
        populationHome: troops.reduce((a, b) => a + Number(b.home || 0), 0),
        populationTrain: troops.reduce((a, b) => a + Number(b.train || 0), 0),
        populationAway: troops.reduce((a, b) => a + Number(b.away || 0), 0),
        populationCap: popCap,
        food: Number(row.food || 0),
        gold: Number(row.gold || 0),
        horses: Number(row.horses || 0),
        taxRate: Number(row.tax_rate || 25),
      },
      troops,
      training: training.rows,
      movements: movements.rows,
      spyCapacity: {
        guildhalls,
        perGuildhall: SPY_CAPACITY_PER_GUILDHALL,
        total: spiesCapacity,
        home: spiesHome,
        train: spiesTrain,
        away: spiesAway,
        used: spiesUsed,
        available: spiesAvailable,
      },
      season,
      shield: shieldStateFromRow(row),
      explore: {
        landCap: EXPLORE_LAND_CAP,
        remaining: Math.max(0, EXPLORE_LAND_CAP - Number(row.land || 0)),
        minReturnSeconds: EXPLORE_MIN_RETURN_SECONDS,
        maxReturnSeconds: EXPLORE_MAX_RETURN_SECONDS,
      },
      tickIntervalSeconds: LOCAL_DEMO_FAST ? 5 : 300,
      actions: ["Train Troops", "Attack Kingdom", "Explore"],
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/api/war-room/reports/:kingdom", requireAuth, async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  const limit = clamp(Number(req.query.limit || 25), 1, 200);
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });

  try {
    const session = (req as any).authSession;
    const ownKingdom = await pool.query(
      `SELECT 1 FROM kingdoms WHERE LOWER(name)=LOWER($1) AND user_id=$2 LIMIT 1`,
      [kingdom, session.user_id],
    );
    if (!ownKingdom.rowCount) {
      return res.status(403).json({ ok: false, error: "You can only view your own kingdom data" });
    }

    const rows = await pool.query(
      `SELECT id, attacker_name, defender_name, result, ratio, land_taken, attacker_power, defender_power, sent_troops, attacker_losses, defender_losses, created_at\n       FROM attack_reports\n       WHERE LOWER(attacker_name)=LOWER($1) OR LOWER(defender_name)=LOWER($1)\n       ORDER BY created_at DESC\n       LIMIT $2`,
      [kingdom, limit],
    );
    return res.json({ ok: true, items: rows.rows });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/api/rankings/kingdoms", async (req, res) => {
  const limit = clamp(Number(req.query.limit || 20), 1, 200);
  const offset = Math.max(0, Math.floor(Number(req.query.offset || 0)));
  const search = String(req.query.search || "").trim().toLowerCase();
  const searchLike = `%${search}%`;
  try {
    const rows = await pool.query(
      `
      WITH home AS (
        SELECT kingdom_id, troop_code, COALESCE(SUM(amount),0) AS qty
        FROM kingdom_troops
        GROUP BY kingdom_id, troop_code
      ),
      train AS (
        SELECT kingdom_id, troop_code, COALESCE(SUM(quantity),0) AS qty
        FROM train_queue
        WHERE status='queued'
        GROUP BY kingdom_id, troop_code
      ),
      away AS (
        SELECT owner_kingdom_id AS kingdom_id, troop_code, COALESCE(SUM(quantity),0) AS qty
        FROM troop_movements
        WHERE status='out' AND returns_at > now()
        GROUP BY owner_kingdom_id, troop_code
      ),
      totals AS (
        SELECT
          COALESCE(h.kingdom_id, t.kingdom_id, a.kingdom_id) AS kingdom_id,
          COALESCE(h.troop_code, t.troop_code, a.troop_code) AS troop_code,
          COALESCE(h.qty,0) + COALESCE(t.qty,0) + COALESCE(a.qty,0) AS qty
        FROM home h
        FULL OUTER JOIN train t
          ON t.kingdom_id = h.kingdom_id
         AND t.troop_code = h.troop_code
        FULL OUTER JOIN away a
          ON a.kingdom_id = COALESCE(h.kingdom_id, t.kingdom_id)
         AND a.troop_code = COALESCE(h.troop_code, t.troop_code)
      ),
      troop_nw AS (
        SELECT t.kingdom_id, COALESCE(SUM(t.qty * ty.nw_value),0) AS troop_nw
        FROM totals t
        JOIN troop_types ty ON ty.code = t.troop_code
        GROUP BY t.kingdom_id
      ),
      raw AS (
        SELECT
          k.id,
          k.name,
          COALESCE(a.slug, '') AS alliance_tag,
          (k.land * 0.04 + k.food * 0.0001 + k.gold * 0.0005 + k.stone * 0.0002 + k.wood * 0.0002 + COALESCE(tn.troop_nw, 0)) AS networth
        FROM kingdoms k
        LEFT JOIN troop_nw tn ON tn.kingdom_id = k.id
        LEFT JOIN alliance_members am ON am.kingdom_id = k.id
        LEFT JOIN alliances a ON a.id = am.alliance_id
      ),
      ranked AS (
        SELECT id, name, alliance_tag, networth, ROW_NUMBER() OVER (ORDER BY networth DESC, id ASC) AS rank
        FROM raw
      ),
      filtered AS (
        SELECT * FROM ranked
        WHERE ($1 = '' OR LOWER(name) LIKE $2 OR LOWER(alliance_tag) LIKE $2)
      )
      SELECT id, name, alliance_tag, networth, rank,
             COUNT(*) OVER()::int AS total_filtered
      FROM filtered
      ORDER BY rank ASC
      OFFSET $3 LIMIT $4
      `,
      [search, searchLike, offset, limit],
    );

    const items = rows.rows.map((r) => ({
      id: Number(r.id),
      rank: Number(r.rank || 0),
      name: String(r.name || ""),
      allianceTag: String(r.alliance_tag || ""),
      networth: Number(r.networth || 0),
    }));
    const total = Number(rows.rows[0]?.total_filtered || 0);
    return res.json({ ok: true, items, total, limit, offset });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/api/rankings/kingdoms/:name/nw-history", async (req, res) => {
  const name = String(req.params.name || "").trim();
  const limit = clamp(Number(req.query.limit || 288), 10, 2000);
  if (!name) return res.status(400).json({ ok: false, error: "kingdom required" });
  try {
    const k = await pool.query(`SELECT id, name, land, food, gold, stone, wood FROM kingdoms WHERE LOWER(name)=LOWER($1) LIMIT 1`, [name]);
    if (!k.rowCount) return res.status(404).json({ ok: false, error: "kingdom not found" });
    const kingdom = k.rows[0];
    const rows = await pool.query(
      `SELECT id, networth, recorded_at
       FROM kingdom_networth_history
       WHERE kingdom_id=$1
       ORDER BY recorded_at DESC
       LIMIT $2`,
      [kingdom.id, limit],
    );
    let items = rows.rows
      .slice()
      .reverse()
      .map((r) => ({ id: Number(r.id), networth: Number(r.networth || 0), recordedAt: r.recorded_at }));
    if (items.length === 0) {
      const nw = Number(kingdom.land || 0) * 0.04 + Number(kingdom.food || 0) * 0.0001 + Number(kingdom.gold || 0) * 0.0005 + Number(kingdom.stone || 0) * 0.0002 + Number(kingdom.wood || 0) * 0.0002;
      await pool.query(
        `INSERT INTO kingdom_networth_history(kingdom_id, networth, recorded_at) VALUES ($1,$2,now())`,
        [kingdom.id, Number(nw.toFixed(2))],
      );
      items = [{ id: 0, networth: Number(nw.toFixed(2)), recordedAt: new Date().toISOString() }];
    }
    return res.json({ ok: true, kingdom: kingdom.name, items });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/api/premium/rankings/kingdoms/:name/nw-history", requireAuth, async (req, res) => {
  const name = String(req.params.name || "").trim();
  const windowCode = String(req.query.window || "1d").trim().toLowerCase();
  const windowDef = ({
    "12h": { interval: "12 hours", maxPoints: 160 },
    "1d": { interval: "1 day", maxPoints: 220 },
    "1w": { interval: "7 days", maxPoints: 260 },
    "1m": { interval: "30 days", maxPoints: 320 },
  } as Record<string, { interval: string; maxPoints: number }>)[windowCode] || { interval: "1 day", maxPoints: 220 };
  if (!name) return res.status(400).json({ ok: false, error: "kingdom required" });

  const session = (req as any).authSession;
  if (!isPremiumActive(session)) return res.status(403).json({ ok: false, error: "premium required" });

  try {
    const k = await pool.query(`SELECT id, name, land, food, gold, stone, wood FROM kingdoms WHERE LOWER(name)=LOWER($1) LIMIT 1`, [name]);
    if (!k.rowCount) return res.status(404).json({ ok: false, error: "kingdom not found" });
    const kingdom = k.rows[0];
    const rows = await pool.query(
      `SELECT id, networth, recorded_at
       FROM kingdom_networth_history
       WHERE kingdom_id=$1
         AND recorded_at >= now() - ($2::interval)
       ORDER BY recorded_at ASC`,
      [kingdom.id, windowDef.interval],
    );
    let items = rows.rows.map((r) => ({
      id: Number(r.id),
      networth: Number(r.networth || 0),
      recordedAt: r.recorded_at,
    }));
    if (items.length === 0) {
      const nw = Number(kingdom.land || 0) * 0.04 + Number(kingdom.food || 0) * 0.0001 + Number(kingdom.gold || 0) * 0.0005 + Number(kingdom.stone || 0) * 0.0002 + Number(kingdom.wood || 0) * 0.0002;
      items = [{ id: 0, networth: Number(nw.toFixed(2)), recordedAt: new Date().toISOString() }];
    }
    const sampled = downsampleSeries(items, windowDef.maxPoints);
    return res.json({ ok: true, kingdom: kingdom.name, window: windowCode, premium: premiumStatusFromRow(session), items: sampled });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/api/rankings/alliances", async (req, res) => {
  const limit = clamp(Number(req.query.limit || 30), 1, 100);
  const offset = Math.max(0, Math.floor(Number(req.query.offset || 0)));
  try {
    const rows = await pool.query(
      `
      SELECT
        a.id,
        a.slug,
        a.name,
        a.description,
        COUNT(DISTINCT am.kingdom_id)::int AS member_count,
        COALESCE(SUM(
          k.land * 0.04 + k.food * 0.0001 + k.gold * 0.0005 + k.stone * 0.0002 + k.wood * 0.0002
        ), 0) AS total_networth,
        a.created_at
      FROM alliances a
      LEFT JOIN alliance_members am ON am.alliance_id = a.id
      LEFT JOIN kingdoms k ON k.id = am.kingdom_id
      GROUP BY a.id, a.slug, a.name, a.description, a.created_at
      ORDER BY total_networth DESC
      LIMIT $1 OFFSET $2
      `,
      [limit, offset],
    );
    const total = await pool.query(`SELECT COUNT(*) AS cnt FROM alliances`);
    return res.json({
      ok: true,
      alliances: rows.rows.map((r, i) => ({
        rank: offset + i + 1,
        id: Number(r.id),
        slug: r.slug,
        name: r.name,
        description: r.description,
        memberCount: Number(r.member_count || 0),
        totalNetworth: Math.round(Number(r.total_networth || 0)),
        createdAt: r.created_at,
      })),
      total: Number(total.rows[0]?.cnt || 0),
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/api/pigeons/:kingdom", requireAuth, async (req, res) => {
  const session = (req as any).authSession;
  const kingdom = String(req.params.kingdom || "").trim();
  const limit = clamp(Number(req.query.limit || 100), 1, 300);
  const filterKindRaw = String(req.query.kind || "all").trim().toLowerCase();
  const filterKind = ["all", "system", "attack", "spy", "player"].includes(filterKindRaw) ? filterKindRaw : "all";
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });
  try {
    const k = await pool.query(`SELECT id, user_id FROM kingdoms WHERE LOWER(name)=LOWER($1) LIMIT 1`, [kingdom]);
    if (!k.rowCount) return res.status(404).json({ ok: false, error: "kingdom not found" });
    // Ownership check — only your own mail
    if (String(k.rows[0].user_id) !== String(session.user_id)) {
      return res.status(403).json({ ok: false, error: "You can only view your own pigeons" });
    }
    const kingdomId = Number(k.rows[0].id);

    if (filterKind !== "all") {
      const premiumQ = await pool.query(
        `SELECT premium_started_at, premium_ends_at FROM app_users WHERE id=$1 LIMIT 1`,
        [session.user_id],
      );
      if (!isPremiumActive(premiumQ.rows[0] || null)) {
        return res.status(403).json({ ok: false, error: "premium required for filtered pigeon views" });
      }
    }

    const rows = await pool.query(
      `SELECT id, mail_kind, subject, body, created_at, read_at
       FROM kingdom_mail
       WHERE kingdom_id=$1
         AND ($3='all' OR LOWER(mail_kind)=LOWER($3))
       ORDER BY created_at DESC
       LIMIT $2`,
      [kingdomId, limit, filterKind],
    );
    const unread = await pool.query(
      `SELECT COUNT(*)::int AS n
       FROM kingdom_mail
       WHERE kingdom_id=$1
         AND read_at IS NULL
         AND ($2='all' OR LOWER(mail_kind)=LOWER($2))`,
      [kingdomId, filterKind],
    );
    return res.json({ ok: true, unread: Number(unread.rows[0]?.n || 0), kind: filterKind, items: rows.rows });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/pigeons/:kingdom/delete-many", requireAuth, async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  const parsed = z.object({
    ids: z.array(z.number().int().positive()).max(500).optional().default([]),
    kind: z.enum(["all", "system", "attack", "spy", "player"]).optional().default("all"),
    tab: z.enum(["inbox", "outbox", "any"]).optional().default("any"),
  }).safeParse(req.body || {});
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });
  const session = (req as any).authSession;
  try {
    const out = await withTx(async (c) => {
      const own = await c.query(`SELECT id FROM kingdoms WHERE LOWER(name)=LOWER($1) AND user_id=$2 LIMIT 1 FOR UPDATE`, [kingdom, session.user_id]);
      if (!own.rowCount) throw new Error("kingdom not found for your account");
      const premiumQ = await c.query(
        `SELECT premium_started_at, premium_ends_at FROM app_users WHERE id=$1 LIMIT 1`,
        [session.user_id],
      );
      if (!isPremiumActive(premiumQ.rows[0] || null)) throw new Error("premium required for bulk pigeon tools");
      const kingdomId = Number(own.rows[0].id);
      const ids = (parsed.data.ids || []).map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0);
      if (ids.length > 0) {
        const del = await c.query(
          `DELETE FROM kingdom_mail
           WHERE kingdom_id=$1
             AND id = ANY($2::bigint[])
           RETURNING id`,
          [kingdomId, ids],
        );
        return { deleted: del.rowCount || 0 };
      }
      const del = await c.query(
        `DELETE FROM kingdom_mail
         WHERE kingdom_id=$1
           AND ($2='all' OR LOWER(mail_kind)=LOWER($2))
           AND (
             $3='any'
             OR ($3='inbox' AND subject NOT LIKE 'Sent:%')
             OR ($3='outbox' AND subject LIKE 'Sent:%')
           )
         RETURNING id`,
        [kingdomId, parsed.data.kind, parsed.data.tab],
      );
      return { deleted: del.rowCount || 0 };
    });
    return res.json({ ok: true, ...out });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/pigeons/:kingdom/send", requireAuth, async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  const parsed = sendPigeonBody.safeParse(req.body || {});
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });
  try {
    const out = await withTx(async (c) => {
      const fromQ = await c.query(`SELECT id, name FROM kingdoms WHERE LOWER(name)=LOWER($1) LIMIT 1`, [kingdom]);
      if (!fromQ.rowCount) throw new Error("sender kingdom not found");
      const toQ = await c.query(`SELECT id, name FROM kingdoms WHERE LOWER(name)=LOWER($1) LIMIT 1`, [parsed.data.toKingdom]);
      if (!toQ.rowCount) throw new Error("target kingdom not found");
      const from = fromQ.rows[0];
      const to = toQ.rows[0];
      if (Number(from.id) === Number(to.id)) throw new Error("cannot send pigeon to yourself");

      const cleanSubject = parsed.data.subject.trim();
      const cleanBody = parsed.data.body.trim();
      await sendMailTx(c, Number(to.id), "player", `${cleanSubject}`, `From ${from.name}\n\n${cleanBody}`);
      await sendMailTx(c, Number(from.id), "player", `Sent: ${cleanSubject}`, `To ${to.name}\n\n${cleanBody}`);
      await sendNoticeTx(c, Number(to.id), "info", `New pigeon from ${from.name}: ${cleanSubject}`, { from: from.name });
      return { to: to.name, subject: cleanSubject };
    });
    return res.json({ ok: true, ...out });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/pigeons/:kingdom/:mailId/read", requireAuth, async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  const mailId = Number(req.params.mailId || 0);
  if (!kingdom || !mailId) return res.status(400).json({ ok: false, error: "kingdom and mailId required" });
  try {
    const out = await withTx(async (c) => {
      const k = await c.query(`SELECT id FROM kingdoms WHERE LOWER(name)=LOWER($1) LIMIT 1`, [kingdom]);
      if (!k.rowCount) throw new Error("kingdom not found");
      const kingdomId = Number(k.rows[0].id);
      await c.query(`UPDATE kingdom_mail SET read_at=COALESCE(read_at, now()) WHERE id=$1 AND kingdom_id=$2`, [mailId, kingdomId]);
      return kingdomId;
    });
    return res.json({ ok: true, kingdomId: out });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/api/notifications/:kingdom", async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  const limit = clamp(Number(req.query.limit || 30), 1, 100);
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });
  try {
    const k = await pool.query(`SELECT id FROM kingdoms WHERE LOWER(name)=LOWER($1) LIMIT 1`, [kingdom]);
    if (!k.rowCount) return res.status(404).json({ ok: false, error: "kingdom not found" });
    const kingdomId = Number(k.rows[0].id);
    const rows = await pool.query(
      `SELECT id, notice_type, message, payload, created_at, seen_at
       FROM kingdom_notifications
       WHERE kingdom_id=$1
       ORDER BY created_at DESC
       LIMIT $2`,
      [kingdomId, limit],
    );
    return res.json({ ok: true, items: rows.rows });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/notifications/:kingdom/ack", requireAuth, async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  const sinceId = Number(req.body?.sinceId || 0);
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });
  try {
    const out = await withTx(async (c) => {
      const k = await c.query(`SELECT id FROM kingdoms WHERE LOWER(name)=LOWER($1) LIMIT 1`, [kingdom]);
      if (!k.rowCount) throw new Error("kingdom not found");
      const kingdomId = Number(k.rows[0].id);
      if (sinceId > 0) {
        await c.query(`UPDATE kingdom_notifications SET seen_at=now() WHERE kingdom_id=$1 AND id <= $2 AND seen_at IS NULL`, [kingdomId, sinceId]);
      } else {
        await c.query(`UPDATE kingdom_notifications SET seen_at=now() WHERE kingdom_id=$1 AND seen_at IS NULL`, [kingdomId]);
      }
      return kingdomId;
    });
    return res.json({ ok: true, kingdomId: out });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/kingdom/:name/daily-bonus/claim", requireAuth, async (req, res) => {
  const name = String(req.params.name || "").trim();
  if (!name) return res.status(400).json({ ok: false, error: "kingdom name required" });

  try {
    const out = await withTx(async (c) => {
      const k = await c.query(
        `SELECT id, name, gold, food, wood, stone, daily_login_streak, daily_last_claimed_at
         FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`,
        [name],
      );
      if (!k.rowCount) throw new Error("kingdom not found");
      const row = k.rows[0];
      const now = new Date();
      const last = row.daily_last_claimed_at ? new Date(row.daily_last_claimed_at) : null;
      if (last && last.toDateString() === now.toDateString()) {
        return { claimed: false, message: "daily bonus already claimed today", streak: Number(row.daily_login_streak || 0) };
      }

      const yesterday = new Date(now.getTime() - 24 * 3600 * 1000).toDateString();
      const continued = last ? last.toDateString() === yesterday : false;
      const nextStreak = continued ? Number(row.daily_login_streak || 0) + 1 : 1;
      const streakUsed = clamp(nextStreak, 1, DAILY_STREAK_CAP);
      const scale = 1 + Math.log2(1 + streakUsed) * 0.2;
      const randomMult = 0.9 + Math.random() * 0.2;

      const gold = Math.min(900000, Math.floor(3500 * scale * randomMult));
      const food = Math.min(1200000, Math.floor(4500 * scale * randomMult));
      const wood = Math.min(500000, Math.floor(1700 * scale * randomMult));
      const stone = Math.min(500000, Math.floor(1700 * scale * randomMult));
      const horses = Math.min(12000, Math.floor(25 * Math.sqrt(streakUsed) * randomMult));

      await c.query(
        `UPDATE kingdoms
         SET gold=gold+$2, food=food+$3, wood=wood+$4, stone=stone+$5, horses=horses+$6,
             daily_login_streak=$7, daily_last_claimed_at=now()
         WHERE id=$1`,
        [row.id, gold, food, wood, stone, horses, nextStreak],
      );
      const subject = `Daily Bonus Day ${nextStreak}`;
      const body = `Daily bonus granted.\nStreak: ${nextStreak}\nGold +${gold.toLocaleString()}\nFood +${food.toLocaleString()}\nWood +${wood.toLocaleString()}\nStone +${stone.toLocaleString()}\nHorses +${horses.toLocaleString()}`;
      await sendMailTx(c, Number(row.id), "system", subject, body);
      await sendNoticeTx(c, Number(row.id), "success", `Daily bonus claimed: +${gold.toLocaleString()} gold, +${food.toLocaleString()} food`, { streak: nextStreak });
      return { claimed: true, streak: nextStreak, rewards: { gold, food, wood, stone, horses } };
    });
    return res.json({ ok: true, ...out });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/api/research/:kingdom", async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });

  try {
    const k = await pool.query(`SELECT id, name, gold FROM kingdoms WHERE LOWER(name)=LOWER($1) LIMIT 1`, [kingdom]);
    if (!k.rowCount) return res.status(404).json({ ok: false, error: "kingdom not found" });
    const kingdomRow = k.rows[0];

    const skills = await pool.query(
      `SELECT code, name, category, effect_text, effect_per_level, base_gold, base_seconds, max_level
       FROM research_types
       ORDER BY category, name`,
    );
    const levels = await pool.query(`SELECT research_code, level FROM kingdom_research WHERE kingdom_id=$1`, [kingdomRow.id]);
    const queue = await pool.query(
      `SELECT id, research_code, target_level, started_at, completes_at, status
       FROM research_queue
       WHERE kingdom_id=$1 AND status='queued'
       ORDER BY completes_at ASC`,
      [kingdomRow.id],
    );
    const prereqs = await pool.query(
      `SELECT rp.research_code, rp.prereq_code, rp.required_level, rt.name AS prereq_name
       FROM research_prereqs rp
       JOIN research_types rt ON rt.code = rp.prereq_code`,
    );

    const levelMap = new Map<string, number>();
    for (const l of levels.rows) levelMap.set(String(l.research_code), Number(l.level || 0));
    const queuedSet = new Set(queue.rows.map((q) => String(q.research_code)));
    const prereqMap = new Map<string, any[]>();
    for (const p of prereqs.rows) {
      const key = String(p.research_code);
      if (!prereqMap.has(key)) prereqMap.set(key, []);
      prereqMap.get(key)!.push({
        code: p.prereq_code,
        name: p.prereq_name,
        requiredLevel: Number(p.required_level || 0),
        currentLevel: Number(levelMap.get(String(p.prereq_code)) || 0),
      });
    }

    const items = skills.rows.map((s) => {
      const code = String(s.code);
      const currentLevel = Number(levelMap.get(code) || 0);
      const maxLevel = Number(s.max_level || 10);
      const nextLevel = Math.min(maxLevel, currentLevel + 1);
      const reqs = prereqMap.get(code) || [];
      const missing = reqs.filter((r) => Number(r.currentLevel || 0) < Number(r.requiredLevel || 0));
      const isMaxed = currentLevel >= maxLevel;
      const nextGold = isMaxed ? 0 : researchGoldCost(Number(s.base_gold || 0), currentLevel);
      const nextSeconds = isMaxed ? 0 : researchSeconds(Number(s.base_seconds || 0), currentLevel, LOCAL_DEMO_FAST ? FAST_RESEARCH_SECONDS : undefined);
      const queueSlotsUsed = queue.rows.length;
      const canResearch = !isMaxed && missing.length === 0 && !queuedSet.has(code) && queueSlotsUsed < 2 && Number(kingdomRow.gold || 0) >= nextGold;
      return {
        code,
        name: s.name,
        category: s.category,
        effectText: s.effect_text,
        effectPerLevel: Number(s.effect_per_level || 0),
        currentLevel,
        nextLevel,
        maxLevel,
        currentEffect: Number((Number(s.effect_per_level || 0) * currentLevel).toFixed(4)),
        nextEffect: Number((Number(s.effect_per_level || 0) * nextLevel).toFixed(4)),
        nextGold,
        nextSeconds,
        isQueued: queuedSet.has(code),
        missingPrereqs: missing,
        prereqs: reqs,
        canResearch,
      };
    });

    return res.json({
      ok: true,
      kingdom: { id: kingdomRow.id, name: kingdomRow.name, gold: Number(kingdomRow.gold || 0) },
      queueSlotsUsed: queue.rows.length,
      queueSlotsMax: 2,
      queue: queue.rows,
      items,
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/research/:kingdom/start", requireAuth, async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  const parsed = researchStartBody.safeParse(req.body);
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });

  const researchCode = String(parsed.data.researchCode || "").toLowerCase().trim();
  if (!researchCode) return res.status(400).json({ ok: false, error: "researchCode required" });

  try {
    const out = await withTx(async (c) => {
      const k = await c.query(`SELECT id, name, gold FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`, [kingdom]);
      if (!k.rowCount) throw new Error("kingdom not found");
      const kr = k.rows[0];

      const active = await c.query(`SELECT COUNT(*)::int AS n FROM research_queue WHERE kingdom_id=$1 AND status='queued'`, [kr.id]);
      const activeN = Number(active.rows[0]?.n || 0);
      if (activeN >= 2) throw new Error("research queue full (max 2)");

      const r = await c.query(
        `SELECT code, name, base_gold, base_seconds, max_level
         FROM research_types
         WHERE code=$1
         LIMIT 1`,
        [researchCode],
      );
      if (!r.rowCount) throw new Error("unknown research code");
      const def = r.rows[0];

      const cur = await c.query(`SELECT level FROM kingdom_research WHERE kingdom_id=$1 AND research_code=$2 LIMIT 1`, [kr.id, researchCode]);
      const curLevel = Number(cur.rows[0]?.level || 0);
      const maxLevel = Number(def.max_level || 10);
      if (curLevel >= maxLevel) throw new Error("research already maxed");

      const alreadyQueued = await c.query(
        `SELECT 1 FROM research_queue WHERE kingdom_id=$1 AND research_code=$2 AND status='queued' LIMIT 1`,
        [kr.id, researchCode],
      );
      if (alreadyQueued.rowCount) throw new Error("research already queued");

      const prereqs = await c.query(
        `SELECT prereq_code, required_level FROM research_prereqs WHERE research_code=$1`,
        [researchCode],
      );
      for (const p of prereqs.rows) {
        const have = await c.query(
          `SELECT level FROM kingdom_research WHERE kingdom_id=$1 AND research_code=$2 LIMIT 1`,
          [kr.id, p.prereq_code],
        );
        const haveLevel = Number(have.rows[0]?.level || 0);
        const needLevel = Number(p.required_level || 0);
        if (haveLevel < needLevel) {
          throw new Error(`missing prerequisite: ${String(p.prereq_code)} (${haveLevel}/${needLevel})`);
        }
      }

      const goldCost = researchGoldCost(Number(def.base_gold || 0), curLevel);
      if (Number(kr.gold || 0) < goldCost) throw new Error(`not enough gold (need ${goldCost})`);

      await c.query(`UPDATE kingdoms SET gold = gold - $2 WHERE id=$1`, [kr.id, goldCost]);
      const seconds = researchSeconds(Number(def.base_seconds || 3600), curLevel, LOCAL_DEMO_FAST ? FAST_RESEARCH_SECONDS : undefined);
      const targetLevel = curLevel + 1;
      const ins = await c.query(
        `
        INSERT INTO research_queue(kingdom_id, research_code, target_level, started_at, completes_at, status)
        VALUES ($1,$2,$3,now(), now() + ($4 * INTERVAL '1 second'), 'queued')
        RETURNING id, research_code, target_level, started_at, completes_at, status
        `,
        [kr.id, researchCode, targetLevel, seconds],
      );

      return { queue: ins.rows[0], costGold: goldCost };
    });

    return res.json({ ok: true, ...out });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/api/settlements/:kingdom", async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });
  try {
    const k = await pool.query(`SELECT id, name, land, gold, wood, stone FROM kingdoms WHERE LOWER(name)=LOWER($1) LIMIT 1`, [kingdom]);
    if (!k.rowCount) return res.status(404).json({ ok: false, error: "kingdom not found" });
    const kr = k.rows[0];

    await withTx(async (c) => {
      await ensureSettlementsForKingdom(c, Number(kr.id), String(kr.name), Number(kr.land || 0));
      return 0;
    });

    const settlements = await pool.query(
      `SELECT id, name, settlement_type, level, slots_total, wellbeing, wall_level, captured_from_kingdom_id, created_at
       FROM settlements
       WHERE kingdom_id=$1
       ORDER BY id ASC`,
      [kr.id],
    );
    const buildings = await pool.query(
      `
      SELECT sb.id, sb.settlement_id, sb.building_code, sb.level, bt.name, bt.effect_text, bt.base_gold, bt.base_stone, bt.base_wood, bt.required_settlement_size, bt.base_build_seconds, bt.max_level, bt.city_only
      FROM settlement_buildings sb
      JOIN settlement_building_types bt ON bt.code = sb.building_code
      JOIN settlements s ON s.id = sb.settlement_id
      WHERE s.kingdom_id = $1 AND sb.level > 0
      ORDER BY sb.settlement_id, sb.building_code, sb.id
      `,
      [kr.id],
    );
    const queue = await pool.query(
      `
      SELECT id, settlement_id, building_code, target_level, settlement_building_id, started_at, completes_at, status
      FROM settlement_build_queue
      WHERE kingdom_id=$1 AND status='queued'
      ORDER BY completes_at ASC
      `,
      [kr.id],
    );
    const catalog = await pool.query(
      `SELECT code, name, effect_text, base_gold, base_stone, base_wood, required_settlement_size, base_build_seconds, max_level, city_only
       FROM settlement_building_types
       ORDER BY name`,
    );

    const garrison = await pool.query(
      `
      SELECT sg.settlement_id, sg.troop_code, tt.name AS troop_name, sg.amount
      FROM settlement_garrison sg
      JOIN settlements s ON s.id = sg.settlement_id
      JOIN troop_types tt ON tt.code = sg.troop_code
      WHERE s.kingdom_id = $1
      ORDER BY sg.settlement_id, sg.troop_code
      `,
      [kr.id],
    );

    const maintenance = await pool.query(
      `
      SELECT
        sb.settlement_id,
        FLOOR(SUM((bt.base_gold::numeric * sb.level::numeric) * 0.0001))::bigint AS gold,
        FLOOR(SUM((bt.base_stone::numeric * sb.level::numeric) * 0.0001))::bigint AS stone,
        FLOOR(SUM((bt.base_wood::numeric * sb.level::numeric) * 0.0001))::bigint AS wood
      FROM settlement_buildings sb
      JOIN settlement_building_types bt ON bt.code = sb.building_code
      JOIN settlements s ON s.id = sb.settlement_id
      WHERE s.kingdom_id = $1 AND sb.level > 0
      GROUP BY sb.settlement_id
      `,
      [kr.id],
    );
    const maintMap = new Map<number, { gold: number; stone: number; wood: number }>();
    for (const m of maintenance.rows) {
      maintMap.set(Number(m.settlement_id), {
        gold: Number(m.gold || 0),
        stone: Number(m.stone || 0),
        wood: Number(m.wood || 0),
      });
    }

    const garrisonMap = new Map<number, Array<{ troopCode: string; troopName: string; amount: number }>>();
    for (const g of garrison.rows) {
      const sid = Number(g.settlement_id);
      const cur = garrisonMap.get(sid) || [];
      cur.push({
        troopCode: String(g.troop_code),
        troopName: String(g.troop_name),
        amount: Number(g.amount || 0),
      });
      garrisonMap.set(sid, cur);
    }

    const settlementsWithMeta = settlements.rows.map((s, idx) => {
      const sid = Number(s.id);
      const gRows = garrisonMap.get(sid) || [];
      const footmen = gRows
        .filter((g) => String(g.troopCode) === "footmen")
        .reduce((a, g) => a + Number(g.amount || 0), 0);
      const garrisonWellbeingBonus = Math.floor(footmen / 100);
      const baseWellbeing = Number(s.wellbeing || 0);
      return {
        ...s,
        isCapital: idx === 0,
        maintenance: maintMap.get(sid) || { gold: 0, stone: 0, wood: 0 },
        garrison: gRows,
        garrisonWellbeingBonus,
        wellbeing: baseWellbeing + garrisonWellbeingBonus,
        baseWellbeing,
      };
    });
    const avgWellbeing = settlementsWithMeta.length
      ? Math.floor(settlementsWithMeta.reduce((a, s) => a + Number(s.wellbeing || 0), 0) / settlementsWithMeta.length)
      : 0;
    const totalSettlementRank = settlementsWithMeta.reduce((a, s) => a + Number(s.level || 0), 0);
    const plan = expectedSettlementPlan(Number(kr.land || 0));
    const settlementSlots = Array.from({ length: plan.types.length }, (_v, i) => {
      const built = settlementsWithMeta[i];
      if (built) return { ...built, isBuilt: true };
      const t = plan.types[i];
      const def = SETTLEMENT_TYPE_DEF[t];
      const slots = i === 0 ? Math.floor(def.slots * 1.3) : def.slots;
      return {
        isBuilt: false,
        isCapital: i === 0,
        slotIndex: i,
        settlement_type: t,
        requiredType: settlementTypeDisplay(def.level),
        level: def.level,
        slots_total: slots,
        wellbeing: 0,
        baseWellbeing: 0,
        garrisonWellbeingBonus: 0,
        maintenance: { gold: 0, stone: 0, wood: 0 },
        garrison: [],
      };
    });

    const catalogWithReq = catalog.rows.map((r) => ({
      ...r,
      requiredSettlementType: settlementTypeDisplay(Math.max(1, Number(r.required_settlement_size || 1))),
    }));

    return res.json({
      ok: true,
      kingdom: { id: kr.id, name: kr.name, land: Number(kr.land || 0), gold: Number(kr.gold || 0), wood: Number(kr.wood || 0), stone: Number(kr.stone || 0) },
      settlements: settlementsWithMeta,
      settlementSlots,
      buildings: buildings.rows,
      queue: queue.rows,
      catalog: catalogWithReq,
      unlockedByLand: plan.types.length,
      unlockPlan: plan.types,
      averageWellbeing: avgWellbeing,
      totalSettlementRank,
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/api/settlements/:kingdom/building-types", async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });
  try {
    const k = await pool.query(`SELECT id, land FROM kingdoms WHERE LOWER(name)=LOWER($1) LIMIT 1`, [kingdom]);
    if (!k.rowCount) return res.status(404).json({ ok: false, error: "kingdom not found" });
    const rows = await pool.query(
      `
      SELECT code, name, effect_text, base_gold, base_stone, base_wood, required_settlement_size, base_build_seconds, max_level, city_only
      FROM settlement_building_types
      ORDER BY name
      `,
    );
    return res.json({
      ok: true,
      types: rows.rows.map((r) => ({
        ...r,
        requiredSettlementType: settlementTypeDisplay(Math.max(1, Number(r.required_settlement_size || 1))),
      })),
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/settlements/:kingdom/found", requireAuth, async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  const parsed = settlementFoundBody.safeParse(req.body || {});
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });
  const name = String(parsed.data.name || "").trim();

  try {
    const out = await withTx(async (c) => {
      const k = await c.query(`SELECT id, name, land FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`, [kingdom]);
      if (!k.rowCount) throw new Error("kingdom not found");
      const kr = k.rows[0];

      await ensureSettlementsForKingdom(c, Number(kr.id), String(kr.name), Number(kr.land || 0));
      const plan = expectedSettlementPlan(Number(kr.land || 0));
      if (!plan.types.length) throw new Error("kingdom too small to support settlements");

      const existing = await c.query(`SELECT id FROM settlements WHERE kingdom_id=$1 ORDER BY id ASC`, [kr.id]);
      const slotIndex = Number(existing.rowCount || 0);
      if (slotIndex >= plan.types.length) throw new Error("no free settlement slots available");

      const settlementType = plan.types[slotIndex];
      const def = SETTLEMENT_TYPE_DEF[settlementType];
      const slots = slotIndex === 0 ? Math.floor(def.slots * 1.3) : def.slots;
      const ins = await c.query(
        `INSERT INTO settlements(kingdom_id, name, settlement_type, level, slots_total, wellbeing, wall_level)
         VALUES ($1,$2,$3,$4,$5,0,0)
         RETURNING id, name, settlement_type, level, slots_total, wellbeing, wall_level`,
        [kr.id, name, settlementType, def.level, slots],
      );
      const settlementId = Number(ins.rows[0].id);
      await c.query(`INSERT INTO settlement_history(settlement_id, item, datetime) VALUES ($1,$2,now())`, [settlementId, "Settlement founded"]);
      return ins.rows[0];
    });
    return res.json({ ok: true, settlement: out });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/settlements/:kingdom/build-building", requireAuth, async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  const parsed = settlementBuildBody.safeParse(req.body || {});
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });
  const settlementId = Number(parsed.data.settlementId);
  const buildingCode = String(parsed.data.buildingCode || "").toLowerCase();

  try {
    const out = await withTx(async (c) => {
      const k = await c.query(`SELECT id, gold, stone, wood FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`, [kingdom]);
      if (!k.rowCount) throw new Error("kingdom not found");
      const kr = k.rows[0];
      const s = await c.query(`SELECT id, settlement_type, level, slots_total FROM settlements WHERE id=$1 AND kingdom_id=$2 FOR UPDATE`, [settlementId, kr.id]);
      if (!s.rowCount) throw new Error("settlement not found");
      const st = s.rows[0];

      const bt = await c.query(
        `
        SELECT code, name, base_gold, base_stone, base_wood, required_settlement_size, base_build_seconds, city_only
        FROM settlement_building_types
        WHERE code=$1
        LIMIT 1
        `,
        [buildingCode],
      );
      if (!bt.rowCount) throw new Error("unknown settlement building");
      const def = bt.rows[0];
      const isCity = String(st.settlement_type || "").includes("city");
      if (Boolean(def.city_only) && !isCity) throw new Error("building requires a city settlement");
      if (Number(st.level || 1) < Number(def.required_settlement_size || 1)) {
        throw new Error(
          `building requires settlement size ${Number(def.required_settlement_size || 1)} (${settlementTypeDisplay(Number(def.required_settlement_size || 1))})`,
        );
      }

      const slotCheck = await c.query(
        `SELECT
          (SELECT COUNT(*) FROM settlement_buildings WHERE settlement_id=$1) +
          (SELECT COUNT(*) FROM settlement_build_queue WHERE settlement_id=$1 AND status='queued' AND settlement_building_id IS NULL) AS used`,
        [settlementId],
      );
      const usedSlots = Number(slotCheck.rows[0]?.used || 0);
      const totalSlots = Number(st.slots_total || 3);
      if (usedSlots >= totalSlots) throw new Error(`settlement is full (${usedSlots}/${totalSlots} slots used)`);

      const costGold = Math.floor(Number(def.base_gold || 0));
      const costStone = Math.floor(Number(def.base_stone || 0));
      const costWood = Math.floor(Number(def.base_wood || 0));
      if (Number(kr.gold || 0) < costGold || Number(kr.stone || 0) < costStone || Number(kr.wood || 0) < costWood) {
        throw new Error(`not enough resources (need gold ${costGold}, stone ${costStone}, wood ${costWood})`);
      }

      await c.query(`UPDATE kingdoms SET gold=gold-$2, stone=stone-$3, wood=wood-$4 WHERE id=$1`, [kr.id, costGold, costStone, costWood]);
      const seconds = LOCAL_DEMO_FAST ? 20 : Math.max(300, Number(def.base_build_seconds || 10800));
      const q = await c.query(
        `
        INSERT INTO settlement_build_queue(kingdom_id, settlement_id, building_code, target_level, settlement_building_id, started_at, completes_at, status)
        VALUES ($1,$2,$3,1,NULL,now(), now() + ($4 * INTERVAL '1 second'), 'queued')
        RETURNING id, settlement_id, building_code, target_level, started_at, completes_at, status
        `,
        [kr.id, settlementId, buildingCode, seconds],
      );
      await c.query(`INSERT INTO settlement_history(settlement_id, item, datetime) VALUES ($1,$2,now())`, [settlementId, `Started building ${String(def.name)}`]);
      return q.rows[0];
    });
    return res.json({ ok: true, queue: out });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/settlements/:kingdom/upgrade-cost", requireAuth, async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  const parsed = settlementUpgradeCostBody.safeParse(req.body || {});
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });
  const settlementId = Number(parsed.data.settlementId);
  const buildingCode = String(parsed.data.buildingCode || "").toLowerCase();

  try {
    const out = await withTx(async (c) => {
      const k = await c.query(`SELECT id, gold, stone, wood FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`, [kingdom]);
      if (!k.rowCount) throw new Error("kingdom not found");
      const kr = k.rows[0];
      const s = await c.query(`SELECT id, level, settlement_type FROM settlements WHERE id=$1 AND kingdom_id=$2 FOR UPDATE`, [settlementId, kr.id]);
      if (!s.rowCount) throw new Error("settlement not found");
      const st = s.rows[0];
      const bt = await c.query(
        `SELECT code, name, base_gold, base_stone, base_wood, max_level, city_only, required_settlement_size, base_build_seconds
         FROM settlement_building_types
         WHERE code=$1 LIMIT 1`,
        [buildingCode],
      );
      if (!bt.rowCount) throw new Error("unknown settlement building");
      const def = bt.rows[0];
      const isCity = String(st.settlement_type || "").includes("city");
      if (Boolean(def.city_only) && !isCity) throw new Error("building requires a city settlement");
      if (Number(st.level || 1) < Number(def.required_settlement_size || 1)) {
        throw new Error(
          `building requires settlement size ${Number(def.required_settlement_size || 1)} (${settlementTypeDisplay(Number(def.required_settlement_size || 1))})`,
        );
      }
      const sb = await c.query(`SELECT level FROM settlement_buildings WHERE settlement_id=$1 AND building_code=$2 LIMIT 1`, [settlementId, buildingCode]);
      const currentLevel = Number(sb.rows[0]?.level || 0);
      const effectiveMax = Math.min(Number(def.max_level || 10), Math.max(1, Number(st.level || 1)));
      if (currentLevel >= effectiveMax) throw new Error(`building already maxed for settlement level (max ${effectiveMax})`);
      const nextLevel = currentLevel + 1;
      const costGold = Math.floor(Number(def.base_gold || 0));
      const costStone = Math.floor(Number(def.base_stone || 0));
      const costWood = Math.floor(Number(def.base_wood || 0));
      const secondsBase = Math.max(300, Number(def.base_build_seconds || 10800));
      const seconds = LOCAL_DEMO_FAST ? 20 : Math.floor(secondsBase * Math.pow(1.2, currentLevel));
      return {
        buildingCode,
        buildingName: String(def.name),
        currentLevel,
        nextLevel,
        maxForSettlement: effectiveMax,
        costs: { gold: costGold, stone: costStone, wood: costWood },
        hasEnough: {
          gold: Number(kr.gold || 0) >= costGold,
          stone: Number(kr.stone || 0) >= costStone,
          wood: Number(kr.wood || 0) >= costWood,
        },
        buildSeconds: seconds,
      };
    });
    return res.json({ ok: true, ...out });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/settlements/:kingdom/destroy-building", requireAuth, async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  const parsed = settlementDestroyBody.safeParse(req.body || {});
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });
  const settlementId = Number(parsed.data.settlementId);
  const buildingId = Number(parsed.data.buildingId);

  try {
    const out = await withTx(async (c) => {
      const k = await c.query(`SELECT id FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`, [kingdom]);
      if (!k.rowCount) throw new Error("kingdom not found");
      const kr = k.rows[0];
      const s = await c.query(`SELECT id FROM settlements WHERE id=$1 AND kingdom_id=$2 FOR UPDATE`, [settlementId, kr.id]);
      if (!s.rowCount) throw new Error("settlement not found");
      const sb = await c.query(`SELECT id, building_code, level FROM settlement_buildings WHERE id=$1 AND settlement_id=$2 FOR UPDATE`, [buildingId, settlementId]);
      if (!sb.rowCount) throw new Error("building not found");
      const buildingCode = String(sb.rows[0].building_code || "");
      await c.query(`DELETE FROM settlement_buildings WHERE id=$1`, [buildingId]);
      await c.query(`UPDATE settlements SET wellbeing = wellbeing - 50 WHERE id=$1`, [settlementId]);
      await c.query(`INSERT INTO settlement_history(settlement_id, item, datetime) VALUES ($1,$2,now())`, [settlementId, `Demolished ${buildingCode.replaceAll("_", " ")}`]);
      return true;
    });
    return res.json({ ok: true, result: out });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/settlements/:kingdom/upgrade-building", requireAuth, async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  const parsed = settlementUpgradeBody.safeParse(req.body);
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });
  const { settlementId, buildingId } = parsed.data;

  try {
    const out = await withTx(async (c) => {
      const k = await c.query(`SELECT id, name, gold, wood, stone FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`, [kingdom]);
      if (!k.rowCount) throw new Error("kingdom not found");
      const kr = k.rows[0];

      const s = await c.query(
        `SELECT id, settlement_type, level FROM settlements WHERE id=$1 AND kingdom_id=$2 FOR UPDATE`,
        [settlementId, kr.id],
      );
      if (!s.rowCount) throw new Error("settlement not found");
      const st = s.rows[0];

      const sb = await c.query(
        `SELECT id, building_code, level FROM settlement_buildings WHERE id=$1 AND settlement_id=$2 FOR UPDATE`,
        [buildingId, settlementId],
      );
      if (!sb.rowCount) throw new Error("building not found");
      const currentLevel = Number(sb.rows[0].level || 0);
      const buildingCode = String(sb.rows[0].building_code || "");

      const bt = await c.query(
        `SELECT code, name, base_gold, base_stone, base_wood, max_level, city_only, required_settlement_size, base_build_seconds
         FROM settlement_building_types WHERE code=$1 LIMIT 1`,
        [buildingCode],
      );
      if (!bt.rowCount) throw new Error("unknown settlement building");
      const def = bt.rows[0];

      const isCity = String(st.settlement_type || "").includes("city");
      if (Boolean(def.city_only) && !isCity) throw new Error("building requires a city settlement");

      const settlementLevelCap = Math.max(1, Number(st.level || 1));
      const effectiveMax = Math.min(Number(def.max_level || 10), settlementLevelCap);
      if (currentLevel >= effectiveMax) throw new Error(`building already maxed for settlement level (max ${effectiveMax})`);

      const inQueue = await c.query(
        `SELECT 1 FROM settlement_build_queue WHERE settlement_building_id=$1 AND status='queued' LIMIT 1`,
        [buildingId],
      );
      if (inQueue.rowCount) throw new Error("building already queued for upgrade");

      const nextLevel = currentLevel + 1;
      const costGold = Math.floor(Number(def.base_gold || 0));
      const costStone = Math.floor(Number(def.base_stone || 0));
      const costWood = Math.floor(Number(def.base_wood || 0));
      if (Number(kr.gold || 0) < costGold || Number(kr.stone || 0) < costStone || Number(kr.wood || 0) < costWood) {
        throw new Error(`not enough resources (need gold ${costGold}, stone ${costStone}, wood ${costWood})`);
      }

      await c.query(`UPDATE kingdoms SET gold=gold-$2, stone=stone-$3, wood=wood-$4 WHERE id=$1`, [kr.id, costGold, costStone, costWood]);
      const secondsBase = Math.max(300, Number(def.base_build_seconds || 10800));
      const seconds = LOCAL_DEMO_FAST ? 20 : Math.floor(secondsBase * Math.pow(1.2, currentLevel));
      const ins = await c.query(
        `
        INSERT INTO settlement_build_queue(kingdom_id, settlement_id, building_code, target_level, settlement_building_id, started_at, completes_at, status)
        VALUES ($1,$2,$3,$4,$5,now(), now() + ($6 * INTERVAL '1 second'), 'queued')
        RETURNING id, settlement_id, building_code, target_level, settlement_building_id, started_at, completes_at, status
        `,
        [kr.id, settlementId, def.code, nextLevel, buildingId, seconds],
      );

      await c.query(
        `INSERT INTO settlement_history(settlement_id, item, datetime) VALUES ($1,$2,now())`,
        [settlementId, `Started upgrading ${String(def.name)} to level ${nextLevel}`],
      );

      return { queue: ins.rows[0], costs: { gold: costGold, stone: costStone, wood: costWood } };
    });
    return res.json({ ok: true, ...out });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/settlements/:kingdom/cancel-build", requireAuth, async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  const parsed = queueCancelBody.safeParse(req.body || {});
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });
  const queueId = Number(parsed.data.queueId);

  try {
    const out = await withTx(async (c) => {
      const k = await c.query(`SELECT id FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`, [kingdom]);
      if (!k.rowCount) throw new Error("kingdom not found");
      const kingdomId = Number(k.rows[0].id);

      const q = await c.query(
        `
        SELECT q.id, q.settlement_id, q.building_code, q.target_level, q.settlement_building_id,
               bt.name AS building_name, bt.base_gold, bt.base_stone, bt.base_wood
        FROM settlement_build_queue q
        JOIN settlements s ON s.id = q.settlement_id
        JOIN settlement_building_types bt ON bt.code = q.building_code
        WHERE q.id = $1 AND q.kingdom_id = $2 AND s.kingdom_id = $2 AND q.status = 'queued'
        FOR UPDATE
        `,
        [queueId, kingdomId],
      );
      if (!q.rowCount) throw new Error("settlement queue item not found or already processed");
      const row = q.rows[0];

      const baseGold = Number(row.base_gold || 0);
      const baseStone = Number(row.base_stone || 0);
      const baseWood = Number(row.base_wood || 0);
      const targetLevel = Number(row.target_level || 1);

      let refundGold = 0;
      let refundStone = 0;
      let refundWood = 0;

      refundGold = Math.floor(baseGold);
      refundStone = Math.floor(baseStone);
      refundWood = Math.floor(baseWood);

      await c.query(`UPDATE settlement_build_queue SET status='cancelled', completed_at=now() WHERE id=$1 AND status='queued'`, [queueId]);
      await c.query(`UPDATE kingdoms SET gold = gold + $2, stone = stone + $3, wood = wood + $4 WHERE id=$1`, [kingdomId, refundGold, refundStone, refundWood]);
      await c.query(
        `INSERT INTO settlement_history(settlement_id, item, datetime) VALUES ($1,$2,now())`,
        [
          Number(row.settlement_id),
          row.settlement_building_id
            ? `Cancelled ${String(row.building_name || row.building_code)} upgrade`
            : `Cancelled ${String(row.building_name || row.building_code)} construction`,
        ],
      );

      return {
        queueId,
        settlementId: Number(row.settlement_id),
        buildingCode: String(row.building_code || ""),
        buildingName: String(row.building_name || row.building_code || ""),
        targetLevel,
        isUpgrade: Boolean(row.settlement_building_id),
        refunds: { gold: Math.max(0, refundGold), stone: Math.max(0, refundStone), wood: Math.max(0, refundWood) },
      };
    });
    return res.json({ ok: true, ...out });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/settlements/:kingdom/history", requireAuth, async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  const parsed = settlementHistoryBody.safeParse(req.body || {});
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });
  const settlementId = Number(parsed.data.settlementId);
  try {
    const k = await pool.query(`SELECT id FROM kingdoms WHERE LOWER(name)=LOWER($1) LIMIT 1`, [kingdom]);
    if (!k.rowCount) return res.status(404).json({ ok: false, error: "kingdom not found" });
    const check = await pool.query(`SELECT 1 FROM settlements WHERE id=$1 AND kingdom_id=$2 LIMIT 1`, [settlementId, k.rows[0].id]);
    if (!check.rowCount) return res.status(404).json({ ok: false, error: "settlement not found" });
    const items = await pool.query(
      `SELECT item, datetime FROM settlement_history WHERE settlement_id=$1 ORDER BY datetime DESC LIMIT 200`,
      [settlementId],
    );
    return res.json({ ok: true, items: items.rows });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/api/settlements/:kingdom/:settlementId/garrison", async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  const settlementId = Number(req.params.settlementId);
  if (!kingdom || !settlementId) return res.status(400).json({ ok: false, error: "kingdom and settlementId required" });
  try {
    const k = await pool.query(`SELECT id FROM kingdoms WHERE LOWER(name)=LOWER($1) LIMIT 1`, [kingdom]);
    if (!k.rowCount) return res.status(404).json({ ok: false, error: "kingdom not found" });
    const s = await pool.query(`SELECT id FROM settlements WHERE id=$1 AND kingdom_id=$2 LIMIT 1`, [settlementId, k.rows[0].id]);
    if (!s.rowCount) return res.status(404).json({ ok: false, error: "settlement not found" });
    const rows = await pool.query(
      `
      SELECT sg.settlement_id, sg.troop_code, tt.name AS name, sg.amount
      FROM settlement_garrison sg
      JOIN troop_types tt ON tt.code = sg.troop_code
      WHERE sg.settlement_id=$1
      ORDER BY sg.troop_code
      `,
      [settlementId],
    );
    return res.json({ ok: true, troops: rows.rows });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/settlements/:kingdom/garrison/add", requireAuth, async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  const parsed = settlementGarrisonBody.safeParse(req.body || {});
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });

  try {
    const out = await withTx(async (c) => {
      const k = await c.query(`SELECT id FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`, [kingdom]);
      if (!k.rowCount) throw new Error("kingdom not found");
      const kingdomId = Number(k.rows[0].id);
      const settlementId = Number(parsed.data.settlementId);
      const troopCode = String(parsed.data.troopCode).toLowerCase();
      const amount = Number(parsed.data.amount);

      const s = await c.query(`SELECT id FROM settlements WHERE id=$1 AND kingdom_id=$2 FOR UPDATE`, [settlementId, kingdomId]);
      if (!s.rowCount) throw new Error("settlement not found");

      const barracks = await c.query(
        `SELECT level FROM settlement_buildings WHERE settlement_id=$1 AND building_code='barracks' LIMIT 1`,
        [settlementId],
      );
      if (Number(barracks.rows[0]?.level || 0) < 1) throw new Error("a barracks is required before garrisoning troops");

      const own = await c.query(`SELECT amount FROM kingdom_troops WHERE kingdom_id=$1 AND troop_code=$2 FOR UPDATE`, [kingdomId, troopCode]);
      if (!own.rowCount || Number(own.rows[0].amount || 0) < amount) throw new Error("not enough troops available");

      await c.query(`UPDATE kingdom_troops SET amount=amount-$3 WHERE kingdom_id=$1 AND troop_code=$2`, [kingdomId, troopCode, amount]);
      await c.query(
        `
        INSERT INTO settlement_garrison(settlement_id, troop_code, amount)
        VALUES ($1,$2,$3)
        ON CONFLICT (settlement_id, troop_code) DO UPDATE
        SET amount = settlement_garrison.amount + EXCLUDED.amount
        `,
        [settlementId, troopCode, amount],
      );
      await c.query(
        `INSERT INTO settlement_history(settlement_id, item, datetime) VALUES ($1,$2,now())`,
        [settlementId, `Garrisoned ${amount} ${troopCode.replaceAll("_", " ")}`],
      );
      return true;
    });
    return res.json({ ok: true, result: out });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/settlements/:kingdom/garrison/remove", requireAuth, async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  const parsed = settlementGarrisonBody.safeParse(req.body || {});
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });

  try {
    const out = await withTx(async (c) => {
      const k = await c.query(`SELECT id FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`, [kingdom]);
      if (!k.rowCount) throw new Error("kingdom not found");
      const kingdomId = Number(k.rows[0].id);
      const settlementId = Number(parsed.data.settlementId);
      const troopCode = String(parsed.data.troopCode).toLowerCase();
      const amount = Number(parsed.data.amount);

      const s = await c.query(`SELECT id FROM settlements WHERE id=$1 AND kingdom_id=$2 FOR UPDATE`, [settlementId, kingdomId]);
      if (!s.rowCount) throw new Error("settlement not found");
      const gar = await c.query(`SELECT amount FROM settlement_garrison WHERE settlement_id=$1 AND troop_code=$2 FOR UPDATE`, [settlementId, troopCode]);
      if (!gar.rowCount || Number(gar.rows[0].amount || 0) < amount) throw new Error("not enough garrisoned troops");

      await c.query(`UPDATE settlement_garrison SET amount=amount-$3 WHERE settlement_id=$1 AND troop_code=$2`, [settlementId, troopCode, amount]);
      await c.query(`DELETE FROM settlement_garrison WHERE settlement_id=$1 AND troop_code=$2 AND amount<=0`, [settlementId, troopCode]);
      await c.query(
        `
        INSERT INTO kingdom_troops(kingdom_id, troop_code, amount)
        VALUES ($1,$2,$3)
        ON CONFLICT (kingdom_id, troop_code) DO UPDATE
        SET amount = kingdom_troops.amount + EXCLUDED.amount
        `,
        [kingdomId, troopCode, amount],
      );
      await c.query(
        `INSERT INTO settlement_history(settlement_id, item, datetime) VALUES ($1,$2,now())`,
        [settlementId, `Released ${amount} ${troopCode.replaceAll("_", " ")}`],
      );
      return true;
    });
    return res.json({ ok: true, result: out });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/settlements/:kingdom/rename", requireAuth, async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  const parsed = settlementRenameBody.safeParse(req.body);
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });
  const settlementId = Number(parsed.data.settlementId);
  const name = String(parsed.data.name || "").trim();
  if (!name) return res.status(400).json({ ok: false, error: "name required" });

  try {
    const out = await withTx(async (c) => {
      const k = await c.query(`SELECT id FROM kingdoms WHERE LOWER(name)=LOWER($1) LIMIT 1`, [kingdom]);
      if (!k.rowCount) throw new Error("kingdom not found");
      const kr = k.rows[0];

      const s = await c.query(
        `
        UPDATE settlements
        SET name=$3, wellbeing = wellbeing - 100
        WHERE id=$1 AND kingdom_id=$2
        RETURNING id, name, settlement_type, level, slots_total, wellbeing, wall_level
        `,
        [settlementId, kr.id, name],
      );
      if (!s.rowCount) throw new Error("settlement not found");
      await c.query(
        `INSERT INTO settlement_history(settlement_id, item, datetime) VALUES ($1,$2,now())`,
        [settlementId, `Settlement renamed to ${name}`],
      );
      return s.rows[0];
    });
    return res.json({ ok: true, settlement: out });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

// Public alliance profile — viewable by anyone, no auth required
app.get("/api/alliance/public/:slug", async (req, res) => {
  const slug = String(req.params.slug || "").trim();
  if (!slug) return res.status(400).json({ ok: false, error: "slug required" });

  try {
    const a = await pool.query(
      `SELECT id, slug, name, description, image_url, gallery_images, created_at
       FROM alliances WHERE LOWER(slug)=LOWER($1) OR LOWER(name)=LOWER($1) LIMIT 1`,
      [slug],
    );
    if (!a.rowCount) return res.status(404).json({ ok: false, error: "alliance not found" });
    const al = a.rows[0];
    const allianceId = Number(al.id);

    const members = await pool.query(
      `SELECT am.role, k.name AS kingdom_name, k.land,
              COALESCE((SELECT nw.networth FROM kingdom_networth_history nw WHERE nw.kingdom_id=k.id ORDER BY nw.recorded_at DESC LIMIT 1),0) AS networth
       FROM alliance_members am
       JOIN kingdoms k ON k.id = am.kingdom_id
       WHERE am.alliance_id=$1
       ORDER BY CASE am.role WHEN 'owner' THEN 0 WHEN 'officer' THEN 1 ELSE 2 END, k.land DESC`,
      [allianceId],
    );

    const projects = await pool.query(
      `SELECT ab.building_code, bt.name, bt.effect_text, bt.target_gold, bt.target_stone, bt.target_wood,
              ab.level, ab.progress_gold, ab.progress_stone, ab.progress_wood
       FROM alliance_buildings ab
       JOIN alliance_building_types bt ON bt.code = ab.building_code
       WHERE ab.alliance_id=$1 ORDER BY bt.name ASC`,
      [allianceId],
    );

    return res.json({
      ok: true,
      alliance: {
        id: allianceId,
        slug: al.slug,
        name: al.name,
        description: al.description,
        imageUrl: al.image_url,
        galleryImages: Array.isArray(al.gallery_images) ? (al.gallery_images as string[]) : [],
        createdAt: al.created_at,
        memberCount: members.rowCount,
      },
      members: members.rows.map((row) => ({
        kingdomName: row.kingdom_name,
        role: row.role,
        land: Number(row.land || 0),
        networth: Number(row.networth || 0),
      })),
      projects: projects.rows.map((p) => {
        const level = Number(p.level || 0);
        return {
          buildingCode: p.building_code,
          name: p.name,
          effectText: p.effect_text,
          level,
          targetGold: allianceProjectTarget(Number(p.target_gold || 0), level),
          targetStone: allianceProjectTarget(Number(p.target_stone || 0), level),
          targetWood: allianceProjectTarget(Number(p.target_wood || 0), level),
          progressGold: Number(p.progress_gold || 0),
          progressStone: Number(p.progress_stone || 0),
          progressWood: Number(p.progress_wood || 0),
        };
      }),
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/api/alliance/:kingdom", async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });

  try {
    const k = await pool.query(`SELECT id, name, gold, stone, wood, land FROM kingdoms WHERE LOWER(name)=LOWER($1) LIMIT 1`, [kingdom]);
    if (!k.rowCount) return res.status(404).json({ ok: false, error: "kingdom not found" });
    const kr = k.rows[0];

    const membership = await pool.query(
      `
      SELECT am.role, a.id AS alliance_id, a.slug, a.name, a.description, a.image_url, a.gallery_images, a.created_by_kingdom_id, a.created_at
      FROM alliance_members am
      JOIN alliances a ON a.id = am.alliance_id
      WHERE am.kingdom_id=$1
      LIMIT 1
      `,
      [kr.id],
    );

    if (!membership.rowCount) {
      const alliances = await pool.query(
        `
        SELECT a.id, a.slug, a.name, a.description, a.image_url, a.created_at, COUNT(am.kingdom_id)::int AS members
        FROM alliances a
        LEFT JOIN alliance_members am ON am.alliance_id = a.id
        GROUP BY a.id
        ORDER BY members DESC, a.created_at DESC
        LIMIT 40
        `,
      );
      return res.json({
        ok: true,
        kingdom: {
          id: kr.id,
          name: kr.name,
          land: Number(kr.land || 0),
          gold: Number(kr.gold || 0),
          stone: Number(kr.stone || 0),
          wood: Number(kr.wood || 0),
        },
        member: null,
        alliance: null,
        alliances: alliances.rows,
      });
    }

    const m = membership.rows[0];
    const allianceId = Number(m.alliance_id);
    const members = await pool.query(
      `
      SELECT am.kingdom_id, am.role, am.joined_at, k.name AS kingdom_name, k.land,
             COALESCE((SELECT nw.networth FROM kingdom_networth_history nw WHERE nw.kingdom_id = k.id ORDER BY nw.recorded_at DESC LIMIT 1), 0) AS networth
      FROM alliance_members am
      JOIN kingdoms k ON k.id = am.kingdom_id
      WHERE am.alliance_id=$1
      ORDER BY CASE am.role WHEN 'owner' THEN 0 WHEN 'officer' THEN 1 ELSE 2 END, k.land DESC, k.name ASC
      `,
      [allianceId],
    );
    const relations = await pool.query(
      `
      SELECT id, relation_type, target_name, note
      FROM alliance_relations
      WHERE alliance_id=$1
      ORDER BY relation_type ASC, target_name ASC
      `,
      [allianceId],
    );
    const projects = await pool.query(
      `
      SELECT ab.building_code, bt.name, bt.effect_text, bt.target_gold, bt.target_stone, bt.target_wood,
             ab.level, ab.progress_gold, ab.progress_stone, ab.progress_wood
      FROM alliance_buildings ab
      JOIN alliance_building_types bt ON bt.code = ab.building_code
      WHERE ab.alliance_id=$1
      ORDER BY bt.name ASC
      `,
      [allianceId],
    );

    let hallLevel = 0;
    const normalizedProjects = projects.rows.map((p) => {
      const level = Number(p.level || 0);
      const targetGold = allianceProjectTarget(Number(p.target_gold || 0), level);
      const targetStone = allianceProjectTarget(Number(p.target_stone || 0), level);
      const targetWood = allianceProjectTarget(Number(p.target_wood || 0), level);
      if (String(p.building_code) === "alliance_hall") hallLevel = level;
      return {
        buildingCode: p.building_code,
        name: p.name,
        effectText: p.effect_text,
        level,
        targetGold,
        targetStone,
        targetWood,
        progressGold: Number(p.progress_gold || 0),
        progressStone: Number(p.progress_stone || 0),
        progressWood: Number(p.progress_wood || 0),
        remainingGold: Math.max(0, targetGold - Number(p.progress_gold || 0)),
        remainingStone: Math.max(0, targetStone - Number(p.progress_stone || 0)),
        remainingWood: Math.max(0, targetWood - Number(p.progress_wood || 0)),
      };
    });

    return res.json({
      ok: true,
      kingdom: {
        id: kr.id,
        name: kr.name,
        land: Number(kr.land || 0),
        gold: Number(kr.gold || 0),
        stone: Number(kr.stone || 0),
        wood: Number(kr.wood || 0),
      },
      member: {
        role: String(m.role || "member"),
      },
      alliance: {
        id: allianceId,
        slug: m.slug,
        name: m.name,
        description: m.description,
        imageUrl: m.image_url,
        galleryImages: Array.isArray(m.gallery_images) ? (m.gallery_images as string[]) : [],
        createdByKingdomId: m.created_by_kingdom_id,
        createdAt: m.created_at,
        memberCap: allianceMemberCap(hallLevel),
      },
      members: members.rows.map((row) => ({
        kingdomId: Number(row.kingdom_id),
        kingdomName: row.kingdom_name,
        role: row.role,
        land: Number(row.land || 0),
        networth: Number(row.networth || 0),
        joinedAt: row.joined_at,
      })),
      relations: relations.rows,
      projects: normalizedProjects,
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/alliance/:kingdom/create", requireAuth, async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  const parsed = allianceCreateBody.safeParse(req.body || {});
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });

  try {
    const out = await withTx(async (c) => {
      const k = await c.query(`SELECT id FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`, [kingdom]);
      if (!k.rowCount) throw new Error("kingdom not found");
      const kingdomId = Number(k.rows[0].id);

      const inAlliance = await c.query(`SELECT alliance_id FROM alliance_members WHERE kingdom_id=$1 LIMIT 1`, [kingdomId]);
      if (inAlliance.rowCount) throw new Error("kingdom already in an alliance");

      const slug = sanitizeAllianceSlug(parsed.data.slug);
      const name = String(parsed.data.name || "").trim();
      if (name.length < 2 || name.length > 64) throw new Error("name must be 2-64 chars");
      const description = String(parsed.data.description || "").trim().slice(0, 240);
      const imageUrl = String(parsed.data.imageUrl || "").trim().slice(0, 260);

      const ins = await c.query(
        `
        INSERT INTO alliances(slug, name, description, image_url, created_by_kingdom_id)
        VALUES ($1,$2,$3,$4,$5)
        RETURNING id, slug, name, description, image_url, created_at
        `,
        [slug, name, description, imageUrl, kingdomId],
      );
      const alliance = ins.rows[0];

      await c.query(
        `INSERT INTO alliance_members(alliance_id, kingdom_id, role) VALUES ($1,$2,'owner')`,
        [alliance.id, kingdomId],
      );
      await c.query(
        `
        INSERT INTO alliance_buildings(alliance_id, building_code, level, progress_gold, progress_stone, progress_wood)
        SELECT $1::bigint, code, 0, 0, 0, 0
        FROM alliance_building_types
        ON CONFLICT (alliance_id, building_code) DO NOTHING
        `,
        [alliance.id],
      );

      return alliance;
    });

    return res.json({ ok: true, alliance: out });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/alliance/:kingdom/join", requireAuth, async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  const parsed = allianceJoinBody.safeParse(req.body || {});
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });

  try {
    const out = await withTx(async (c) => {
      const k = await c.query(`SELECT id FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`, [kingdom]);
      if (!k.rowCount) throw new Error("kingdom not found");
      const kingdomId = Number(k.rows[0].id);

      const existing = await c.query(`SELECT alliance_id FROM alliance_members WHERE kingdom_id=$1 LIMIT 1`, [kingdomId]);
      if (existing.rowCount) throw new Error("kingdom already in an alliance");

      let allianceId: number;
      if (parsed.data.allianceId) {
        allianceId = Number(parsed.data.allianceId);
      } else {
        const al = await c.query(`SELECT id FROM alliances WHERE LOWER(slug)=LOWER($1) LIMIT 1`, [parsed.data.slug]);
        if (!al.rowCount) throw new Error("alliance not found");
        allianceId = Number(al.rows[0].id);
      }

      const a = await c.query(`SELECT id, name FROM alliances WHERE id=$1 LIMIT 1`, [allianceId]);
      if (!a.rowCount) throw new Error("alliance not found");

      const hall = await c.query(
        `SELECT level FROM alliance_buildings WHERE alliance_id=$1 AND building_code='alliance_hall' LIMIT 1`,
        [allianceId],
      );
      const memberCountQ = await c.query(`SELECT COUNT(*)::int AS n FROM alliance_members WHERE alliance_id=$1`, [allianceId]);
      const cap = allianceMemberCap(Number(hall.rows[0]?.level || 0));
      const memberCount = Number(memberCountQ.rows[0]?.n || 0);
      if (memberCount >= cap) throw new Error(`alliance member cap reached (${memberCount}/${cap})`);

      await c.query(`INSERT INTO alliance_members(alliance_id, kingdom_id, role) VALUES ($1,$2,'member')`, [allianceId, kingdomId]);
      return { allianceId, allianceName: a.rows[0].name, memberCount: memberCount + 1, memberCap: cap };
    });

    return res.json({ ok: true, ...out });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/alliance/:kingdom/leave", requireAuth, async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });

  try {
    const out = await withTx(async (c) => {
      const k = await c.query(`SELECT id FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`, [kingdom]);
      if (!k.rowCount) throw new Error("kingdom not found");
      const kingdomId = Number(k.rows[0].id);

      const m = await c.query(`SELECT alliance_id, role FROM alliance_members WHERE kingdom_id=$1 LIMIT 1`, [kingdomId]);
      if (!m.rowCount) throw new Error("kingdom is not in an alliance");
      const allianceId = Number(m.rows[0].alliance_id);
      const role = String(m.rows[0].role || "member");
      let disbanded = false;

      if (role === "owner") {
        const others = await c.query(`SELECT kingdom_id FROM alliance_members WHERE alliance_id=$1 AND kingdom_id<>$2 ORDER BY joined_at ASC`, [allianceId, kingdomId]);
        if (others.rowCount) throw new Error("owner cannot leave while members remain (promote another leader first)");
        await c.query(`DELETE FROM alliances WHERE id=$1`, [allianceId]);
        disbanded = true;
      } else {
        await c.query(`DELETE FROM alliance_members WHERE alliance_id=$1 AND kingdom_id=$2`, [allianceId, kingdomId]);
      }
      return { allianceId, disbanded };
    });

    return res.json({ ok: true, ...out });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.patch("/api/alliance/:kingdom/update", requireAuth, async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });
  const { description, imageUrl, galleryImages } = (req.body || {}) as { description?: string; imageUrl?: string; galleryImages?: string[] };

  try {
    const k = await pool.query(`SELECT id FROM kingdoms WHERE LOWER(name)=LOWER($1) LIMIT 1`, [kingdom]);
    if (!k.rowCount) return res.status(404).json({ ok: false, error: "kingdom not found" });
    const kingdomId = Number(k.rows[0].id);

    const m = await pool.query(`SELECT alliance_id, role FROM alliance_members WHERE kingdom_id=$1 LIMIT 1`, [kingdomId]);
    if (!m.rowCount) return res.status(403).json({ ok: false, error: "not in an alliance" });
    const role = String(m.rows[0].role || "member");
    if (role !== "owner" && role !== "officer") return res.status(403).json({ ok: false, error: "only owner/officers can update alliance info" });

    const updates: string[] = [];
    const vals: unknown[] = [Number(m.rows[0].alliance_id)];
    if (description !== undefined) { vals.push(String(description).slice(0, 12000)); updates.push(`description=$${vals.length}`); }
    if (imageUrl !== undefined) { vals.push(String(imageUrl).slice(0, 500)); updates.push(`image_url=$${vals.length}`); }
    if (galleryImages !== undefined) {
      const imgs = (Array.isArray(galleryImages) ? galleryImages : []).slice(0, 6).map((u) => String(u).slice(0, 500));
      vals.push(imgs);
      updates.push(`gallery_images=$${vals.length}`);
    }
    if (!updates.length) return res.status(400).json({ ok: false, error: "nothing to update" });

    await pool.query(`UPDATE alliances SET ${updates.join(", ")} WHERE id=$1`, vals);
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/alliance/:kingdom/kick", requireAuth, async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  const targetKingdom = String((req.body as any)?.targetKingdom || "").trim();
  if (!kingdom || !targetKingdom) return res.status(400).json({ ok: false, error: "kingdom and targetKingdom required" });

  try {
    await withTx(async (c) => {
      const k = await c.query(`SELECT id FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`, [kingdom]);
      if (!k.rowCount) throw new Error("kingdom not found");
      const kingdomId = Number(k.rows[0].id);

      const m = await c.query(`SELECT alliance_id, role FROM alliance_members WHERE kingdom_id=$1 LIMIT 1`, [kingdomId]);
      if (!m.rowCount) throw new Error("not in an alliance");
      const allianceId = Number(m.rows[0].alliance_id);
      const role = String(m.rows[0].role || "member");
      if (role !== "owner" && role !== "officer") throw new Error("only owner/officers can kick members");

      const t = await c.query(`SELECT k.id, am.role FROM kingdoms k JOIN alliance_members am ON am.kingdom_id=k.id WHERE LOWER(k.name)=LOWER($1) AND am.alliance_id=$2 LIMIT 1`, [targetKingdom, allianceId]);
      if (!t.rowCount) throw new Error("target is not a member of your alliance");
      const targetRole = String(t.rows[0].role || "member");
      if (targetRole === "owner") throw new Error("cannot kick the owner");
      if (role === "officer" && targetRole === "officer") throw new Error("officers cannot kick other officers");

      await c.query(`DELETE FROM alliance_members WHERE kingdom_id=$1 AND alliance_id=$2`, [Number(t.rows[0].id), allianceId]);
    });
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/alliance/:kingdom/promote", requireAuth, async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  const targetKingdom = String((req.body as any)?.targetKingdom || "").trim();
  if (!kingdom || !targetKingdom) return res.status(400).json({ ok: false, error: "kingdom and targetKingdom required" });

  try {
    const newRole = await withTx(async (c) => {
      const k = await c.query(`SELECT id FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`, [kingdom]);
      if (!k.rowCount) throw new Error("kingdom not found");
      const kingdomId = Number(k.rows[0].id);

      const m = await c.query(`SELECT alliance_id, role FROM alliance_members WHERE kingdom_id=$1 LIMIT 1`, [kingdomId]);
      if (!m.rowCount) throw new Error("not in an alliance");
      const allianceId = Number(m.rows[0].alliance_id);
      if (String(m.rows[0].role) !== "owner") throw new Error("only the owner can promote/demote members");

      const t = await c.query(`SELECT k.id, am.role FROM kingdoms k JOIN alliance_members am ON am.kingdom_id=k.id WHERE LOWER(k.name)=LOWER($1) AND am.alliance_id=$2 LIMIT 1`, [targetKingdom, allianceId]);
      if (!t.rowCount) throw new Error("target is not a member of your alliance");
      const targetRole = String(t.rows[0].role || "member");
      if (targetRole === "owner") throw new Error("cannot change the owner's role");

      const nextRole = targetRole === "officer" ? "member" : "officer";
      await c.query(`UPDATE alliance_members SET role=$1 WHERE kingdom_id=$2 AND alliance_id=$3`, [nextRole, Number(t.rows[0].id), allianceId]);
      return nextRole;
    });
    return res.json({ ok: true, newRole });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/alliance/:kingdom/relation", requireAuth, async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  const parsed = allianceRelationBody.safeParse(req.body || {});
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });

  try {
    const out = await withTx(async (c) => {
      const k = await c.query(`SELECT id FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`, [kingdom]);
      if (!k.rowCount) throw new Error("kingdom not found");
      const kingdomId = Number(k.rows[0].id);

      const m = await c.query(`SELECT alliance_id, role FROM alliance_members WHERE kingdom_id=$1 LIMIT 1`, [kingdomId]);
      if (!m.rowCount) throw new Error("kingdom is not in an alliance");
      const allianceId = Number(m.rows[0].alliance_id);
      const role = String(m.rows[0].role || "member");
      if (role !== "owner" && role !== "officer") throw new Error("only owner/officers can update relations");

      const targetName = String(parsed.data.targetName || "").trim();
      if (!targetName) throw new Error("targetName required");
      const relationType = parsed.data.relationType;
      const note = String(parsed.data.note || "").trim().slice(0, 180);

      await c.query(
        `DELETE FROM alliance_relations WHERE alliance_id=$1 AND relation_type=$2 AND LOWER(target_name)=LOWER($3)`,
        [allianceId, relationType, targetName],
      );
      const ins = await c.query(
        `
        INSERT INTO alliance_relations(alliance_id, relation_type, target_name, note)
        VALUES ($1,$2,$3,$4)
        RETURNING id, relation_type, target_name, note
        `,
        [allianceId, relationType, targetName, note],
      );
      return ins.rows[0];
    });

    return res.json({ ok: true, relation: out });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/alliance/:kingdom/contribute", requireAuth, async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  const parsed = allianceContribBody.safeParse(req.body || {});
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });

  try {
    const out = await withTx(async (c) => {
      const k = await c.query(`SELECT id, gold, stone, wood FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`, [kingdom]);
      if (!k.rowCount) throw new Error("kingdom not found");
      const kr = k.rows[0];

      const m = await c.query(`SELECT alliance_id FROM alliance_members WHERE kingdom_id=$1 LIMIT 1`, [kr.id]);
      if (!m.rowCount) throw new Error("kingdom is not in an alliance");
      const allianceId = Number(m.rows[0].alliance_id);
      const buildingCode = String(parsed.data.buildingCode || "").toLowerCase().trim();
      if (!buildingCode) throw new Error("buildingCode required");

      const reqGold = Math.max(0, Math.floor(Number(parsed.data.gold || 0)));
      const reqStone = Math.max(0, Math.floor(Number(parsed.data.stone || 0)));
      const reqWood = Math.max(0, Math.floor(Number(parsed.data.wood || 0)));
      if (reqGold <= 0 && reqStone <= 0 && reqWood <= 0) throw new Error("set at least one contribution amount > 0");

      const project = await c.query(
        `
        SELECT ab.level, ab.progress_gold, ab.progress_stone, ab.progress_wood, bt.target_gold, bt.target_stone, bt.target_wood
        FROM alliance_buildings ab
        JOIN alliance_building_types bt ON bt.code = ab.building_code
        WHERE ab.alliance_id=$1 AND ab.building_code=$2
        LIMIT 1
        FOR UPDATE
        `,
        [allianceId, buildingCode],
      );
      if (!project.rowCount) throw new Error("alliance project not found");
      const p = project.rows[0];

      const level = Number(p.level || 0);
      const targetGold = allianceProjectTarget(Number(p.target_gold || 0), level);
      const targetStone = allianceProjectTarget(Number(p.target_stone || 0), level);
      const targetWood = allianceProjectTarget(Number(p.target_wood || 0), level);

      const progressGold = Number(p.progress_gold || 0);
      const progressStone = Number(p.progress_stone || 0);
      const progressWood = Number(p.progress_wood || 0);

      const remGold = Math.max(0, targetGold - progressGold);
      const remStone = Math.max(0, targetStone - progressStone);
      const remWood = Math.max(0, targetWood - progressWood);

      const spendGold = Math.min(reqGold, remGold, Number(kr.gold || 0));
      const spendStone = Math.min(reqStone, remStone, Number(kr.stone || 0));
      const spendWood = Math.min(reqWood, remWood, Number(kr.wood || 0));
      if (spendGold <= 0 && spendStone <= 0 && spendWood <= 0) throw new Error("nothing to contribute (insufficient resources or project already complete)");

      await c.query(`UPDATE kingdoms SET gold=gold-$2, stone=stone-$3, wood=wood-$4 WHERE id=$1`, [kr.id, spendGold, spendStone, spendWood]);

      let nextLevel = level;
      let nextProgressGold = progressGold + spendGold;
      let nextProgressStone = progressStone + spendStone;
      let nextProgressWood = progressWood + spendWood;
      let leveledUp = false;

      if (nextProgressGold >= targetGold && nextProgressStone >= targetStone && nextProgressWood >= targetWood) {
        nextLevel = level + 1;
        nextProgressGold = 0;
        nextProgressStone = 0;
        nextProgressWood = 0;
        leveledUp = true;
      }

      await c.query(
        `
        UPDATE alliance_buildings
        SET level=$3, progress_gold=$4, progress_stone=$5, progress_wood=$6
        WHERE alliance_id=$1 AND building_code=$2
        `,
        [allianceId, buildingCode, nextLevel, nextProgressGold, nextProgressStone, nextProgressWood],
      );

      return {
        allianceId,
        buildingCode,
        contribution: { gold: spendGold, stone: spendStone, wood: spendWood },
        project: {
          level: nextLevel,
          progressGold: nextProgressGold,
          progressStone: nextProgressStone,
          progressWood: nextProgressWood,
          targetGold: leveledUp ? allianceProjectTarget(Number(p.target_gold || 0), nextLevel) : targetGold,
          targetStone: leveledUp ? allianceProjectTarget(Number(p.target_stone || 0), nextLevel) : targetStone,
          targetWood: leveledUp ? allianceProjectTarget(Number(p.target_wood || 0), nextLevel) : targetWood,
          leveledUp,
        },
      };
    });

    return res.json({ ok: true, ...out });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

// ── Admin endpoints ──────────────────────────────────────────────────────────
app.get("/api/admin/stats", requireAdmin, async (_req, res) => {
  try {
    const [users, kingdoms, sessions, bans] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS cnt FROM app_users`),
      pool.query(`SELECT COUNT(*) AS cnt FROM kingdoms`),
      pool.query(`SELECT COUNT(*) AS cnt FROM auth_sessions WHERE expires_at > now()`),
      pool.query(`SELECT COUNT(*) AS cnt FROM app_users WHERE is_banned=true`),
    ]);
    return res.json({ ok: true, stats: { totalUsers: Number(users.rows[0].cnt), totalKingdoms: Number(kingdoms.rows[0].cnt), activeSessions: Number(sessions.rows[0].cnt), bannedUsers: Number(bans.rows[0].cnt) } });
  } catch (e: any) { return res.status(500).json({ ok: false, error: String(e?.message || e) }); }
});

app.get("/api/admin/metrics", requireAdmin, async (_req, res) => {
  try {
    const metrics = Array.from(routeSamples.entries()).map(([route, samples]) => {
      const ms = samples.map((s) => s.ms);
      const errors = samples.filter((s) => s.status >= 500).length;
      const p50 = Number(percentile(ms, 50).toFixed(2));
      const p95 = Number(percentile(ms, 95).toFixed(2));
      return {
        route,
        count: samples.length,
        errors,
        p50,
        p95,
        budgetMs: PERF_BUDGET_P95_MS,
        budgetOk: p95 <= PERF_BUDGET_P95_MS,
      };
    }).sort((a, b) => b.p95 - a.p95);
    const violating = metrics.filter((m) => !m.budgetOk).map((m) => m.route);
    return res.json({
      ok: true,
      budget: { p95Ms: PERF_BUDGET_P95_MS },
      routes: metrics,
      violating,
      capturedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/api/admin/alerts", requireAdmin, async (_req, res) => {
  try {
    const metrics = Array.from(routeSamples.entries()).map(([route, samples]) => {
      const ms = samples.map((s) => s.ms);
      const errors = samples.filter((s) => s.status >= 500).length;
      return {
        route,
        count: samples.length,
        errors,
        p95: Number(percentile(ms, 95).toFixed(2)),
        budgetMs: PERF_BUDGET_P95_MS,
      };
    });
    const gs = await pool.query(`SELECT worker_last_tick_at FROM game_state WHERE id=1 LIMIT 1`);
    const lastTickAt = new Date(gs.rows[0]?.worker_last_tick_at || Date.now());
    const tickLagSeconds = Math.max(0, Math.floor((Date.now() - lastTickAt.getTime()) / 1000));
    const tickIntervalSeconds = OBS_TICK_INTERVAL_SECONDS;
    const alerts = evaluateOpsAlerts({ routes: metrics, tickLagSeconds, tickIntervalSeconds });
    return res.json({
      ok: true,
      alerts,
      context: {
        capturedAt: new Date().toISOString(),
        tickLagSeconds,
        tickIntervalSeconds,
        lastWorkerTickAt: lastTickAt.toISOString(),
      },
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/api/admin/backlog", requireAdmin, async (_req, res) => {
  try {
    const [buildQ, trainQ, researchQ, settlementQ, movementQ, stateQ] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='queued' AND completes_at <= now())::int AS due FROM build_queue WHERE status='queued'`),
      pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='queued' AND completes_at <= now())::int AS due FROM train_queue WHERE status='queued'`),
      pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='queued' AND completes_at <= now())::int AS due FROM research_queue WHERE status='queued'`),
      pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='queued' AND completes_at <= now())::int AS due FROM settlement_build_queue WHERE status='queued'`),
      pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='out' AND returns_at <= now())::int AS due FROM troop_movements WHERE status='out'`),
      pool.query(`SELECT worker_last_tick_at FROM game_state WHERE id=1 LIMIT 1`),
    ]);
    const workerLastTickAt = new Date(stateQ.rows[0]?.worker_last_tick_at || Date.now());
    const workerLagSeconds = Math.max(0, Math.floor((Date.now() - workerLastTickAt.getTime()) / 1000));
    return res.json({
      ok: true,
      worker: { lastTickAt: workerLastTickAt.toISOString(), lagSeconds: workerLagSeconds },
      queues: {
        builds: { total: Number(buildQ.rows[0]?.total || 0), due: Number(buildQ.rows[0]?.due || 0) },
        training: { total: Number(trainQ.rows[0]?.total || 0), due: Number(trainQ.rows[0]?.due || 0) },
        research: { total: Number(researchQ.rows[0]?.total || 0), due: Number(researchQ.rows[0]?.due || 0) },
        settlementBuilds: { total: Number(settlementQ.rows[0]?.total || 0), due: Number(settlementQ.rows[0]?.due || 0) },
        troopReturns: { total: Number(movementQ.rows[0]?.total || 0), due: Number(movementQ.rows[0]?.due || 0) },
      },
      capturedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/api/alliance-forums/:kingdom", async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  const search = String(req.query.q || "").trim();
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });
  try {
    const membership = await getAllianceMembershipByKingdom(pool, kingdom);
    const params: any[] = [membership.allianceId];
    let filter = "";
    if (search.length >= 2) {
      params.push(`%${search}%`);
      filter = `
        AND (
          t.title ILIKE $2
          OR t.body ILIKE $2
          OR EXISTS (
            SELECT 1 FROM alliance_forum_posts sp
            WHERE sp.thread_id = t.id AND sp.body ILIKE $2
          )
        )
      `;
    }
    const threads = await pool.query(
      `
      SELECT t.id, t.title, t.body, t.pinned, t.locked, t.author_kingdom_name, t.author_username, t.created_at, t.updated_at,
             COALESCE(COUNT(p.id),0)::int AS post_count,
             MAX(p.created_at) AS last_post_at
      FROM alliance_forum_threads t
      LEFT JOIN alliance_forum_posts p ON p.thread_id = t.id
      WHERE t.alliance_id=$1
      ${filter}
      GROUP BY t.id
      ORDER BY t.pinned DESC, COALESCE(MAX(p.created_at), t.updated_at) DESC
      LIMIT 200
      `,
      params,
    );
    return res.json({
      ok: true,
      alliance: { id: membership.allianceId, slug: membership.allianceSlug, name: membership.allianceName },
      viewerRole: membership.role,
      canModerate: isAllianceModerator(membership.role),
      threads: threads.rows,
    });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/api/alliance-forums/:kingdom/search", async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  const q = String(req.query.q || "").trim();
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });
  if (q.length < 2) return res.json({ ok: true, q, threads: [], posts: [] });
  try {
    const membership = await getAllianceMembershipByKingdom(pool, kingdom);
    const like = `%${q}%`;
    const [threads, posts] = await Promise.all([
      pool.query(
        `
        SELECT id, title, author_kingdom_name, updated_at
        FROM alliance_forum_threads
        WHERE alliance_id=$1
          AND (title ILIKE $2 OR body ILIKE $2)
        ORDER BY pinned DESC, updated_at DESC
        LIMIT 30
        `,
        [membership.allianceId, like],
      ),
      pool.query(
        `
        SELECT p.id, p.thread_id, t.title AS thread_title, p.author_kingdom_name, p.body, p.created_at
        FROM alliance_forum_posts p
        JOIN alliance_forum_threads t ON t.id = p.thread_id
        WHERE t.alliance_id=$1
          AND p.body ILIKE $2
        ORDER BY p.created_at DESC
        LIMIT 50
        `,
        [membership.allianceId, like],
      ),
    ]);
    return res.json({
      ok: true,
      q,
      threads: threads.rows,
      posts: posts.rows,
    });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/api/alliance-forums/:kingdom/mod-log", requireAuth, async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });
  try {
    const session = (req as any).authSession;
    const own = await pool.query(`SELECT 1 FROM kingdoms WHERE LOWER(name)=LOWER($1) AND user_id=$2 LIMIT 1`, [kingdom, session.user_id]);
    if (!own.rowCount) return res.status(403).json({ ok: false, error: "cannot view moderator log for another kingdom" });
    const membership = await getAllianceMembershipByKingdom(pool, kingdom);
    if (!isAllianceModerator(membership.role)) return res.status(403).json({ ok: false, error: "moderator permissions required" });
    const q = await pool.query(
      `
      SELECT l.id, l.action, l.thread_id, l.post_id, l.payload, l.created_at, k.name AS actor_kingdom
      FROM alliance_forum_moderation_log l
      JOIN kingdoms k ON k.id = l.actor_kingdom_id
      WHERE l.alliance_id=$1
      ORDER BY l.created_at DESC
      LIMIT $2
      `,
      [membership.allianceId, limit],
    );
    return res.json({ ok: true, items: q.rows });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/alliance-forums/:kingdom/threads", requireAuth, async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  const parsed = allianceForumCreateThreadBody.safeParse(req.body || {});
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });
  try {
    const out = await withTx(async (c) => {
      const m = await getAllianceMembershipByKingdom(c, kingdom);
      const canPin = isAllianceModerator(m.role);
      const ins = await c.query(
        `
        INSERT INTO alliance_forum_threads(alliance_id, author_kingdom_id, author_kingdom_name, author_username, title, body, pinned)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        RETURNING id, title, body, pinned, locked, created_at, updated_at
        `,
        [
          m.allianceId,
          m.kingdomId,
          m.kingdomName,
          m.username,
          parsed.data.title.trim(),
          parsed.data.body.trim(),
          canPin ? Boolean(parsed.data.pinned) : false,
        ],
      );
      const threadId = Number(ins.rows[0].id);
      await c.query(
        `
        INSERT INTO alliance_forum_posts(thread_id, author_kingdom_id, author_kingdom_name, author_username, body)
        VALUES ($1,$2,$3,$4,$5)
        `,
        [threadId, m.kingdomId, m.kingdomName, m.username, parsed.data.body.trim()],
      );
      return { thread: ins.rows[0] };
    });
    publishKingdomEvent(kingdom, "alliance_forum_thread_created", { threadId: out.thread.id });
    return res.json({ ok: true, ...out });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/api/alliance-forums/:kingdom/threads/:threadId", async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  const threadId = Number(req.params.threadId || 0);
  if (!kingdom || !threadId) return res.status(400).json({ ok: false, error: "kingdom and threadId required" });
  try {
    const membership = await getAllianceMembershipByKingdom(pool, kingdom);
    const thread = await pool.query(
      `SELECT id, title, body, pinned, locked, author_kingdom_name, author_username, created_at, updated_at
       FROM alliance_forum_threads
       WHERE id=$1 AND alliance_id=$2
       LIMIT 1`,
      [threadId, membership.allianceId],
    );
    if (!thread.rowCount) return res.status(404).json({ ok: false, error: "thread not found" });
    const posts = await pool.query(
      `
      SELECT id, author_kingdom_id, author_kingdom_name, author_username, body, created_at
      FROM alliance_forum_posts
      WHERE thread_id=$1
      ORDER BY created_at ASC
      LIMIT 1000
      `,
      [threadId],
    );
    return res.json({
      ok: true,
      thread: thread.rows[0],
      posts: posts.rows,
      viewerRole: membership.role,
      canModerate: isAllianceModerator(membership.role),
      viewerKingdomId: membership.kingdomId,
    });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/alliance-forums/:kingdom/threads/:threadId/posts", requireAuth, async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  const threadId = Number(req.params.threadId || 0);
  const parsed = allianceForumCreatePostBody.safeParse(req.body || {});
  if (!kingdom || !threadId) return res.status(400).json({ ok: false, error: "kingdom and threadId required" });
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });
  try {
    const out = await withTx(async (c) => {
      const m = await getAllianceMembershipByKingdom(c, kingdom);
      const t = await c.query(`SELECT id, locked FROM alliance_forum_threads WHERE id=$1 AND alliance_id=$2 FOR UPDATE`, [threadId, m.allianceId]);
      if (!t.rowCount) throw new Error("thread not found");
      if (Boolean(t.rows[0].locked)) throw new Error("thread is locked");
      const ins = await c.query(
        `
        INSERT INTO alliance_forum_posts(thread_id, author_kingdom_id, author_kingdom_name, author_username, body)
        VALUES ($1,$2,$3,$4,$5)
        RETURNING id, created_at
        `,
        [threadId, m.kingdomId, m.kingdomName, m.username, parsed.data.body.trim()],
      );
      await c.query(`UPDATE alliance_forum_threads SET updated_at=now() WHERE id=$1`, [threadId]);
      return { post: ins.rows[0] };
    });
    publishKingdomEvent(kingdom, "alliance_forum_post_created", { threadId });
    return res.json({ ok: true, ...out });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/alliance-forums/:kingdom/threads/:threadId/moderate", requireAuth, async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  const threadId = Number(req.params.threadId || 0);
  const parsed = allianceForumModerateThreadBody.safeParse(req.body || {});
  if (!kingdom || !threadId) return res.status(400).json({ ok: false, error: "kingdom and threadId required" });
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });
  try {
    const out = await withTx(async (c) => {
      const m = await getAllianceMembershipByKingdom(c, kingdom);
      if (!isAllianceModerator(m.role)) throw new Error("moderator permissions required");
      const t = await c.query(`SELECT id, pinned, locked FROM alliance_forum_threads WHERE id=$1 AND alliance_id=$2 FOR UPDATE`, [threadId, m.allianceId]);
      if (!t.rowCount) throw new Error("thread not found");
      if (parsed.data.deleteThread) {
        await c.query(`DELETE FROM alliance_forum_threads WHERE id=$1`, [threadId]);
        await c.query(
          `INSERT INTO alliance_forum_moderation_log(alliance_id, actor_kingdom_id, thread_id, action, payload) VALUES($1,$2,$3,$4,$5::jsonb)`,
          [m.allianceId, m.kingdomId, threadId, "thread_delete", JSON.stringify({})],
        );
        return { deleted: true };
      }
      const nextPinned = parsed.data.pinned ?? Boolean(t.rows[0].pinned);
      const nextLocked = parsed.data.locked ?? Boolean(t.rows[0].locked);
      const u = await c.query(
        `UPDATE alliance_forum_threads SET pinned=$2, locked=$3, updated_at=now() WHERE id=$1 RETURNING id, pinned, locked, updated_at`,
        [threadId, nextPinned, nextLocked],
      );
      await c.query(
        `INSERT INTO alliance_forum_moderation_log(alliance_id, actor_kingdom_id, thread_id, action, payload) VALUES($1,$2,$3,$4,$5::jsonb)`,
        [m.allianceId, m.kingdomId, threadId, "thread_update", JSON.stringify({ pinned: nextPinned, locked: nextLocked })],
      );
      return { deleted: false, thread: u.rows[0] };
    });
    publishKingdomEvent(kingdom, "alliance_forum_thread_moderated", { threadId, deleted: out.deleted });
    return res.json({ ok: true, ...out });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/alliance-forums/:kingdom/posts/:postId/moderate", requireAuth, async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  const postId = Number(req.params.postId || 0);
  const parsed = allianceForumModeratePostBody.safeParse(req.body || {});
  if (!kingdom || !postId) return res.status(400).json({ ok: false, error: "kingdom and postId required" });
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });
  try {
    const out = await withTx(async (c) => {
      const m = await getAllianceMembershipByKingdom(c, kingdom);
      const p = await c.query(
        `
        SELECT p.id, p.thread_id, p.author_kingdom_id, t.alliance_id
        FROM alliance_forum_posts p
        JOIN alliance_forum_threads t ON t.id = p.thread_id
        WHERE p.id=$1
        FOR UPDATE
        `,
        [postId],
      );
      if (!p.rowCount) throw new Error("post not found");
      const row = p.rows[0];
      if (Number(row.alliance_id) !== m.allianceId) throw new Error("post not in your alliance");
      const canModerate = isAllianceModerator(m.role);
      const canDeleteOwn = Number(row.author_kingdom_id) === m.kingdomId;
      if (!canModerate && !canDeleteOwn) throw new Error("not permitted to delete this post");
      await c.query(`DELETE FROM alliance_forum_posts WHERE id=$1`, [postId]);
      await c.query(`UPDATE alliance_forum_threads SET updated_at=now() WHERE id=$1`, [Number(row.thread_id)]);
      await c.query(
        `INSERT INTO alliance_forum_moderation_log(alliance_id, actor_kingdom_id, thread_id, post_id, action, payload) VALUES($1,$2,$3,$4,$5,$6::jsonb)`,
        [m.allianceId, m.kingdomId, Number(row.thread_id), postId, canModerate ? "post_delete_moderator" : "post_delete_author", JSON.stringify({})],
      );
      return { threadId: Number(row.thread_id) };
    });
    publishKingdomEvent(kingdom, "alliance_forum_post_deleted", { postId, threadId: out.threadId });
    return res.json({ ok: true, ...out });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/api/embassy/:kingdom", async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });
  try {
    const k = await pool.query(`SELECT id, name FROM kingdoms WHERE LOWER(name)=LOWER($1) LIMIT 1`, [kingdom]);
    if (!k.rowCount) return res.status(404).json({ ok: false, error: "kingdom not found" });
    const kingdomId = Number(k.rows[0].id);
    await withTx(async (c) => {
      await cleanupExpiredEffectsTx(c, kingdomId);
      return 0;
    });
    const [incoming, outgoing, activeEffects] = await Promise.all([
      pool.query(
        `
        SELECT m.id, fk.name AS from_kingdom, tk.name AS to_kingdom, m.mission_type, m.status, m.note, m.created_at, m.responded_at
        FROM diplomat_missions m
        JOIN kingdoms fk ON fk.id = m.from_kingdom_id
        JOIN kingdoms tk ON tk.id = m.to_kingdom_id
        WHERE m.to_kingdom_id=$1
        ORDER BY m.created_at DESC
        LIMIT 100
        `,
        [kingdomId],
      ),
      pool.query(
        `
        SELECT m.id, fk.name AS from_kingdom, tk.name AS to_kingdom, m.mission_type, m.status, m.note, m.created_at, m.responded_at
        FROM diplomat_missions m
        JOIN kingdoms fk ON fk.id = m.from_kingdom_id
        JOIN kingdoms tk ON tk.id = m.to_kingdom_id
        WHERE m.from_kingdom_id=$1
        ORDER BY m.created_at DESC
        LIMIT 100
        `,
        [kingdomId],
      ),
      pool.query(
        `
        SELECT effect_code, magnitude, payload, starts_at, ends_at
        FROM kingdom_status_effects
        WHERE kingdom_id=$1 AND ends_at > now()
        ORDER BY ends_at ASC
        LIMIT 50
        `,
        [kingdomId],
      ),
    ]);
    return res.json({ ok: true, incoming: incoming.rows, outgoing: outgoing.rows, activeEffects: activeEffects.rows });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/embassy/:kingdom/send", requireAuth, async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  const parsed = embassySendMissionBody.safeParse(req.body || {});
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });
  try {
    const out = await withTx(async (c) => {
      const fromK = await c.query(`SELECT id, name FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`, [kingdom]);
      if (!fromK.rowCount) throw new Error("kingdom not found");
      const toK = await c.query(`SELECT id, name FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`, [parsed.data.targetKingdom]);
      if (!toK.rowCount) throw new Error("target kingdom not found");
      if (Number(fromK.rows[0].id) === Number(toK.rows[0].id)) throw new Error("cannot send diplomats to yourself");
      // Require at least 1 diplomat in your army to conduct missions
      const diplomatQ = await c.query(
        `SELECT COALESCE(amount,0) AS qty FROM kingdom_troops WHERE kingdom_id=$1 AND troop_code='diplomats'`,
        [Number(fromK.rows[0].id)],
      );
      if (Number(diplomatQ.rows[0]?.qty || 0) < 1) {
        throw new Error("you need at least 1 Diplomat in your army to send diplomatic missions");
      }
      const dup = await c.query(
        `
        SELECT id
        FROM diplomat_missions
        WHERE from_kingdom_id=$1 AND to_kingdom_id=$2 AND mission_type=$3 AND status='pending'
        LIMIT 1
        `,
        [Number(fromK.rows[0].id), Number(toK.rows[0].id), parsed.data.missionType],
      );
      if (dup.rowCount) throw new Error("a pending mission of this type already exists for that target");
      const ins = await c.query(
        `
        INSERT INTO diplomat_missions(from_kingdom_id, to_kingdom_id, mission_type, note)
        VALUES ($1,$2,$3,$4)
        RETURNING id, status, created_at
        `,
        [Number(fromK.rows[0].id), Number(toK.rows[0].id), parsed.data.missionType, parsed.data.note.trim()],
      );
      await sendNoticeTx(
        c,
        Number(toK.rows[0].id),
        "info",
        `${fromK.rows[0].name} sent a ${parsed.data.missionType} diplomatic mission.`,
        { missionId: Number(ins.rows[0].id), from: fromK.rows[0].name, type: parsed.data.missionType },
      );
      return { mission: ins.rows[0], toKingdom: String(toK.rows[0].name) };
    });
    publishKingdomEvent(parsed.data.targetKingdom, "embassy_mission_received", { missionId: out.mission.id });
    return res.json({ ok: true, ...out });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/embassy/:kingdom/respond", requireAuth, async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  const parsed = embassyRespondMissionBody.safeParse(req.body || {});
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });
  try {
    const out = await withTx(async (c) => {
      const k = await c.query(`SELECT id, name FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`, [kingdom]);
      if (!k.rowCount) throw new Error("kingdom not found");
      const toKingdomId = Number(k.rows[0].id);
      const mission = await c.query(
        `
        UPDATE diplomat_missions
        SET status=$3, responded_at=now()
        WHERE id=$1 AND to_kingdom_id=$2 AND status='pending'
        RETURNING id, from_kingdom_id, to_kingdom_id, mission_type, status
        `,
        [parsed.data.missionId, toKingdomId, parsed.data.action],
      );
      if (!mission.rowCount) throw new Error("mission not found or no longer pending");
      const m = mission.rows[0];
      const fromKingdomId = Number(m.from_kingdom_id);
      const fromNameQ = await c.query(`SELECT name FROM kingdoms WHERE id=$1 LIMIT 1`, [fromKingdomId]);
      const fromKingdomName = String(fromNameQ.rows[0]?.name || "");
      const appliedEffects: any[] = [];
      if (parsed.data.action === "accepted") {
        await cleanupExpiredEffectsTx(c, fromKingdomId);
        await cleanupExpiredEffectsTx(c, toKingdomId);
        if (String(m.mission_type) === "trade") {
          const fromEff = await addTimedEffectTx(c, {
            kingdomId: fromKingdomId,
            effectCode: "trade_surplus",
            magnitude: 0.06,
            hours: 24,
            sourceKind: "embassy_trade",
            sourceRef: Number(m.id),
            payload: { withKingdomId: toKingdomId },
          });
          const toEff = await addTimedEffectTx(c, {
            kingdomId: toKingdomId,
            effectCode: "trade_surplus",
            magnitude: 0.06,
            hours: 24,
            sourceKind: "embassy_trade",
            sourceRef: Number(m.id),
            payload: { withKingdomId: fromKingdomId },
          });
          await c.query(`UPDATE kingdoms SET gold = gold + 2500 WHERE id=$1`, [fromKingdomId]);
          await c.query(`UPDATE kingdoms SET gold = gold + 2500 WHERE id=$1`, [toKingdomId]);
          appliedEffects.push({ effectCode: "trade_surplus", expiresAt: fromEff.expiresAt });
          appliedEffects.push({ effectCode: "trade_surplus", expiresAt: toEff.expiresAt });
        } else if (String(m.mission_type) === "peace") {
          const fromEff = await addTimedEffectTx(c, {
            kingdomId: fromKingdomId,
            effectCode: "peace_pact",
            magnitude: 0.08,
            hours: 24,
            sourceKind: "embassy_peace",
            sourceRef: Number(m.id),
            payload: { withKingdomId: toKingdomId },
          });
          const toEff = await addTimedEffectTx(c, {
            kingdomId: toKingdomId,
            effectCode: "peace_pact",
            magnitude: 0.08,
            hours: 24,
            sourceKind: "embassy_peace",
            sourceRef: Number(m.id),
            payload: { withKingdomId: fromKingdomId },
          });
          appliedEffects.push({ effectCode: "peace_pact", expiresAt: fromEff.expiresAt });
          appliedEffects.push({ effectCode: "peace_pact", expiresAt: toEff.expiresAt });
        } else if (String(m.mission_type) === "intel") {
          const fromEff = await addTimedEffectTx(c, {
            kingdomId: fromKingdomId,
            effectCode: "intel_vision",
            magnitude: 0.12,
            hours: 18,
            sourceKind: "embassy_intel",
            sourceRef: Number(m.id),
            payload: { targetKingdomId: toKingdomId },
          });
          appliedEffects.push({ effectCode: "intel_vision", expiresAt: fromEff.expiresAt });
        }
      }
      await sendNoticeTx(
        c,
        fromKingdomId,
        "info",
        `${k.rows[0].name} ${parsed.data.action} your ${m.mission_type} diplomatic mission.`,
        { missionId: Number(m.id), action: parsed.data.action },
      );
      return { mission: mission.rows[0], appliedEffects, fromKingdomName };
    });
    publishKingdomEvent(kingdom, "embassy_mission_responded", { missionId: out.mission.id, status: out.mission.status });
    if (out.fromKingdomName) publishKingdomEvent(out.fromKingdomName, "embassy_mission_response", { missionId: out.mission.id, status: out.mission.status });
    return res.json({ ok: true, ...out });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/guildhall/:kingdom/sabotage", requireAuth, async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  const parsed = guildSabotageBody.safeParse(req.body || {});
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });
  try {
    const out = await withTx(async (c) => {
      const atk = await c.query(`SELECT id, name FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`, [kingdom]);
      if (!atk.rowCount) throw new Error("attacker kingdom not found");
      const def = await c.query(`SELECT id, name FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`, [parsed.data.defenderKingdom]);
      if (!def.rowCount) throw new Error("defender kingdom not found");
      if (Number(atk.rows[0].id) === Number(def.rows[0].id)) throw new Error("cannot sabotage your own kingdom");
      const attackerId = Number(atk.rows[0].id);
      const defenderId = Number(def.rows[0].id);

      await cleanupExpiredEffectsTx(c, attackerId);
      await cleanupExpiredEffectsTx(c, defenderId);

      const spiesAtk = await c.query(`SELECT amount FROM kingdom_troops WHERE kingdom_id=$1 AND troop_code='spies' FOR UPDATE`, [attackerId]);
      const spiesDef = await c.query(`SELECT amount FROM kingdom_troops WHERE kingdom_id=$1 AND troop_code='spies' FOR UPDATE`, [defenderId]);
      const atkHave = Number(spiesAtk.rows[0]?.amount || 0);
      const defHave = Number(spiesDef.rows[0]?.amount || 0);
      if (atkHave < parsed.data.spiesToSend) throw new Error(`not enough spies (have ${atkHave}, need ${parsed.data.spiesToSend})`);
      const attackBonus = await activeEffectMagnitudeTx(c, attackerId, "intel_vision");
      const defenseBonus = await activeEffectMagnitudeTx(c, defenderId, "divine_barrier") + await activeEffectMagnitudeTx(c, defenderId, "peace_pact");

      const outcome = resolveSabotageOutcome({
        spiesToSend: parsed.data.spiesToSend,
        defenderSpiesHome: defHave,
        defenderResourceAmount: 0,
        attackBonus,
        defenseBonus,
        random: Math.random,
      });
      let { success, spyLosses, survivors } = outcome;
      await c.query(`UPDATE kingdom_troops SET amount=amount-$2 WHERE kingdom_id=$1 AND troop_code='spies'`, [attackerId, parsed.data.spiesToSend]);
      if (survivors > 0) await c.query(`UPDATE kingdom_troops SET amount=amount+$2 WHERE kingdom_id=$1 AND troop_code='spies'`, [attackerId, survivors]);

      let stolen = 0;
      let priestsLost = 0;
      if (success && parsed.data.operation === "resource_heist") {
        const defResQ = await c.query(`SELECT ${parsed.data.resource} AS amount FROM kingdoms WHERE id=$1 FOR UPDATE`, [defenderId]);
        const defAmt = Number(defResQ.rows[0]?.amount || 0);
        const barrierFactor = Math.max(0.25, 1 - Math.max(0, defenseBonus));
        stolen = Math.floor(computeSabotageStolen(parsed.data.spiesToSend, defAmt) * barrierFactor);
        if (stolen > 0) {
          await c.query(`UPDATE kingdoms SET ${parsed.data.resource} = ${parsed.data.resource} - $2 WHERE id=$1`, [defenderId, stolen]);
          await c.query(`UPDATE kingdoms SET ${parsed.data.resource} = ${parsed.data.resource} + $2 WHERE id=$1`, [attackerId, stolen]);
        }
      } else if (success && parsed.data.operation === "priest_assassination") {
        const priestsQ = await c.query(`SELECT amount FROM kingdom_troops WHERE kingdom_id=$1 AND troop_code='priests' FOR UPDATE`, [defenderId]);
        const priestsHave = Number(priestsQ.rows[0]?.amount || 0);
        const cap = Math.max(8, Math.floor(parsed.data.spiesToSend * 0.5));
        priestsLost = Math.min(priestsHave, cap);
        if (priestsLost > 0) {
          await c.query(`UPDATE kingdom_troops SET amount=amount-$2 WHERE kingdom_id=$1 AND troop_code='priests'`, [defenderId, priestsLost]);
        }
      }
      await sendNoticeTx(
        c,
        defenderId,
        success ? "warning" : "info",
        `${atk.rows[0].name} attempted a ${parsed.data.operation} sabotage operation.`,
        { success, operation: parsed.data.operation, resource: parsed.data.resource, stolen, priestsLost, spyLosses, attackBonus, defenseBonus },
      );
      return {
        success,
        operation: parsed.data.operation,
        resource: parsed.data.resource,
        stolen,
        priestsLost,
        spyLosses,
        survivors,
        attackBonus,
        defenseBonus,
      };
    });
    publishKingdomEvent(parsed.data.defenderKingdom, "guild_sabotage", { success: out.success, operation: out.operation, resource: out.resource, stolen: out.stolen, priestsLost: out.priestsLost });
    return res.json({ ok: true, ...out });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/api/admin/kingdoms", requireAdmin, async (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
  const offset = Math.max(0, Number(req.query.offset || 0));
  const search = String(req.query.search || "").trim();
  try {
    const q = await pool.query(
      `SELECT k.id, k.name, k.land, k.gold, k.food, k.wood, k.stone, u.id AS user_id, u.username, u.email, u.is_admin, u.is_banned, u.banned_reason, k.created_at
       FROM kingdoms k JOIN app_users u ON u.id = k.user_id
       WHERE ($1='' OR LOWER(k.name) LIKE '%'||LOWER($1)||'%' OR LOWER(u.username) LIKE '%'||LOWER($1)||'%')
       ORDER BY k.land DESC LIMIT $2 OFFSET $3`,
      [search, limit, offset],
    );
    const total = await pool.query(`SELECT COUNT(*) AS cnt FROM kingdoms k JOIN app_users u ON u.id=k.user_id WHERE ($1='' OR LOWER(k.name) LIKE '%'||LOWER($1)||'%' OR LOWER(u.username) LIKE '%'||LOWER($1)||'%')`, [search]);
    return res.json({ ok: true, kingdoms: q.rows, total: Number(total.rows[0].cnt) });
  } catch (e: any) { return res.status(500).json({ ok: false, error: String(e?.message || e) }); }
});

app.get("/api/admin/users", requireAdmin, async (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
  const offset = Math.max(0, Number(req.query.offset || 0));
  const search = String(req.query.search || "").trim();
  try {
    const q = await pool.query(
      `SELECT u.id, u.username, u.email, u.email_verified, u.is_admin, u.is_banned, u.banned_reason,
              u.premium_started_at, u.premium_ends_at, u.created_at, u.registration_ip, k.name AS kingdom_name
       FROM app_users u LEFT JOIN kingdoms k ON k.user_id = u.id
       WHERE ($1='' OR LOWER(u.username) LIKE '%'||LOWER($1)||'%' OR LOWER(u.email) LIKE '%'||LOWER($1)||'%')
       ORDER BY u.created_at DESC LIMIT $2 OFFSET $3`,
      [search, limit, offset],
    );
    const total = await pool.query(`SELECT COUNT(*) AS cnt FROM app_users u WHERE ($1='' OR LOWER(u.username) LIKE '%'||LOWER($1)||'%' OR LOWER(u.email) LIKE '%'||LOWER($1)||'%')`, [search]);
    return res.json({ ok: true, users: q.rows, total: Number(total.rows[0].cnt) });
  } catch (e: any) { return res.status(500).json({ ok: false, error: String(e?.message || e) }); }
});

app.get("/api/admin/audit-log", requireAdmin, async (req, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit || 100)));
  const offset = Math.max(0, Number(req.query.offset || 0));
  const actor = String(req.query.actor || "").trim();
  const action = String(req.query.action || "").trim();
  try {
    const q = await pool.query(
      `
      SELECT id, actor_user_id, actor_username, action, target_kind, target_id, payload, created_at
      FROM admin_audit_log
      WHERE ($1='' OR LOWER(actor_username)=LOWER($1))
        AND ($2='' OR LOWER(action)=LOWER($2))
      ORDER BY created_at DESC
      LIMIT $3 OFFSET $4
      `,
      [actor, action, limit, offset],
    );
    const total = await pool.query(
      `
      SELECT COUNT(*)::int AS cnt
      FROM admin_audit_log
      WHERE ($1='' OR LOWER(actor_username)=LOWER($1))
        AND ($2='' OR LOWER(action)=LOWER($2))
      `,
      [actor, action],
    );
    return res.json({ ok: true, items: q.rows, total: Number(total.rows[0]?.cnt || 0) });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/admin/ban", requireAdmin, async (req, res) => {
  const parsed = z.object({ userId: z.string().min(1), reason: z.string().max(500).optional() }).safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });
  const admin = (req as any).adminSession;
  try {
    const out = await withTx(async (c) => {
      const r = await c.query(`UPDATE app_users SET is_banned=true, banned_reason=$2 WHERE id=$1 AND is_admin=false RETURNING id`, [parsed.data.userId, parsed.data.reason || null]);
      if (!r.rowCount) throw new Error("user not found or user is an admin");
      await c.query(`DELETE FROM auth_sessions WHERE user_id=$1`, [parsed.data.userId]);
      await logAdminActionTx(c, admin, "ban_user", "user", parsed.data.userId, { reason: parsed.data.reason || null });
      return true;
    });
    if (!out) return res.status(404).json({ ok: false, error: "user not found or user is an admin" });
    return res.json({ ok: true });
  } catch (e: any) {
    const msg = String(e?.message || e);
    return res.status(msg.includes("not found") ? 404 : 500).json({ ok: false, error: msg });
  }
});

app.post("/api/admin/unban", requireAdmin, async (req, res) => {
  const parsed = z.object({ userId: z.string().min(1) }).safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });
  const admin = (req as any).adminSession;
  try {
    const out = await withTx(async (c) => {
      const r = await c.query(`UPDATE app_users SET is_banned=false, banned_reason=NULL WHERE id=$1 RETURNING id`, [parsed.data.userId]);
      if (!r.rowCount) throw new Error("user not found");
      await logAdminActionTx(c, admin, "unban_user", "user", parsed.data.userId, {});
      return true;
    });
    if (!out) return res.status(404).json({ ok: false, error: "user not found" });
    return res.json({ ok: true });
  } catch (e: any) {
    const msg = String(e?.message || e);
    return res.status(msg.includes("not found") ? 404 : 500).json({ ok: false, error: msg });
  }
});

app.post("/api/admin/set-admin", requireAdmin, async (req, res) => {
  const parsed = z.object({ userId: z.string().min(1), grant: z.boolean() }).safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });
  const self = (req as any).adminSession;
  if (String(self.user_id) === parsed.data.userId && !parsed.data.grant) return res.status(400).json({ ok: false, error: "cannot revoke your own admin" });
  try {
    const out = await withTx(async (c) => {
      const r = await c.query(`UPDATE app_users SET is_admin=$2 WHERE id=$1 RETURNING id`, [parsed.data.userId, parsed.data.grant]);
      if (!r.rowCount) throw new Error("user not found");
      await logAdminActionTx(c, self, parsed.data.grant ? "grant_admin" : "revoke_admin", "user", parsed.data.userId, {});
      return true;
    });
    if (!out) return res.status(404).json({ ok: false, error: "user not found" });
    return res.json({ ok: true });
  } catch (e: any) {
    const msg = String(e?.message || e);
    return res.status(msg.includes("not found") ? 404 : 500).json({ ok: false, error: msg });
  }
});

app.post("/api/admin/set-premium", requireAdmin, async (req, res) => {
  const parsed = z.object({
    userId: z.string().min(1),
    days: z.number().int().min(0).max(3650),
  }).safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });
  const admin = (req as any).adminSession;
  try {
    const out = await withTx(async (c) => {
      const q = await c.query(
        `SELECT id, premium_started_at, premium_ends_at, premium_shield_last_used_at
         FROM app_users
         WHERE id=$1
         LIMIT 1
         FOR UPDATE`,
        [parsed.data.userId],
      );
      if (!q.rowCount) throw new Error("user not found");
      const u = q.rows[0];
      if (parsed.data.days <= 0) {
        const cleared = await c.query(
          `UPDATE app_users
           SET premium_started_at=NULL,
               premium_ends_at=NULL,
               premium_shield_last_used_at=NULL
           WHERE id=$1
           RETURNING id, premium_started_at, premium_ends_at, premium_shield_last_used_at`,
          [parsed.data.userId],
        );
        await logAdminActionTx(c, admin, "clear_premium", "user", parsed.data.userId, {});
        return cleared.rows[0];
      }
      const now = new Date();
      const currentEnds = u.premium_ends_at ? new Date(u.premium_ends_at) : null;
      const active = Boolean(currentEnds && currentEnds.getTime() > now.getTime());
      const nextBase = active && currentEnds ? currentEnds : now;
      const startedAt = active && u.premium_started_at ? new Date(u.premium_started_at) : now;
      const nextEnds = new Date(nextBase.getTime() + parsed.data.days * 24 * 3600 * 1000);
      const updated = await c.query(
        `UPDATE app_users
         SET premium_started_at=$2,
             premium_ends_at=$3
         WHERE id=$1
         RETURNING id, premium_started_at, premium_ends_at, premium_shield_last_used_at`,
        [parsed.data.userId, startedAt.toISOString(), nextEnds.toISOString()],
      );
      await logAdminActionTx(c, admin, "set_premium", "user", parsed.data.userId, { days: parsed.data.days });
      return updated.rows[0];
    });
    return res.json({ ok: true, premium: premiumStatusFromRow(out) });
  } catch (e: any) {
    const msg = String(e?.message || e);
    return res.status(msg.includes("not found") ? 404 : 400).json({ ok: false, error: msg });
  }
});

app.post("/api/admin/resend-verification", requireAdmin, async (req, res) => {
  const parsed = z.object({ userId: z.string().min(1) }).safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });
  const admin = (req as any).adminSession;
  try {
    const out = await withTx(async (c) => {
      const u = await c.query(`SELECT id, email, username, email_verified FROM app_users WHERE id=$1 LIMIT 1 FOR UPDATE`, [parsed.data.userId]);
      if (!u.rowCount) throw new Error("user not found");
      const user = u.rows[0];
      const email = String(user.email || "").trim();
      if (!email) throw new Error("user has no email address");
      if (Boolean(user.email_verified)) throw new Error("email is already verified");

      await c.query(`DELETE FROM email_verification_tokens WHERE user_id=$1 AND used_at IS NULL`, [user.id]);
      const verifyToken = randomBytes(32).toString("hex");
      await c.query(`INSERT INTO email_verification_tokens(token, user_id) VALUES($1,$2)`, [verifyToken, user.id]);
      await logAdminActionTx(c, admin, "resend_verification", "user", parsed.data.userId, { email });
      return { email, username: String(user.username || "Commander"), verifyToken };
    });
    void sendEmail(
      out.email,
      "Verify your Crownforge email",
      `<p>Hi ${out.username},</p><p><a href="${APP_BASE_URL}/?verify=${out.verifyToken}">Verify Email</a></p><p>Expires in 24 hours.</p>`,
    ).catch((e: any) => { console.error("Failed to send admin resend-verification email", e); });
    return res.json({ ok: true, message: `Verification email sent to ${out.email}.` });
  } catch (e: any) {
    const msg = String(e?.message || e);
    return res.status(msg.includes("not found") ? 404 : 400).json({ ok: false, error: msg });
  }
});

app.post("/api/admin/update-user", requireAdmin, async (req, res) => {
  const parsed = z.object({
    userId: z.string().min(1),
    username: z.string().min(3).max(32).optional(),
    email: z.string().email().optional(),
    password: z.string().min(8).max(128).optional(),
  }).safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });

  const hasUpdate = parsed.data.username !== undefined || parsed.data.email !== undefined || parsed.data.password !== undefined;
  if (!hasUpdate) return res.status(400).json({ ok: false, error: "no fields provided to update" });
  const admin = (req as any).adminSession;

  try {
    const out = await withTx(async (c) => {
      const u = await c.query(`SELECT id, username, email, email_verified FROM app_users WHERE id=$1 LIMIT 1 FOR UPDATE`, [parsed.data.userId]);
      if (!u.rowCount) throw new Error("user not found");
      const current = u.rows[0];

      const updates: string[] = [];
      const vals: any[] = [current.id];
      let idx = 2;

      const nextUsername = parsed.data.username !== undefined ? normalizeUsername(parsed.data.username) : null;
      if (nextUsername !== null) {
        if (nextUsername.length < 3 || nextUsername.length > 32) throw new Error("username must be 3 to 32 characters");
        const uq = await c.query(`SELECT 1 FROM app_users WHERE LOWER(username)=LOWER($1) AND id <> $2 LIMIT 1`, [nextUsername, current.id]);
        if (uq.rowCount) throw new Error("username already in use");
        updates.push(`username=$${idx++}`);
        vals.push(nextUsername);
      }

      const nextEmail = parsed.data.email !== undefined ? normalizeEmail(parsed.data.email) : null;
      let emailChanged = false;
      if (nextEmail !== null) {
        const eq = await c.query(`SELECT 1 FROM app_users WHERE LOWER(email)=LOWER($1) AND id <> $2 LIMIT 1`, [nextEmail, current.id]);
        if (eq.rowCount) throw new Error("email already in use");
        updates.push(`email=$${idx++}`);
        vals.push(nextEmail);
        emailChanged = normalizeEmail(String(current.email || "")) !== nextEmail;
        if (emailChanged) updates.push(`email_verified=false`);
      }

      if (parsed.data.password !== undefined) {
        updates.push(`password_hash=$${idx++}`);
        vals.push(hashPassword(parsed.data.password));
      }

      if (!updates.length) throw new Error("no changes to apply");
      const updated = await c.query(
        `UPDATE app_users SET ${updates.join(", ")} WHERE id=$1 RETURNING id, username, email, email_verified, is_admin, is_banned`,
        vals,
      );
      const row = updated.rows[0];

      if (emailChanged) {
        await c.query(`DELETE FROM email_verification_tokens WHERE user_id=$1 AND used_at IS NULL`, [row.id]);
        const verifyToken = randomBytes(32).toString("hex");
        await c.query(`INSERT INTO email_verification_tokens(token, user_id) VALUES($1,$2)`, [verifyToken, row.id]);
        const targetEmail = String(row.email || "").trim();
        if (targetEmail) {
          void sendEmail(
            targetEmail,
            "Verify your Crownforge email",
            `<p>Hi ${String(row.username || "Commander")},</p><p><a href="${APP_BASE_URL}/?verify=${verifyToken}">Verify Email</a></p><p>Expires in 24 hours.</p>`,
          ).catch((e: any) => { console.error("Failed to send verification email after admin email update", e); });
        }
      }

      await logAdminActionTx(c, admin, "update_user", "user", parsed.data.userId, {
        usernameChanged: parsed.data.username !== undefined,
        emailChanged: parsed.data.email !== undefined,
        passwordChanged: parsed.data.password !== undefined,
      });

      return {
        id: String(row.id),
        username: String(row.username || ""),
        email: String(row.email || ""),
        email_verified: Boolean(row.email_verified),
        is_admin: Boolean(row.is_admin),
        is_banned: Boolean(row.is_banned),
      };
    });
    return res.json({ ok: true, user: out });
  } catch (e: any) {
    const msg = String(e?.message || e);
    return res.status(msg.includes("not found") ? 404 : 400).json({ ok: false, error: msg });
  }
});

app.post("/api/admin/set-land", requireAdmin, async (req, res) => {
  const parsed = z.object({
    kingdom: z.string().min(2),
    land: z.number().int().min(0).max(2_000_000_000),
  }).safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });
  const admin = (req as any).adminSession;
  try {
    const out = await withTx(async (c) => {
      const k = await c.query(
        `UPDATE kingdoms
         SET land=$2
         WHERE LOWER(name)=LOWER($1)
         RETURNING id, name, land`,
        [parsed.data.kingdom, parsed.data.land],
      );
      if (!k.rowCount) throw new Error("kingdom not found");
      const row = k.rows[0];
      await ensureSettlementsForKingdom(c, Number(row.id), String(row.name), Number(row.land || 0));
      await logAdminActionTx(c, admin, "set_land", "kingdom", String(row.id), { kingdom: row.name, land: Number(row.land || 0) });
      return { id: Number(row.id), name: String(row.name), land: Number(row.land || 0) };
    });
    return res.json({ ok: true, kingdom: out });
  } catch (e: any) {
    const msg = String(e?.message || e);
    return res.status(msg.includes("not found") ? 404 : 500).json({ ok: false, error: msg });
  }
});

app.post("/api/admin/grant-building", requireAdmin, async (req, res) => {
  const parsed = z.object({
    kingdom: z.string().min(1),
    buildingCode: z.string().min(1),
    amount: z.number().int().min(1).max(10_000),
  }).safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });
  const admin = (req as any).adminSession;
  try {
    const out = await withTx(async (c) => {
      const k = await c.query(`SELECT id, name FROM kingdoms WHERE LOWER(name)=LOWER($1)`, [parsed.data.kingdom]);
      if (!k.rowCount) throw new Error("kingdom not found");
      const row = k.rows[0];
      await c.query(
        `INSERT INTO kingdom_buildings (kingdom_id, building_code, level)
         VALUES ($1, $2, $3)
         ON CONFLICT (kingdom_id, building_code)
         DO UPDATE SET level = kingdom_buildings.level + EXCLUDED.level`,
        [row.id, parsed.data.buildingCode, parsed.data.amount],
      );
      const newLevel = await c.query(
        `SELECT level FROM kingdom_buildings WHERE kingdom_id=$1 AND building_code=$2`,
        [row.id, parsed.data.buildingCode],
      );
      const level = Number(newLevel.rows[0]?.level || 0);
      await logAdminActionTx(c, admin, "grant_building", "kingdom", String(row.id), {
        kingdom: row.name, buildingCode: parsed.data.buildingCode, amount: parsed.data.amount, newLevel: level,
      });
      return { id: Number(row.id), name: String(row.name), buildingCode: parsed.data.buildingCode, amount: parsed.data.amount, newLevel: level };
    });
    return res.json({ ok: true, ...out });
  } catch (e: any) {
    const msg = String(e?.message || e);
    return res.status(msg.includes("not found") ? 404 : 500).json({ ok: false, error: msg });
  }
});

app.post("/api/admin/grant-resource", requireAdmin, async (req, res) => {
  const parsed = z.object({
    kingdom: z.string().min(1),
    resource: z.enum(["gold", "food", "wood", "stone"]),
    amount: z.number().int().min(-9_999_999).max(9_999_999),
  }).safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });
  const admin = (req as any).adminSession;
  const col = parsed.data.resource;
  try {
    const out = await withTx(async (c) => {
      const k = await c.query(
        `UPDATE kingdoms SET ${col} = GREATEST(0, ${col} + $2) WHERE LOWER(name)=LOWER($1) RETURNING id, name, ${col}`,
        [parsed.data.kingdom, parsed.data.amount],
      );
      if (!k.rowCount) throw new Error("kingdom not found");
      const row = k.rows[0];
      await logAdminActionTx(c, admin, "grant_resource", "kingdom", String(row.id), {
        kingdom: row.name, resource: col, amount: parsed.data.amount, newValue: Number(row[col] || 0),
      });
      return { id: Number(row.id), name: String(row.name), resource: col, amount: parsed.data.amount, newValue: Number(row[col] || 0) };
    });
    return res.json({ ok: true, ...out });
  } catch (e: any) {
    const msg = String(e?.message || e);
    return res.status(msg.includes("not found") ? 404 : 500).json({ ok: false, error: msg });
  }
});

// ── Prayer endpoints ─────────────────────────────────────────────────────────
app.post("/api/admin/reconcile-land", requireAdmin, async (req, res) => {
  const parsed = z.object({
    kingdom: z.string().min(2).optional(),
    buffer: z.number().int().min(0).max(100000).optional(),
    dryRun: z.boolean().optional(),
  }).safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });
  const admin = (req as any).adminSession;
  const kingdomFilter = String(parsed.data.kingdom || "").trim();
  const buffer = Number(parsed.data.buffer ?? 0);
  const dryRun = Boolean(parsed.data.dryRun);
  try {
    const out = await withTx(async (c) => {
      const kingdomsQ = await c.query(
        `
        SELECT id, name, land
        FROM kingdoms
        WHERE ($1 = '' OR LOWER(name)=LOWER($1))
        ORDER BY id ASC
        FOR UPDATE
        `,
        [kingdomFilter],
      );
      if (!kingdomsQ.rowCount) throw new Error("kingdom not found");
      const changed: Array<{ id: number; name: string; oldLand: number; usedLand: number; newLand: number }> = [];
      let checked = 0;
      for (const k of kingdomsQ.rows) {
        checked += 1;
        const usedQ = await c.query(
          `
          SELECT COALESCE(SUM(kb.level * bt.land_cost), 0)::int AS used_land
          FROM kingdom_buildings kb
          JOIN building_types bt ON bt.code = kb.building_code
          WHERE kb.kingdom_id = $1
          `,
          [k.id],
        );
        const usedLand = Number(usedQ.rows[0]?.used_land || 0);
        const oldLand = Number(k.land || 0);
        const minRequired = usedLand + buffer;
        if (oldLand < minRequired) {
          const newLand = minRequired;
          if (!dryRun) {
            await c.query(`UPDATE kingdoms SET land=$2 WHERE id=$1`, [k.id, newLand]);
            await ensureSettlementsForKingdom(c, Number(k.id), String(k.name), newLand);
          }
          changed.push({ id: Number(k.id), name: String(k.name), oldLand, usedLand, newLand });
        }
      }
      await logAdminActionTx(c, admin, "reconcile_land", kingdomFilter ? "kingdom" : "system", kingdomFilter || "all", {
        dryRun,
        buffer,
        checked,
        changed: changed.length,
      });
      return { checked, changed };
    });
    return res.json({ ok: true, ...out, dryRun, buffer });
  } catch (e: any) {
    const msg = String(e?.message || e);
    return res.status(msg.includes("not found") ? 404 : 500).json({ ok: false, error: msg });
  }
});

app.post("/api/admin/reconcile-population", requireAdmin, async (req, res) => {
  const parsed = z.object({
    kingdom: z.string().min(2).optional(),
    dryRun: z.boolean().optional(),
  }).safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });
  const admin = (req as any).adminSession;
  const kingdomFilter = String(parsed.data.kingdom || "").trim();
  const dryRun = Boolean(parsed.data.dryRun);

  try {
    const out = await withTx(async (c) => {
      const kingdomsQ = await c.query(
        `
        SELECT id, name
        FROM kingdoms
        WHERE ($1 = '' OR LOWER(name)=LOWER($1))
        ORDER BY id ASC
        FOR UPDATE
        `,
        [kingdomFilter],
      );
      if (!kingdomsQ.rowCount) throw new Error("kingdom not found");

      const changed: Array<{ id: number; name: string; cap: number; oldPeasants: number; newPeasants: number }> = [];
      for (const k of kingdomsQ.rows) {
        const bq = await c.query(
          `
          SELECT
            COALESCE(MAX(CASE WHEN building_code='houses' THEN level END),0)::int AS houses,
            COALESCE(MAX(CASE WHEN building_code='castles' THEN level END),0)::int AS castles
          FROM kingdom_buildings
          WHERE kingdom_id=$1
          `,
          [k.id],
        );
        const houses = Number(bq.rows[0]?.houses || 0);
        const castles = Number(bq.rows[0]?.castles || 0);
        const cap = Number(effectivePeasantCap({ houses, castles }));

        const pq = await c.query(
          `SELECT COALESCE(amount,0)::bigint AS peasants FROM kingdom_troops WHERE kingdom_id=$1 AND troop_code='peasants' LIMIT 1 FOR UPDATE`,
          [k.id],
        );
        const oldPeasants = Number(pq.rows[0]?.peasants || 0);
        const newPeasants = Math.max(0, Math.min(oldPeasants, cap));
        if (newPeasants !== oldPeasants) {
          if (!dryRun) {
            await c.query(
              `INSERT INTO kingdom_troops(kingdom_id, troop_code, amount)
               VALUES ($1,'peasants',$2)
               ON CONFLICT (kingdom_id, troop_code) DO UPDATE SET amount=$2`,
              [k.id, newPeasants],
            );
          }
          changed.push({ id: Number(k.id), name: String(k.name || ""), cap, oldPeasants, newPeasants });
        }
      }
      await logAdminActionTx(c, admin, "reconcile_population", kingdomFilter ? "kingdom" : "system", kingdomFilter || "all", {
        dryRun,
        checked: Number(kingdomsQ.rowCount || 0),
        changed: changed.length,
      });
      return { checked: Number(kingdomsQ.rowCount || 0), changed };
    });
    return res.json({ ok: true, dryRun, ...out });
  } catch (e: any) {
    const msg = String(e?.message || e);
    return res.status(msg.includes("not found") ? 404 : 500).json({ ok: false, error: msg });
  }
});

app.post("/api/admin/reconcile-spy-capacity", requireAdmin, async (req, res) => {
  const parsed = z.object({
    kingdom: z.string().min(2).optional(),
    dryRun: z.boolean().optional(),
  }).safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });
  const admin = (req as any).adminSession;
  const kingdomFilter = String(parsed.data.kingdom || "").trim();
  const dryRun = Boolean(parsed.data.dryRun);

  try {
    const out = await withTx(async (c) => {
      const kingdomsQ = await c.query(
        `
        SELECT id, name
        FROM kingdoms
        WHERE ($1 = '' OR LOWER(name)=LOWER($1))
        ORDER BY id ASC
        FOR UPDATE
        `,
        [kingdomFilter],
      );
      if (!kingdomsQ.rowCount) throw new Error("kingdom not found");

      const changed: Array<{
        id: number;
        name: string;
        capacity: number;
        homeSpies: number;
        trainSpies: number;
        awaySpies: number;
        oldHomeSpies: number;
        newHomeSpies: number;
      }> = [];

      for (const k of kingdomsQ.rows) {
        const bq = await c.query(
          `SELECT COALESCE(MAX(level),0)::int AS guildhalls FROM kingdom_buildings WHERE kingdom_id=$1 AND building_code='guildhalls' LIMIT 1`,
          [k.id],
        );
        const capacity = Number(bq.rows[0]?.guildhalls || 0) * SPY_CAPACITY_PER_GUILDHALL;
        const usageQ = await c.query(
          `
          WITH home AS (
            SELECT COALESCE(amount,0)::bigint AS qty FROM kingdom_troops WHERE kingdom_id=$1 AND troop_code='spies'
          ),
          train AS (
            SELECT COALESCE(SUM(quantity),0)::bigint AS qty FROM train_queue WHERE kingdom_id=$1 AND troop_code='spies' AND status='queued'
          ),
          away AS (
            SELECT COALESCE(SUM(quantity),0)::bigint AS qty FROM troop_movements WHERE owner_kingdom_id=$1 AND troop_code='spies' AND status='out' AND returns_at > now()
          )
          SELECT
            COALESCE((SELECT qty FROM home),0)::bigint AS home_qty,
            COALESCE((SELECT qty FROM train),0)::bigint AS train_qty,
            COALESCE((SELECT qty FROM away),0)::bigint AS away_qty
          `,
          [k.id],
        );
        const oldHomeSpies = Number(usageQ.rows[0]?.home_qty || 0);
        const trainSpies = Number(usageQ.rows[0]?.train_qty || 0);
        const awaySpies = Number(usageQ.rows[0]?.away_qty || 0);
        const maxHome = Math.max(0, capacity - trainSpies - awaySpies);
        const newHomeSpies = Math.min(oldHomeSpies, maxHome);
        if (newHomeSpies !== oldHomeSpies) {
          if (!dryRun) {
            await c.query(
              `INSERT INTO kingdom_troops(kingdom_id, troop_code, amount)
               VALUES ($1,'spies',$2)
               ON CONFLICT (kingdom_id, troop_code) DO UPDATE SET amount=$2`,
              [k.id, newHomeSpies],
            );
          }
          changed.push({
            id: Number(k.id),
            name: String(k.name || ""),
            capacity,
            homeSpies: newHomeSpies,
            trainSpies,
            awaySpies,
            oldHomeSpies,
            newHomeSpies,
          });
        }
      }
      await logAdminActionTx(c, admin, "reconcile_spy_capacity", kingdomFilter ? "kingdom" : "system", kingdomFilter || "all", {
        dryRun,
        checked: Number(kingdomsQ.rowCount || 0),
        changed: changed.length,
      });
      return { checked: Number(kingdomsQ.rowCount || 0), changed };
    });
    return res.json({ ok: true, dryRun, ...out });
  } catch (e: any) {
    const msg = String(e?.message || e);
    return res.status(msg.includes("not found") ? 404 : 500).json({ ok: false, error: msg });
  }
});

app.post("/api/admin/reconcile-train-queue-times", requireAdmin, async (req, res) => {
  const parsed = z.object({
    kingdom: z.string().min(2).optional(),
    dryRun: z.boolean().optional(),
  }).safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });
  const admin = (req as any).adminSession;
  const kingdomFilter = String(parsed.data.kingdom || "").trim();
  const dryRun = Boolean(parsed.data.dryRun);

  try {
    const out = await withTx(async (c) => {
      const q = await c.query(
        `
        SELECT
          tq.id,
          tq.kingdom_id,
          k.name AS kingdom_name,
          tq.troop_code,
          tq.quantity,
          tq.started_at,
          tq.completes_at,
          tt.train_seconds
        FROM train_queue tq
        JOIN kingdoms k ON k.id = tq.kingdom_id
        JOIN troop_types tt ON tt.code = tq.troop_code
        WHERE tq.status='queued'
          AND ($1 = '' OR LOWER(k.name)=LOWER($1))
        ORDER BY tq.id ASC
        FOR UPDATE
        `,
        [kingdomFilter],
      );

      const changed: Array<{
        id: number;
        kingdom: string;
        troopCode: string;
        quantity: number;
        oldCompletesAt: string;
        newCompletesAt: string;
      }> = [];

      for (const row of q.rows) {
        const startedAt = row.started_at ? new Date(row.started_at) : new Date();
        const seconds = Math.max(1, Number(row.train_seconds || 1));
        const desired = new Date(startedAt.getTime() + seconds * 1000);
        const current = row.completes_at ? new Date(row.completes_at) : null;
        const diff = current ? Math.abs(current.getTime() - desired.getTime()) : Number.POSITIVE_INFINITY;
        if (diff <= 1000) continue;

        if (!dryRun) {
          await c.query(
            `UPDATE train_queue SET completes_at=$2 WHERE id=$1 AND status='queued'`,
            [Number(row.id), desired.toISOString()],
          );
        }

        changed.push({
          id: Number(row.id),
          kingdom: String(row.kingdom_name || ""),
          troopCode: String(row.troop_code || ""),
          quantity: Number(row.quantity || 0),
          oldCompletesAt: current ? current.toISOString() : "",
          newCompletesAt: desired.toISOString(),
        });
      }
      await logAdminActionTx(c, admin, "reconcile_train_queue_times", kingdomFilter ? "kingdom" : "system", kingdomFilter || "all", {
        dryRun,
        checked: Number(q.rowCount || 0),
        changed: changed.length,
      });

      return { checked: Number(q.rowCount || 0), changed };
    });

    return res.json({ ok: true, dryRun, ...out });
  } catch (e: any) {
    const msg = String(e?.message || e);
    return res.status(msg.includes("not found") ? 404 : 500).json({ ok: false, error: msg });
  }
});

app.get("/api/pray/:kingdom", async (req, res) => {
  try {
    const k = await pool.query(`SELECT id, mana, gold, food, horses FROM kingdoms WHERE LOWER(name)=LOWER($1)`, [req.params.kingdom]);
    if (!k.rowCount) return res.status(404).json({ ok: false, error: "kingdom not found" });
    const kRow = k.rows[0];

    const [templesQ, priestsQ, priestsTrainQ, priestTypeQ] = await Promise.all([
      pool.query(`SELECT COALESCE(MAX(level),0) AS temples FROM kingdom_buildings WHERE kingdom_id=$1 AND building_code='temples'`, [kRow.id]),
      pool.query(`SELECT COALESCE(SUM(amount),0) AS priests FROM kingdom_troops WHERE kingdom_id=$1 AND troop_code='priests'`, [kRow.id]),
      pool.query(`SELECT COALESCE(SUM(quantity),0) AS priests_train FROM train_queue WHERE kingdom_id=$1 AND troop_code='priests' AND status='queued'`, [kRow.id]),
      pool.query(`SELECT COALESCE(gold_cost,400) AS gold_cost, COALESCE(food_cost,150) AS food_cost, COALESCE(horse_cost,0) AS horse_cost FROM troop_types WHERE code='priests' LIMIT 1`),
    ]);
    const priestCap = Number(templesQ.rows[0]?.temples || 0) * PRIESTS_PER_TEMPLE;
    const priests = Number(priestsQ.rows[0]?.priests || 0);
    const priestsTrain = Number(priestsTrainQ.rows[0]?.priests_train || 0);
    const priestsAvailable = Math.max(0, priestCap - (priests + priestsTrain));
    const priestGoldCost = Number(priestTypeQ.rows[0]?.gold_cost || 400);
    const priestFoodCost = Number(priestTypeQ.rows[0]?.food_cost || 150);
    const priestHorseCost = Number(priestTypeQ.rows[0]?.horse_cost || 0);
    const maxByCost = (have: number, cost: number) =>
      cost > 0 ? Math.max(0, Math.floor(have / cost)) : Number.POSITIVE_INFINITY;
    const priestMaxTrainNow = Math.max(
      0,
      Math.min(
        priestsAvailable,
        maxByCost(Number(kRow.gold || 0), priestGoldCost),
        maxByCost(Number(kRow.food || 0), priestFoodCost),
        maxByCost(Number(kRow.horses || 0), priestHorseCost),
      ),
    );
    const manaPerHour = Math.min(priests, priestCap) * MANA_PER_PRIEST_PER_HOUR;

    // Clean up expired prayers
    await pool.query(`DELETE FROM kingdom_prayers WHERE kingdom_id=$1 AND ends_at <= now()`, [kRow.id]);
    await pool.query(`DELETE FROM kingdom_status_effects WHERE kingdom_id=$1 AND ends_at <= now()`, [kRow.id]);

    const prayers = await pool.query(
      `SELECT id, prayer_code, started_at, ends_at, mana_spent FROM kingdom_prayers WHERE kingdom_id=$1 ORDER BY started_at ASC`,
      [kRow.id],
    );
    const casts = await pool.query(
      `SELECT id, spell_code, mana_spent, payload, created_at
       FROM kingdom_spell_casts
       WHERE kingdom_id=$1
       ORDER BY created_at DESC
       LIMIT 25`,
      [kRow.id],
    );
    const effects = await pool.query(
      `
      SELECT effect_code, magnitude, payload, starts_at, ends_at
      FROM kingdom_status_effects
      WHERE kingdom_id=$1 AND ends_at > now()
      ORDER BY ends_at ASC
      LIMIT 50
      `,
      [kRow.id],
    );
    return res.json({
      ok: true,
      mana: Number(kRow.mana || 0),
      priests,
      priestsTrain,
      priestCap,
      priestAvailable: priestsAvailable,
      priestCosts: {
        gold: priestGoldCost,
        food: priestFoodCost,
        horses: priestHorseCost,
      },
      priestMaxTrainNow,
      kingdomResources: {
        gold: Number(kRow.gold || 0),
        food: Number(kRow.food || 0),
        horses: Number(kRow.horses || 0),
      },
      manaPerHour,
      activePrayers: prayers.rows,
      recentCasts: casts.rows,
      activeEffects: effects.rows,
    });
  } catch (e: any) { return res.status(500).json({ ok: false, error: String(e?.message || e) }); }
});

app.post("/api/pray/:kingdom/start", requireAuth, async (req, res) => {
  const parsed = z.object({ prayerCode: z.string().min(1), days: z.number().int().min(1).max(90) }).safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });
  const { prayerCode, days } = parsed.data;
  if (!PRAYERS[prayerCode]) return res.status(400).json({ ok: false, error: "unknown prayer" });
  try {
    const out = await withTx(async (c) => {
      const k = await c.query(`SELECT id, mana FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`, [req.params.kingdom]);
      if (!k.rowCount) throw new Error("kingdom not found");
      const kRow = k.rows[0];
      const manaCost = PRAYERS[prayerCode].manaPerDay * days;
      const currentMana = Number(kRow.mana || 0);
      if (currentMana < manaCost) throw new Error(`Not enough mana. Need ${manaCost}, have ${currentMana}.`);
      await c.query(`UPDATE kingdoms SET mana = mana - $2 WHERE id=$1`, [kRow.id, manaCost]);
      const endsAt = new Date(Date.now() + days * 86400 * 1000);
      const ins = await c.query(
        `INSERT INTO kingdom_prayers(kingdom_id, prayer_code, ends_at, mana_spent) VALUES($1,$2,$3,$4) RETURNING id`,
        [kRow.id, prayerCode, endsAt, manaCost],
      );
      return { prayerId: ins.rows[0].id, manaCost, endsAt };
    });
    return res.json({ ok: true, ...out });
  } catch (e: any) { return res.status(400).json({ ok: false, error: String(e?.message || e) }); }
});

app.post("/api/pray/:kingdom/stop", requireAuth, async (req, res) => {
  const parsed = z.object({ prayerId: z.number().int().positive() }).safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });
  try {
    const k = await pool.query(`SELECT id FROM kingdoms WHERE LOWER(name)=LOWER($1)`, [req.params.kingdom]);
    if (!k.rowCount) return res.status(404).json({ ok: false, error: "kingdom not found" });
    const r = await pool.query(
      `DELETE FROM kingdom_prayers WHERE id=$1 AND kingdom_id=$2 RETURNING id`,
      [parsed.data.prayerId, k.rows[0].id],
    );
    if (!r.rowCount) return res.status(404).json({ ok: false, error: "prayer not found" });
    return res.json({ ok: true });
  } catch (e: any) { return res.status(500).json({ ok: false, error: String(e?.message || e) }); }
});

app.post("/api/pray/:kingdom/cast", requireAuth, async (req, res) => {
  const parsed = holyCircleCastBody.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });
  const spellCode = parsed.data.spellCode;
  const targetKingdom = String(parsed.data.targetKingdom || "").trim();
  if ((spellCode === "blight" || spellCode === "mana_leech") && !targetKingdom) {
    return res.status(400).json({ ok: false, error: "targetKingdom is required for this spell" });
  }
  try {
    const out = await withTx(async (c) => {
      const k = await c.query(`SELECT id, mana, food, stone, gold FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`, [req.params.kingdom]);
      if (!k.rowCount) throw new Error("kingdom not found");
      const kr = k.rows[0];
      await cleanupExpiredEffectsTx(c, Number(kr.id));
      const manaHave = Number(kr.mana || 0);
      const manaCost = Number(HOLY_SPELL_COSTS[spellCode] || 0);
      if (manaHave < manaCost) throw new Error(`not enough mana (need ${manaCost}, have ${manaHave})`);
      await c.query(`UPDATE kingdoms SET mana=mana-$2 WHERE id=$1`, [kr.id, manaCost]);

      const delta = resolveHolySpellDelta(spellCode, Math.random);
      let target: { id: number; name: string } | null = null;
      if (targetKingdom) {
        const tq = await c.query(`SELECT id, name, mana, food FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`, [targetKingdom]);
        if (!tq.rowCount) throw new Error("target kingdom not found");
        target = { id: Number(tq.rows[0].id), name: String(tq.rows[0].name || targetKingdom) };
        if (target.id === Number(kr.id)) throw new Error("cannot target your own kingdom");
      }

      if (delta.mana) await c.query(`UPDATE kingdoms SET mana=mana+$2 WHERE id=$1`, [kr.id, delta.mana]);
      if (delta.food) await c.query(`UPDATE kingdoms SET food=food+$2 WHERE id=$1`, [kr.id, delta.food]);
      if (delta.stone) await c.query(`UPDATE kingdoms SET stone=stone+$2 WHERE id=$1`, [kr.id, delta.stone]);
      if (delta.gold) await c.query(`UPDATE kingdoms SET gold=gold+$2 WHERE id=$1`, [kr.id, delta.gold]);

      if (spellCode === "divine_barrier") {
        const eff = await addTimedEffectTx(c, {
          kingdomId: Number(kr.id),
          effectCode: "divine_barrier",
          magnitude: Number(delta.sabotageDefenseBonus || 0.22),
          hours: Number(delta.barrierHours || 12),
          sourceKind: "spell_cast",
          sourceRef: null,
          payload: {},
        });
        (delta as any).barrierExpiresAt = eff.expiresAt;
      }

      if (spellCode === "blight" && target) {
        const q = await c.query(`SELECT food FROM kingdoms WHERE id=$1 FOR UPDATE`, [target.id]);
        const have = Number(q.rows[0]?.food || 0);
        const drained = Math.min(have, Number(delta.foodDrain || 0));
        if (drained > 0) await c.query(`UPDATE kingdoms SET food=food-$2 WHERE id=$1`, [target.id, drained]);
        (delta as any).foodDrained = drained;
      }

      if (spellCode === "mana_leech" && target) {
        const q = await c.query(`SELECT mana FROM kingdoms WHERE id=$1 FOR UPDATE`, [target.id]);
        const have = Number(q.rows[0]?.mana || 0);
        const drained = Math.min(have, Number(delta.manaDrain || 0));
        const gained = Math.floor(drained * Number(delta.manaGainFactor || 0.6));
        if (drained > 0) await c.query(`UPDATE kingdoms SET mana=mana-$2 WHERE id=$1`, [target.id, drained]);
        if (gained > 0) await c.query(`UPDATE kingdoms SET mana=mana+$2 WHERE id=$1`, [kr.id, gained]);
        (delta as any).manaDrained = drained;
        (delta as any).manaGained = gained;
      }

      await c.query(
        `INSERT INTO kingdom_spell_casts(kingdom_id, spell_code, mana_spent, payload) VALUES($1,$2,$3,$4::jsonb)`,
        [kr.id, spellCode, manaCost, JSON.stringify({ ...delta, targetKingdom: target?.name || null })],
      );
      if (target) {
        await sendNoticeTx(
          c,
          target.id,
          "warning",
          `${req.params.kingdom} cast ${spellCode} on your kingdom.`,
          { spellCode, from: req.params.kingdom, delta },
        );
      }
      return { spellCode, manaCost, delta, targetKingdom: target?.name || null };
    });
    publishKingdomEvent(req.params.kingdom, "spell_cast", { spellCode: out.spellCode, delta: out.delta });
    if (out.targetKingdom) publishKingdomEvent(out.targetKingdom, "spell_hit", { spellCode: out.spellCode, delta: out.delta });
    return res.json({ ok: true, ...out });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

// ── Priest: Bless Army ───────────────────────────────────────────────────────
// Costs 2000 mana, requires at least 3 priests, grants army_blessing (+5% att) for 24h
app.post("/api/pray/:kingdom/bless", requireAuth, async (req, res) => {
  try {
    const session = (req as any).authSession;
    const out = await withTx(async (c) => {
      const k = await c.query(
        `SELECT id, mana FROM kingdoms WHERE LOWER(name)=LOWER($1) AND user_id=$2 FOR UPDATE`,
        [req.params.kingdom, session.user_id],
      );
      if (!k.rowCount) throw new Error("kingdom not found or not yours");
      const kr = k.rows[0];
      const priestsQ = await c.query(
        `SELECT COALESCE(amount,0) AS qty FROM kingdom_troops WHERE kingdom_id=$1 AND troop_code='priests'`,
        [kr.id],
      );
      const priests = Number(priestsQ.rows[0]?.qty || 0);
      if (priests < 3) throw new Error(`Bless Army requires at least 3 Priests (you have ${priests})`);
      const manaCost = 2000;
      if (Number(kr.mana || 0) < manaCost) throw new Error(`Not enough mana (need ${manaCost}, have ${Math.floor(Number(kr.mana || 0))})`);
      // Check if blessing is already active
      const existing = await c.query(
        `SELECT id FROM kingdom_status_effects WHERE kingdom_id=$1 AND effect_code='army_blessing' AND ends_at > now() LIMIT 1`,
        [kr.id],
      );
      if (existing.rowCount) throw new Error("Army Blessing is already active");
      await c.query(`UPDATE kingdoms SET mana = mana - $2 WHERE id=$1`, [kr.id, manaCost]);
      const endsAt = new Date(Date.now() + 24 * 3600 * 1000);
      await c.query(
        `INSERT INTO kingdom_status_effects(kingdom_id, effect_code, source_kind, source_ref, magnitude, payload, ends_at)
         VALUES($1,'army_blessing','priest_bless',$2,0.05,'{}',  $3)`,
        [kr.id, kr.id, endsAt],
      );
      return { manaCost, endsAt, priests };
    });
    return res.json({ ok: true, message: `Army blessed for 24 hours (+5% attack). Cost: ${out.manaCost} mana.`, ...out });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

// ── Marketplace endpoints ─────────────────────────────────────────────────────
app.get("/api/market", async (req, res) => {
  const resource = String(req.query.resource || "").trim();
  const validResources = ["food", "wood", "stone", "horses"];
  try {
    const filter = validResources.includes(resource) ? resource : null;
    const q = await pool.query(
      `SELECT id, seller_kingdom_name, resource, quantity, quantity_remaining, price_per_unit, expires_at
       FROM market_listings
       WHERE status='active' AND expires_at > now()
       ${filter ? "AND resource=$1" : ""}
       ORDER BY resource ASC, price_per_unit ASC
       LIMIT 200`,
      filter ? [filter] : [],
    );
    return res.json({ ok: true, listings: q.rows });
  } catch (e: any) { return res.status(500).json({ ok: false, error: String(e?.message || e) }); }
});

app.get("/api/market/:kingdom/history", async (req, res) => {
  try {
    const k = await pool.query(`SELECT id, name FROM kingdoms WHERE LOWER(name)=LOWER($1)`, [req.params.kingdom]);
    if (!k.rowCount) return res.status(404).json({ ok: false, error: "kingdom not found" });
    const kId = k.rows[0].id;

    const [listingsQ, tradesQ] = await Promise.all([
      pool.query(
        `SELECT id, resource, quantity, quantity_remaining, price_per_unit, status, listed_at, expires_at
         FROM market_listings WHERE seller_kingdom_id=$1 ORDER BY listed_at DESC LIMIT 100`,
        [kId],
      ),
      pool.query(
        `SELECT id,
                CASE WHEN buyer_kingdom_id=$1 THEN 'buy' ELSE 'sell' END AS trade_side,
                resource, quantity, price_per_unit, total_gold, seller_receives,
                seller_kingdom_name, buyer_kingdom_name, traded_at
         FROM market_trades
         WHERE buyer_kingdom_id=$1 OR seller_kingdom_id=$1
         ORDER BY traded_at DESC LIMIT 200`,
        [kId],
      ),
    ]);
    return res.json({ ok: true, myListings: listingsQ.rows, trades: tradesQ.rows });
  } catch (e: any) { return res.status(500).json({ ok: false, error: String(e?.message || e) }); }
});

app.post("/api/market/:kingdom/list", requireAuth, async (req, res) => {
  const parsed = z.object({
    resource: z.enum(["food", "wood", "stone", "horses"]),
    quantity: z.number().int().min(100).max(1_000_000),
    pricePerUnit: z.number().int().min(1).max(100_000),
  }).safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });
  const { resource, quantity, pricePerUnit } = parsed.data;
  try {
    const out = await withTx(async (c) => {
      const k = await c.query(`SELECT id, name, shield_status, ${resource} AS res_qty FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`, [req.params.kingdom]);
      if (!k.rowCount) throw new Error("kingdom not found");
      const kRow = k.rows[0];
      if (String(kRow.shield_status || "none") === "active") throw new Error("cannot use the market while your shield is active");
      if (Number(kRow.res_qty || 0) < quantity) throw new Error(`Not enough ${resource}. Have ${Number(kRow.res_qty||0).toLocaleString()}, need ${quantity.toLocaleString()}.`);
      await c.query(`UPDATE kingdoms SET ${resource} = ${resource} - $2 WHERE id=$1`, [kRow.id, quantity]);
      const ins = await c.query(
        `INSERT INTO market_listings(seller_kingdom_id, seller_kingdom_name, resource, quantity, quantity_remaining, price_per_unit)
         VALUES($1,$2,$3,$4,$4,$5) RETURNING id, expires_at`,
        [kRow.id, kRow.name, resource, quantity, pricePerUnit],
      );
      return { listingId: ins.rows[0].id, expiresAt: ins.rows[0].expires_at };
    });
    return res.json({ ok: true, ...out });
  } catch (e: any) { return res.status(400).json({ ok: false, error: String(e?.message || e) }); }
});

app.post("/api/market/:kingdom/buy", requireAuth, async (req, res) => {
  const parsed = z.object({ listingId: z.number().int().positive(), quantity: z.number().int().min(1) }).safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });
  const { listingId, quantity } = parsed.data;
  try {
    const out = await withTx(async (c) => {
      const buyer = await c.query(`SELECT id, name, gold, shield_status FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`, [req.params.kingdom]);
      if (!buyer.rowCount) throw new Error("kingdom not found");
      const buyerRow = buyer.rows[0];
      if (String(buyerRow.shield_status || "none") === "active") throw new Error("cannot use the market while your shield is active");

      const listing = await c.query(
        `SELECT id, seller_kingdom_id, seller_kingdom_name, resource, quantity_remaining, price_per_unit FROM market_listings WHERE id=$1 AND status='active' AND expires_at > now() FOR UPDATE`,
        [listingId],
      );
      if (!listing.rowCount) throw new Error("listing not found or no longer active");
      const l = listing.rows[0];
      if (String(l.seller_kingdom_id) === String(buyerRow.id)) throw new Error("cannot buy your own listing");

      const buyQty = Math.min(quantity, Number(l.quantity_remaining));
      if (buyQty <= 0) throw new Error("listing is sold out");
      const totalGold = buyQty * Number(l.price_per_unit);
      if (Number(buyerRow.gold || 0) < totalGold) throw new Error(`Not enough gold. Need ${totalGold.toLocaleString()}, have ${Number(buyerRow.gold||0).toLocaleString()}.`);

      const sellerReceives = Math.floor(totalGold * 0.95);
      const newRemaining = Number(l.quantity_remaining) - buyQty;

      await c.query(`UPDATE kingdoms SET gold = gold - $2 WHERE id=$1`, [buyerRow.id, totalGold]);
      await c.query(
        `UPDATE kingdoms SET gold = gold + $2 WHERE id=$1`,
        [l.seller_kingdom_id, sellerReceives],
      );
      await c.query(
        `UPDATE kingdoms SET ${l.resource} = ${l.resource} + $2 WHERE id=$1`,
        [buyerRow.id, buyQty],
      );
      await c.query(
        `UPDATE market_listings SET quantity_remaining=$2, status=CASE WHEN $2=0 THEN 'sold' ELSE status END WHERE id=$1`,
        [listingId, newRemaining],
      );

      // Lock seller kingdom for gold update (already done above, no need for separate lock)
      const sellerK = await c.query(`SELECT id, name FROM kingdoms WHERE id=$1`, [l.seller_kingdom_id]);
      const sellerName = sellerK.rows[0]?.name || l.seller_kingdom_name;

      await c.query(
        `INSERT INTO market_trades(listing_id, buyer_kingdom_id, buyer_kingdom_name, seller_kingdom_id, seller_kingdom_name, resource, quantity, price_per_unit, total_gold, seller_receives)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [listingId, buyerRow.id, buyerRow.name, l.seller_kingdom_id, sellerName, l.resource, buyQty, l.price_per_unit, totalGold, sellerReceives],
      );
      return { quantity: buyQty, resource: l.resource, totalGold, sellerReceives };
    });
    return res.json({ ok: true, ...out });
  } catch (e: any) { return res.status(400).json({ ok: false, error: String(e?.message || e) }); }
});

app.post("/api/market/:kingdom/cancel", requireAuth, async (req, res) => {
  const parsed = z.object({ listingId: z.number().int().positive() }).safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ ok: false, error: zodMsg(parsed.error) });
  try {
    const out = await withTx(async (c) => {
      const k = await c.query(`SELECT id FROM kingdoms WHERE LOWER(name)=LOWER($1)`, [req.params.kingdom]);
      if (!k.rowCount) throw new Error("kingdom not found");
      const listing = await c.query(
        `SELECT id, seller_kingdom_id, resource, quantity_remaining FROM market_listings WHERE id=$1 AND status='active' FOR UPDATE`,
        [parsed.data.listingId],
      );
      if (!listing.rowCount) throw new Error("listing not found or not active");
      const l = listing.rows[0];
      if (String(l.seller_kingdom_id) !== String(k.rows[0].id)) throw new Error("not your listing");
      await c.query(`UPDATE market_listings SET status='cancelled' WHERE id=$1`, [l.id]);
      if (Number(l.quantity_remaining) > 0) {
        await c.query(
          `UPDATE kingdoms SET ${l.resource} = ${l.resource} + $2 WHERE id=$1`,
          [l.seller_kingdom_id, l.quantity_remaining],
        );
      }
      return { refundedQty: Number(l.quantity_remaining), resource: l.resource };
    });
    return res.json({ ok: true, ...out });
  } catch (e: any) { return res.status(400).json({ ok: false, error: String(e?.message || e) }); }
});

async function bootstrap() {
  await ensureSchema();
  const adminUsernames = String(process.env.ADMIN_USERNAME || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const adminUsername of adminUsernames) {
    await pool.query(`UPDATE app_users SET is_admin=true WHERE LOWER(username)=LOWER($1)`, [adminUsername]);
    console.log(`Admin granted to: ${adminUsername}`);
  }
  app.listen(API_PORT, () => {
    console.log(`Crownforge API listening on :${API_PORT}`);
  });
}

bootstrap().catch((e) => {
  console.error("API bootstrap failed", e);
  process.exit(1);
});
