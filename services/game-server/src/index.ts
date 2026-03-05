import dotenv from "dotenv";
import {
  ECON_BUILDING_HOURLY,
  PRAYERS,
  SEASONS,
  SETTLEMENT_EFFECTS,
  clampNumber,
  computeStorageCaps,
  effectivePeasantCap,
  peasantDeltaPerHour,
  taxGoldMultiplier,
  type SeasonCode,
} from "../../../packages/shared/src/index.js";
import { ensureSchemaLite, pool, withTx } from "./db.js";
import { computeCatchupBatch } from "./catchup.js";

dotenv.config();

const LOCAL_DEMO_FAST = String(process.env.LOCAL_DEMO_FAST || "").trim() === "1";
const TICK_INTERVAL_SECONDS = Number(process.env.TICK_INTERVAL_SECONDS || (LOCAL_DEMO_FAST ? 5 : 300));
const TICK_ALIGN_SECONDS = Number(process.env.TICK_ALIGN_SECONDS || (LOCAL_DEMO_FAST ? 5 : 300));
const TICK_HOURS = Math.max(1, TICK_INTERVAL_SECONDS) / 3600;
const MAX_CATCHUP_TICKS = Math.max(1, Number(process.env.MAX_CATCHUP_TICKS || 24));
const SEASON_LENGTH_SECONDS = Math.max(30, Number(process.env.SEASON_LENGTH_SECONDS || (LOCAL_DEMO_FAST ? 60 : 7 * 24 * 3600)));
const TAX_MIN = 0;
const TAX_MAX = 40;

type SeasonState = {
  index: number;
  code: SeasonCode;
  startedAt: Date;
  endsAt: Date;
  remainingSeconds: number;
  modifiers: {
    food: number;
    gold: number;
    wood: number;
    stone: number;
  };
};

function seasonByIndex(index: number) {
  return SEASONS[((index % SEASONS.length) + SEASONS.length) % SEASONS.length];
}

function toSeasonState(row: any, now = new Date()): SeasonState {
  const index = Math.max(0, Number(row.season_index || 0));
  const season = seasonByIndex(index);
  const startedAt = new Date(row.season_started_at);
  const endsAt = new Date(row.season_ends_at);
  const remainingSeconds = Math.max(0, Math.floor((endsAt.getTime() - now.getTime()) / 1000));
  return {
    index,
    code: season.code,
    startedAt,
    endsAt,
    remainingSeconds,
    modifiers: { ...season.modifiers },
  };
}

async function processSeasonTick(): Promise<SeasonState> {
  return withTx(async (c) => {
    await c.query(
      `
      INSERT INTO game_state(id, season_index, season_code, season_started_at, season_ends_at, updated_at)
      VALUES (1, 0, 'spring', now(), now() + ($1 || ' seconds')::interval, now())
      ON CONFLICT (id) DO NOTHING
      `,
      [SEASON_LENGTH_SECONDS],
    );
    const q = await c.query(`SELECT season_index, season_started_at, season_ends_at FROM game_state WHERE id=1 FOR UPDATE`);
    const row = q.rows[0];
    let index = Math.max(0, Number(row.season_index || 0));
    let startedAt = new Date(row.season_started_at);
    let endsAt = new Date(row.season_ends_at);
    const now = new Date();
    let changed = false;

    while (endsAt.getTime() <= now.getTime()) {
      index += 1;
      startedAt = endsAt;
      endsAt = new Date(startedAt.getTime() + SEASON_LENGTH_SECONDS * 1000);
      changed = true;
    }

    if (changed) {
      const season = seasonByIndex(index);
      await c.query(
        `
        UPDATE game_state
        SET season_index=$2, season_code=$3, season_started_at=$4, season_ends_at=$5, updated_at=now()
        WHERE id=$1
        `,
        [1, index, season.code, startedAt.toISOString(), endsAt.toISOString()],
      );
    } else {
      await c.query(`UPDATE game_state SET updated_at=now() WHERE id=1`);
    }

    return toSeasonState({ season_index: index, season_started_at: startedAt, season_ends_at: endsAt }, now);
  });
}

async function sendGameMail(c: any, kingdomId: number, subject: string, body: string) {
  await c.query(
    `INSERT INTO kingdom_mail(kingdom_id, mail_kind, subject, body) VALUES ($1,'system',$2,$3)`,
    [kingdomId, subject, body],
  );
}

async function sendGameNotice(c: any, kingdomId: number, type: string, message: string) {
  await c.query(
    `INSERT INTO kingdom_notifications(kingdom_id, notice_type, message, payload) VALUES ($1,$2,$3,'{}')`,
    [kingdomId, type, message],
  );
}

async function processBuildQueueTick(): Promise<number> {
  return withTx(async (c) => {
    const due = await c.query(
      `
      SELECT id, kingdom_id, building_code, target_level
      FROM build_queue
      WHERE status = 'queued'
        AND completes_at <= now()
      ORDER BY completes_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 200
      `,
    );

    if (!due.rowCount) return 0;

    for (const row of due.rows) {
      await c.query(
        `UPDATE kingdom_buildings
         SET level = GREATEST(level, $3)
         WHERE kingdom_id = $1 AND building_code = $2`,
        [row.kingdom_id, row.building_code, row.target_level],
      );

      await c.query(`UPDATE build_queue SET status = 'completed', completed_at = now() WHERE id = $1`, [row.id]);
      await c.query(`UPDATE kingdoms SET last_tick_at = now() WHERE id = $1`, [row.kingdom_id]);
    }

    return due.rowCount;
  });
}

async function processTrainQueueTick(): Promise<number> {
  return withTx(async (c) => {
    const due = await c.query(
      `
      SELECT id, kingdom_id, troop_code, quantity
      FROM train_queue
      WHERE status = 'queued'
        AND completes_at <= now()
      ORDER BY completes_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 200
      `,
    );

    if (!due.rowCount) return 0;

    for (const row of due.rows) {
      await c.query(
        `UPDATE kingdom_troops
         SET amount = amount + $3
         WHERE kingdom_id = $1 AND troop_code = $2`,
        [row.kingdom_id, row.troop_code, row.quantity],
      );

      await c.query(`UPDATE train_queue SET status = 'completed', completed_at = now() WHERE id = $1`, [row.id]);
      await c.query(`UPDATE kingdoms SET last_tick_at = now() WHERE id = $1`, [row.kingdom_id]);
    }

    return due.rowCount;
  });
}

async function processTroopReturnsTick(): Promise<number> {
  return withTx(async (c) => {
    const due = await c.query(
      `
      SELECT id, owner_kingdom_id, troop_code, quantity
      FROM troop_movements
      WHERE status = 'out'
        AND returns_at <= now()
      ORDER BY returns_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 500
      `,
    );

    if (!due.rowCount) return 0;

    for (const row of due.rows) {
      await c.query(
        `UPDATE kingdom_troops
         SET amount = amount + $3
         WHERE kingdom_id = $1 AND troop_code = $2`,
        [row.owner_kingdom_id, row.troop_code, row.quantity],
      );

      await c.query(`UPDATE troop_movements SET status='returned' WHERE id = $1`, [row.id]);
      await c.query(`UPDATE kingdoms SET last_tick_at = now() WHERE id = $1`, [row.owner_kingdom_id]);
    }

    return due.rowCount;
  });
}

async function processResearchQueueTick(): Promise<number> {
  return withTx(async (c) => {
    const due = await c.query(
      `
      SELECT id, kingdom_id, research_code, target_level
      FROM research_queue
      WHERE status = 'queued'
        AND completes_at <= now()
      ORDER BY completes_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 200
      `,
    );

    if (!due.rowCount) return 0;

    for (const row of due.rows) {
      await c.query(
        `
        INSERT INTO kingdom_research(kingdom_id, research_code, level)
        VALUES ($1,$2,$3)
        ON CONFLICT (kingdom_id, research_code) DO UPDATE
        SET level = GREATEST(kingdom_research.level, EXCLUDED.level)
        `,
        [row.kingdom_id, row.research_code, row.target_level],
      );
      await c.query(`UPDATE research_queue SET status='completed', completed_at=now() WHERE id=$1`, [row.id]);
      await c.query(`UPDATE kingdoms SET last_tick_at = now() WHERE id = $1`, [row.kingdom_id]);
    }

    return due.rowCount;
  });
}

async function processSettlementBuildQueueTick(): Promise<number> {
  return withTx(async (c) => {
    const due = await c.query(
      `
      SELECT id, kingdom_id, settlement_id, building_code, target_level, settlement_building_id
      FROM settlement_build_queue
      WHERE status='queued'
        AND completes_at <= now()
      ORDER BY completes_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 200
      `,
    );
    if (!due.rowCount) return 0;

    for (const row of due.rows) {
      if (row.settlement_building_id) {
        // Upgrade existing building by id
        await c.query(
          `UPDATE settlement_buildings SET level=$1 WHERE id=$2`,
          [row.target_level, row.settlement_building_id],
        );
        await c.query(
          `INSERT INTO settlement_history(settlement_id, item, datetime) VALUES ($1,$2,now())`,
          [row.settlement_id, `Finished upgrading ${String(row.building_code).replaceAll("_", " ")} to level ${row.target_level}`],
        );
      } else {
        // New building — insert fresh row
        await c.query(
          `INSERT INTO settlement_buildings(settlement_id, building_code, level) VALUES ($1,$2,$3)`,
          [row.settlement_id, row.building_code, row.target_level],
        );
        await c.query(
          `INSERT INTO settlement_history(settlement_id, item, datetime) VALUES ($1,$2,now())`,
          [row.settlement_id, `Finished building ${String(row.building_code).replaceAll("_", " ")} to level ${row.target_level}`],
        );
      }
      if (String(row.building_code || "") === "town_walls") {
        await c.query(`UPDATE settlements SET wall_level=$2 WHERE id=$1`, [row.settlement_id, row.target_level]);
      }
      await c.query(`UPDATE settlement_build_queue SET status='completed', completed_at=now() WHERE id=$1`, [row.id]);
      await c.query(`UPDATE kingdoms SET last_tick_at=now() WHERE id=$1`, [row.kingdom_id]);
    }
    return due.rowCount;
  });
}

async function processShieldStateTick(): Promise<number> {
  return withTx(async (c) => {
    const pendingToActive = await c.query(
      `
      UPDATE kingdoms
      SET shield_status='active', last_tick_at=now()
      WHERE shield_status='pending'
        AND shield_starts_at IS NOT NULL
        AND shield_starts_at <= now()
      `,
    );
    const activeToCooldown = await c.query(
      `
      UPDATE kingdoms
      SET shield_status='cooldown', last_tick_at=now()
      WHERE shield_status='active'
        AND shield_ends_at IS NOT NULL
        AND shield_ends_at <= now()
      `,
    );
    const cooldownToNone = await c.query(
      `
      UPDATE kingdoms
      SET shield_status='none',
          shield_requested_at=NULL,
          shield_starts_at=NULL,
          shield_ends_at=NULL,
          shield_cooldown_ends_at=NULL,
          last_tick_at=now()
      WHERE shield_status='cooldown'
        AND shield_cooldown_ends_at IS NOT NULL
        AND shield_cooldown_ends_at <= now()
      `,
    );
    return Number(pendingToActive.rowCount || 0) + Number(activeToCooldown.rowCount || 0) + Number(cooldownToNone.rowCount || 0);
  });
}

async function processEconomyTick(season: SeasonState): Promise<number> {
  return withTx(async (c) => {
    const kingdoms = await c.query(
      `SELECT id, land, gold, food, wood, stone, horses, mana, tax_rate, desertion_alert_active FROM kingdoms ORDER BY id ASC`,
    );
    if (!kingdoms.rowCount) return 0;

    let updated = 0;
    for (const k of kingdoms.rows) {
      const b = await c.query(
        `
        SELECT
          COALESCE(MAX(CASE WHEN building_code='farm' THEN level END),0) AS farm,
          COALESCE(MAX(CASE WHEN building_code='lumberyard' THEN level END),0) AS lumberyard,
          COALESCE(MAX(CASE WHEN building_code='quarry' THEN level END),0) AS quarry,
          COALESCE(MAX(CASE WHEN building_code='horse_farms' THEN level END),0) AS horse_farms,
          COALESCE(MAX(CASE WHEN building_code='temples' THEN level END),0) AS temples,
          COALESCE(MAX(CASE WHEN building_code='guildhalls' THEN level END),0) AS guildhalls,
          COALESCE(MAX(CASE WHEN building_code='houses' THEN level END),0) AS houses,
          COALESCE(MAX(CASE WHEN building_code='castles' THEN level END),0) AS castles,
          COALESCE(MAX(CASE WHEN building_code='barns' THEN level END),0) AS barns
        FROM kingdom_buildings
        WHERE kingdom_id = $1
        `,
        [k.id],
      );
      const t = await c.query(
        `
        WITH home AS (
          SELECT troop_code, COALESCE(SUM(amount),0) AS qty
          FROM kingdom_troops
          WHERE kingdom_id = $1
          GROUP BY troop_code
        ),
        train AS (
          SELECT troop_code, COALESCE(SUM(quantity),0) AS qty
          FROM train_queue
          WHERE kingdom_id = $1 AND status='queued'
          GROUP BY troop_code
        ),
        away AS (
          SELECT troop_code, COALESCE(SUM(quantity),0) AS qty
          FROM troop_movements
          WHERE owner_kingdom_id = $1 AND status='out' AND returns_at > now()
          GROUP BY troop_code
        ),
        totals AS (
          SELECT
            COALESCE(h.troop_code, t.troop_code, a.troop_code) AS troop_code,
            COALESCE(h.qty,0) + COALESCE(t.qty,0) + COALESCE(a.qty,0) AS amount
          FROM home h
          FULL OUTER JOIN train t ON t.troop_code = h.troop_code
          FULL OUTER JOIN away a ON a.troop_code = COALESCE(h.troop_code, t.troop_code)
        )
        SELECT totals.troop_code, totals.amount, tt.upkeep_food, tt.upkeep_gold, tt.nw_value
        FROM totals
        JOIN troop_types tt ON tt.code = totals.troop_code
        `,
        [k.id],
      );

      const farm = Number(b.rows[0]?.farm || 0);
      const lumber = Number(b.rows[0]?.lumberyard || 0);
      const quarry = Number(b.rows[0]?.quarry || 0);
      const horseFarms = Number(b.rows[0]?.horse_farms || 0);
      const temples = Number(b.rows[0]?.temples || 0);
      const houses = Number(b.rows[0]?.houses || 0);
      const castles = Number(b.rows[0]?.castles || 0);
      const guildhalls = Number((b.rows[0] as any)?.guildhalls || 0);
      const barns = Number((b.rows[0] as any)?.barns || 0);

      // Land integrity guard: if building land usage exceeds current land, raise land to used amount.
      const usedLandQ = await c.query(
        `
        SELECT COALESCE(SUM(kb.level * bt.land_cost), 0)::bigint AS used_land
        FROM kingdom_buildings kb
        JOIN building_types bt ON bt.code = kb.building_code
        WHERE kb.kingdom_id=$1
        `,
        [k.id],
      );
      const usedLand = Number(usedLandQ.rows[0]?.used_land || 0);
      let effectiveLand = Number(k.land || 0);
      if (effectiveLand < usedLand) {
        effectiveLand = usedLand;
        await c.query(`UPDATE kingdoms SET land=$2 WHERE id=$1`, [k.id, effectiveLand]);
        await sendGameNotice(c, Number(k.id), "info", `Land reconciled to ${effectiveLand.toLocaleString()} to match built structures.`);
      }

      // Count priests (capped at 5 per temple)
      const priestRow = await c.query(
        `SELECT COALESCE(SUM(amount),0) AS priests FROM kingdom_troops WHERE kingdom_id=$1 AND troop_code='priests'`,
        [k.id],
      );
      const priestCount = Math.min(Number(priestRow.rows[0]?.priests || 0), temples * 5);

      // Collect active prayer bonuses for this kingdom
      await c.query(`DELETE FROM kingdom_prayers WHERE kingdom_id=$1 AND ends_at <= now()`, [k.id]);
      const prayerRows = await c.query(
        `SELECT prayer_code FROM kingdom_prayers WHERE kingdom_id=$1 AND ends_at > now()`,
        [k.id],
      );
      let prayerFoodBonus = 1, prayerGoldBonus = 1, prayerWoodBonus = 1, prayerStoneBonus = 1, prayerHorseBonus = 1, prayerPopBonus = 1;
      for (const pr of prayerRows.rows) {
        const def = PRAYERS[pr.prayer_code as string];
        if (!def) continue;
        if (def.type === "food_bonus")       prayerFoodBonus  += def.bonus;
        if (def.type === "gold_bonus")       prayerGoldBonus  += def.bonus;
        if (def.type === "wood_bonus")       prayerWoodBonus  += def.bonus;
        if (def.type === "stone_bonus")      prayerStoneBonus += def.bonus;
        if (def.type === "horse_bonus")      prayerHorseBonus += def.bonus;
        if (def.type === "population_bonus") prayerPopBonus   += def.bonus;
      }

      // Agriculture and economics research bonuses + settlement building bonuses
      const [econResQ, settlBldgQ] = await Promise.all([
        c.query(
          `SELECT research_code, level FROM kingdom_research WHERE kingdom_id=$1
           AND research_code IN ('better_farming_methods','crop_rotation','irrigation','manure','mathematics','accounting','monastery','clergy','basilica')`,
          [k.id],
        ),
        c.query(
          `SELECT sb.building_code, COALESCE(SUM(sb.level),0)::int AS total_level
           FROM settlement_buildings sb
           JOIN settlements s ON s.id = sb.settlement_id
           WHERE s.kingdom_id=$1 AND sb.level > 0
           GROUP BY sb.building_code`,
          [k.id],
        ),
      ]);
      const econRes = Object.fromEntries(econResQ.rows.map((r: any) => [String(r.research_code), Number(r.level || 0)]));
      const researchFoodMult = 1 + ((econRes.better_farming_methods || 0) + (econRes.crop_rotation || 0) + (econRes.irrigation || 0) + (econRes.manure || 0)) * 0.01;
      const researchGoldMult = 1 + ((econRes.mathematics || 0) + (econRes.accounting || 0)) * 0.01;
      const researchManaMult = 1 + ((econRes.monastery || 0) + (econRes.clergy || 0) + (econRes.basilica || 0)) * 0.05;
      const sBldg = Object.fromEntries(settlBldgQ.rows.map((r: any) => [String(r.building_code), Number(r.total_level || 0)]));
      const settlFoodBonus  = (sBldg.granary   || 0) * SETTLEMENT_EFFECTS.granaryFoodPerHour;
      const settlGoldBonus  =
        (sBldg.inn || 0) * SETTLEMENT_EFFECTS.innGoldPerHour +
        (sBldg.market || 0) * SETTLEMENT_EFFECTS.marketGoldPerHour;
      const settlWoodBonus  = (sBldg.carpenter || 0) * SETTLEMENT_EFFECTS.carpenterWoodPerHour;
      const settlStoneBonus = (sBldg.mason     || 0) * SETTLEMENT_EFFECTS.masonStonePerHour;
      const settlHorseBonus = (sBldg.stables   || 0) * SETTLEMENT_EFFECTS.stablesHorsesPerHour;
      const settlFoodCap    = (sBldg.barn      || 0) * SETTLEMENT_EFFECTS.barnFoodCapPerLevel;
      const settlManaBonus  =
        (sBldg.church || 0) * SETTLEMENT_EFFECTS.churchManaPerHour +
        (sBldg.cathedral || 0) * SETTLEMENT_EFFECTS.cathedralManaPerHour;
      const settlHousingCapBonus = (sBldg.housing || 0) * SETTLEMENT_EFFECTS.housingPeasantCapPerLevel;

      const foodIncomePerHour = farm * ECON_BUILDING_HOURLY.farmFood * prayerFoodBonus * researchFoodMult + settlFoodBonus;
      const goldIncomePerHour = effectiveLand * ECON_BUILDING_HOURLY.baseGoldPerLand * prayerGoldBonus * researchGoldMult + settlGoldBonus;
      const woodIncomePerHour = lumber * ECON_BUILDING_HOURLY.lumberWood * prayerWoodBonus + settlWoodBonus;
      const stoneIncomePerHour = quarry * ECON_BUILDING_HOURLY.quarryStone * prayerStoneBonus + settlStoneBonus;
      const horseIncomePerHour = horseFarms * ECON_BUILDING_HOURLY.horseFarmHorses * prayerHorseBonus + settlHorseBonus;

      let foodUpkeepPerHour = 0;
      let goldUpkeepPerHour = 0;
      let troopNetworth = 0;
      let diplomatCount = 0;
      for (const row of t.rows) {
        const amount = Number(row.amount || 0);
        foodUpkeepPerHour += amount * Number(row.upkeep_food || 0);
        goldUpkeepPerHour += amount * Number(row.upkeep_gold || 0);
        troopNetworth += amount * Number(row.nw_value || 0);
        if (String(row.troop_code) === "diplomats") diplomatCount += amount;
      }
      // Priests bless the army — each priest reduces total food upkeep by 2/hr
      const priestFoodReduction = Math.min(priestCount * 2, foodUpkeepPerHour);
      const effectiveFoodUpkeepPerHour = foodUpkeepPerHour - priestFoodReduction;
      // Diplomats generate gold/hr through trade relations
      const diplomatGoldPerHour = diplomatCount * 75;

      const seasonFoodIncome = foodIncomePerHour * Number(season.modifiers.food || 1);
      const taxRate = clampNumber(Math.floor(Number(k.tax_rate || 25)), TAX_MIN, TAX_MAX);
      const seasonGoldIncome = goldIncomePerHour * Number(season.modifiers.gold || 1) * taxGoldMultiplier(taxRate);
      const seasonWoodIncome = woodIncomePerHour * Number(season.modifiers.wood || 1);
      const seasonStoneIncome = stoneIncomePerHour * Number(season.modifiers.stone || 1);

      const foodDelta = Math.floor((seasonFoodIncome - effectiveFoodUpkeepPerHour) * TICK_HOURS);
      const goldDelta = Math.floor((seasonGoldIncome - goldUpkeepPerHour + diplomatGoldPerHour) * TICK_HOURS);
      const woodDelta = Math.floor(seasonWoodIncome * TICK_HOURS);
      const stoneDelta = Math.floor(seasonStoneIncome * TICK_HOURS);
      const horsesDelta = Math.floor(horseIncomePerHour * TICK_HOURS);
      const manaDelta = Math.floor((priestCount * 8 * researchManaMult + settlManaBonus) * TICK_HOURS); // 8 mana/hr per priest, boosted by research and settlement churches

      // Compute storage caps from buildings and clamp resources
      const baseCaps = computeStorageCaps({ farm, barns, lumberyard: lumber, quarry, castles, houses });
      const storageCaps = { ...baseCaps, food: baseCaps.food + settlFoodCap };
      const newFood  = Math.min(storageCaps.food,  Math.max(0, Number(k.food  || 0) + foodDelta));
      const newGold  = Math.min(storageCaps.gold,  Math.max(0, Number(k.gold  || 0) + goldDelta));
      const newWood  = Math.min(storageCaps.wood,  Math.max(0, Number(k.wood  || 0) + woodDelta));
      const newStone = Math.min(storageCaps.stone, Math.max(0, Number(k.stone || 0) + stoneDelta));

      await c.query(
        `
        UPDATE kingdoms
        SET
          food  = $2,
          gold  = $3,
          wood  = $4,
          stone = $5,
          horses = GREATEST(0, horses + $6),
          mana   = GREATEST(0, mana   + $7),
          last_tick_at = now()
        WHERE id = $1
        `,
        [k.id, newFood, newGold, newWood, newStone, horsesDelta, manaDelta],
      );

      // Population integrity guard: clamp peasants to current housing/castle cap.
      const peasantCap = effectivePeasantCap({ houses, castles }) + settlHousingCapBonus;
      const peasantsTotal = Number(t.rows.find((row) => String(row.troop_code) === "peasants")?.amount || 0);
      if (peasantsTotal > peasantCap) {
        const homePeasantQ = await c.query(
          `SELECT COALESCE(amount,0) AS amount FROM kingdom_troops WHERE kingdom_id=$1 AND troop_code='peasants' LIMIT 1 FOR UPDATE`,
          [k.id],
        );
        const homePeasants = Number(homePeasantQ.rows[0]?.amount || 0);
        const overflow = peasantsTotal - peasantCap;
        const toRemove = Math.min(homePeasants, overflow);
        if (toRemove > 0) {
          await c.query(`UPDATE kingdom_troops SET amount=GREATEST(0, amount-$2) WHERE kingdom_id=$1 AND troop_code='peasants'`, [k.id, toRemove]);
          await sendGameNotice(c, Number(k.id), "warning", `Peasants adjusted by -${toRemove.toLocaleString()} to fit population cap.`);
        }
      }

      // Spy integrity guard: home spies cannot exceed remaining guildhall capacity after train/away.
      const spyCap = guildhalls * 5;
      const spyUsageQ = await c.query(
        `
        WITH home AS (
          SELECT COALESCE(amount,0) AS qty FROM kingdom_troops WHERE kingdom_id=$1 AND troop_code='spies'
        ),
        train AS (
          SELECT COALESCE(SUM(quantity),0) AS qty FROM train_queue WHERE kingdom_id=$1 AND troop_code='spies' AND status='queued'
        ),
        away AS (
          SELECT COALESCE(SUM(quantity),0) AS qty FROM troop_movements WHERE owner_kingdom_id=$1 AND troop_code='spies' AND status='out' AND returns_at > now()
        )
        SELECT
          COALESCE((SELECT qty FROM home),0)::bigint AS home_qty,
          COALESCE((SELECT qty FROM train),0)::bigint AS train_qty,
          COALESCE((SELECT qty FROM away),0)::bigint AS away_qty
        `,
        [k.id],
      );
      const homeSpies = Number(spyUsageQ.rows[0]?.home_qty || 0);
      const trainSpies = Number(spyUsageQ.rows[0]?.train_qty || 0);
      const awaySpies = Number(spyUsageQ.rows[0]?.away_qty || 0);
      const maxHomeSpies = Math.max(0, spyCap - trainSpies - awaySpies);
      if (homeSpies > maxHomeSpies) {
        const removeSpies = homeSpies - maxHomeSpies;
        await c.query(`UPDATE kingdom_troops SET amount=GREATEST(0, amount-$2) WHERE kingdom_id=$1 AND troop_code='spies'`, [k.id, removeSpies]);
        await sendGameNotice(
          c,
          Number(k.id),
          "warning",
          `Spies adjusted by -${removeSpies.toLocaleString()} to fit guildhall capacity (${spyCap.toLocaleString()}).`,
        );
      }

      const basePeasantDelta = peasantDeltaPerHour(taxRate);
      const peasPerHour = basePeasantDelta * (basePeasantDelta > 0 ? prayerPopBonus : 1);
      let peasDelta = Math.floor(peasPerHour * TICK_HOURS);
      if (peasDelta > 0) {
        const currentPeasants = Number(t.rows.find((row) => String(row.troop_code) === "peasants")?.amount || 0);
        const freeCapacity = Math.max(0, peasantCap - currentPeasants);
        peasDelta = Math.min(peasDelta, freeCapacity);
      }
      if (peasDelta !== 0) {
        await c.query(
          `
          INSERT INTO kingdom_troops(kingdom_id, troop_code, amount)
          VALUES ($1,'peasants',$2)
          ON CONFLICT (kingdom_id, troop_code) DO UPDATE
          SET amount = GREATEST(0, kingdom_troops.amount + $2)
          `,
          [k.id, peasDelta],
        );
      }

      // --- Starvation: food/gold deficit → troops desert ---
      const foodStarving = foodDelta < 0 && newFood === 0;
      const goldStarving = goldDelta < 0 && newGold === 0;
      const desertionAlertActive = Boolean((k as any).desertion_alert_active);
      let nextDesertionAlertActive = desertionAlertActive;
      if (foodStarving || goldStarving) {
        const homeTroops = await c.query(
          `SELECT troop_code, amount FROM kingdom_troops WHERE kingdom_id=$1 AND amount > 0 AND troop_code != 'peasants'`,
          [k.id],
        );
        const deserted: string[] = [];
        for (const tr of homeTroops.rows) {
          const amt = Number(tr.amount || 0);
          const loss = Math.max(1, Math.floor(amt * 0.01)); // 1% per tick
          await c.query(
            `UPDATE kingdom_troops SET amount = GREATEST(0, amount - $2) WHERE kingdom_id=$1 AND troop_code=$3`,
            [k.id, loss, tr.troop_code],
          );
          deserted.push(`${String(tr.troop_code)}: -${loss.toLocaleString()}`);
        }
        if (deserted.length > 0) {
          const reason = foodStarving && goldStarving ? "no food or gold" : foodStarving ? "no food" : "no gold";
          if (!desertionAlertActive) {
            await sendGameMail(
              c,
              Number(k.id),
              `Troops Deserting - ${reason}`,
              `Your kingdom has run out of ${reason.replace("no ", "")}.

Troops deserting this tick:
${deserted.join("\n")}

Desertion will continue while this shortage remains.`,
            );
            await sendGameNotice(c, Number(k.id), "warning", `Troops deserting due to ${reason}`);
          }
          nextDesertionAlertActive = true;
        }
      }
      if (!foodStarving && !goldStarving && desertionAlertActive) {
        await sendGameMail(
          c,
          Number(k.id),
          "Troops Desertion Stopped",
          "Your kingdom's supplies have stabilized, and troops are no longer deserting.",
        );
        await sendGameNotice(c, Number(k.id), "info", "Troop desertion has stopped.");
        nextDesertionAlertActive = false;
      }
      if (nextDesertionAlertActive !== desertionAlertActive) {
        await c.query(`UPDATE kingdoms SET desertion_alert_active=$2 WHERE id=$1`, [k.id, nextDesertionAlertActive]);
      }

      // --- Starvation: wood/stone depleted with no production -> buildings decay ---
      const woodStarving = woodIncomePerHour === 0 && newWood === 0;
      const stoneStarving = stoneIncomePerHour === 0 && newStone === 0;
      if (woodStarving || stoneStarving) {
        const decayQ = await c.query(
          `SELECT kb.building_code, kb.level, bt.name
           FROM kingdom_buildings kb
           JOIN building_types bt ON bt.code = kb.building_code
           WHERE kb.kingdom_id = $1 AND kb.level > 0
           ORDER BY RANDOM() LIMIT 1`,
          [k.id],
        );
        if (decayQ.rowCount) {
          const bldg = decayQ.rows[0];
          const newLevel = Math.max(0, Number(bldg.level) - 1);
          await c.query(
            `UPDATE kingdom_buildings SET level=$3 WHERE kingdom_id=$1 AND building_code=$2`,
            [k.id, bldg.building_code, newLevel],
          );
          const reason = woodStarving && stoneStarving ? "wood and stone" : woodStarving ? "wood" : "stone";
          await sendGameMail(
            c,
            Number(k.id),
            `Building Decaying — no ${reason}`,
            `Your kingdom has run out of ${reason}!\n\n${String(bldg.name)} has decayed to level ${newLevel}.\n\nBuild lumberyards or quarries to restore production. Buildings will continue to decay each tick until you have ${reason} income.`,
          );
          await sendGameNotice(c, Number(k.id), "warning", `${String(bldg.name)} decayed to level ${newLevel} (no ${reason})`);
        }
      }

      const networth = effectiveLand * 0.04 + newFood * 0.0001 + newGold * 0.0005 + newStone * 0.0002 + newWood * 0.0002 + troopNetworth;
      await c.query(
        `INSERT INTO kingdom_networth_history(kingdom_id, networth, recorded_at) VALUES ($1,$2,now())`,
        [k.id, Number(networth.toFixed(2))],
      );
      updated += 1;
    }

    return updated;
  });
}

function nextAlignedDelayMs(nowMs: number, alignSeconds: number): number {
  const step = Math.max(1, alignSeconds) * 1000;
  const next = Math.ceil(nowMs / step) * step;
  return Math.max(1, next - nowMs);
}

async function runTick() {
  const startedAt = Date.now();
  const season = await processSeasonTick();
  const builds = await processBuildQueueTick();
  const trains = await processTrainQueueTick();
  const research = await processResearchQueueTick();
  const settlementBuilds = await processSettlementBuildQueueTick();
  const shieldTransitions = await processShieldStateTick();
  const returns = await processTroopReturnsTick();
  const economies = await processEconomyTick(season);
  if (builds > 0 || trains > 0 || research > 0 || settlementBuilds > 0 || shieldTransitions > 0 || returns > 0 || economies > 0) {
    console.log(
      `[tick] ${new Date().toISOString()} season=${season.code}(${season.remainingSeconds}s) completed builds=${builds}, trainings=${trains}, research=${research}, settlement_builds=${settlementBuilds}, shields=${shieldTransitions}, returns=${returns}, economy=${economies}`,
    );
  }
  return {
    season: season.code,
    seasonRemainingSeconds: season.remainingSeconds,
    builds,
    trains,
    research,
    settlementBuilds,
    shieldTransitions,
    returns,
    economies,
    durationMs: Date.now() - startedAt,
  };
}

async function withTickLock<T>(fn: () => Promise<T>) {
  const lockClient = await pool.connect();
  try {
    const lock = await lockClient.query(`SELECT pg_try_advisory_lock($1) AS locked`, [94021001]);
    if (!Boolean(lock.rows[0]?.locked)) return null;
    return await fn();
  } finally {
    try {
      await lockClient.query(`SELECT pg_advisory_unlock($1)`, [94021001]);
    } catch {
      // ignore unlock errors during shutdown races
    }
    lockClient.release();
  }
}

async function runDueTicks() {
  return withTickLock(async () => {
    await withTx(async (c) => {
      await c.query(
        `
        INSERT INTO game_state(id, season_index, season_code, season_started_at, season_ends_at, updated_at, worker_last_tick_at)
        VALUES (1, 0, 'spring', now(), now() + ($1 || ' seconds')::interval, now(), now())
        ON CONFLICT (id) DO NOTHING
        `,
        [SEASON_LENGTH_SECONDS],
      );
      return 0;
    });

    const batchStartedAt = Date.now();
    const q = await pool.query(`SELECT worker_last_tick_at FROM game_state WHERE id=1 LIMIT 1`);
    const lastTickAt = new Date(q.rows[0]?.worker_last_tick_at || Date.now());
    const intervalSec = Math.max(1, TICK_INTERVAL_SECONDS);
    const nowMs = Date.now();
    const { dueTicks, runCount, backlog, capped } = computeCatchupBatch({
      lastTickAtMs: lastTickAt.getTime(),
      nowMs,
      intervalSec,
      maxCatchupTicks: MAX_CATCHUP_TICKS,
    });
    if (runCount <= 0) return 0;

    let totalTickDurationMs = 0;
    let totals = {
      builds: 0,
      trains: 0,
      research: 0,
      settlementBuilds: 0,
      shieldTransitions: 0,
      returns: 0,
      economies: 0,
    };
    for (let i = 0; i < runCount; i += 1) {
      const result = await runTick();
      totalTickDurationMs += Number(result.durationMs || 0);
      totals = {
        builds: totals.builds + Number(result.builds || 0),
        trains: totals.trains + Number(result.trains || 0),
        research: totals.research + Number(result.research || 0),
        settlementBuilds: totals.settlementBuilds + Number(result.settlementBuilds || 0),
        shieldTransitions: totals.shieldTransitions + Number(result.shieldTransitions || 0),
        returns: totals.returns + Number(result.returns || 0),
        economies: totals.economies + Number(result.economies || 0),
      };
      const nextLastTickAt = new Date(lastTickAt.getTime() + (i + 1) * intervalSec * 1000);
      await pool.query(`UPDATE game_state SET worker_last_tick_at=$2, updated_at=now() WHERE id=$1`, [1, nextLastTickAt.toISOString()]);
    }
    if (capped) {
      await pool.query(`UPDATE game_state SET worker_last_tick_at=now(), updated_at=now() WHERE id=$1`, [1]);
      console.warn(`[tick] catch-up capped: due=${dueTicks} processed=${runCount} cap=${MAX_CATCHUP_TICKS} stale_backlog_skipped=1`);
    }
    console.log(
      `[tick-batch] ${new Date().toISOString()} due=${dueTicks} processed=${runCount} backlog=${backlog} tick_ms_total=${totalTickDurationMs} batch_ms=${Date.now() - batchStartedAt} totals(build=${totals.builds},train=${
        totals.trains
      },research=${totals.research},settlement=${totals.settlementBuilds},shield=${totals.shieldTransitions},returns=${
        totals.returns
      },economy=${totals.economies})`,
    );
    return runCount;
  });
}

async function runTickDeterminismHarness() {
  await ensureSchemaLite();
  await withTx(async (c) => {
    await c.query(
      `
      INSERT INTO game_state(id, season_index, season_code, season_started_at, season_ends_at, updated_at, worker_last_tick_at)
      VALUES (1, 0, 'spring', now(), now() + ($1 || ' seconds')::interval, now(), now())
      ON CONFLICT (id) DO NOTHING
      `,
      [SEASON_LENGTH_SECONDS],
    );
    await c.query(
      `UPDATE game_state SET worker_last_tick_at = now() - ($2 || ' seconds')::interval, updated_at=now() WHERE id=$1`,
      [1, Math.max(1, TICK_INTERVAL_SECONDS) * 3],
    );
    return 0;
  });

  const before = await pool.query(`SELECT worker_last_tick_at FROM game_state WHERE id=1`);
  const first = await runDueTicks();
  const afterFirst = await pool.query(`SELECT worker_last_tick_at FROM game_state WHERE id=1`);
  await pool.query(`UPDATE game_state SET worker_last_tick_at=now(), updated_at=now() WHERE id=1`);
  const second = await runDueTicks();
  const afterSecond = await pool.query(`SELECT worker_last_tick_at FROM game_state WHERE id=1`);

  console.log(
    `[harness] before=${before.rows[0]?.worker_last_tick_at} first_processed=${first} after_first=${afterFirst.rows[0]?.worker_last_tick_at} second_processed=${second} after_second=${afterSecond.rows[0]?.worker_last_tick_at}`,
  );
  const firstProcessed = Number(first || 0);
  const secondProcessed = Number(second || 0);
  const pass = firstProcessed > 0 && secondProcessed === 0;
  console.log(`[harness] assertion first_processed>0 && second_processed===0 => ${pass ? "PASS" : "FAIL"}`);
  if (!pass) {
    throw new Error(
      `tick harness failed: expected first>0 and second=0, got first=${firstProcessed} second=${secondProcessed}`,
    );
  }
}

async function main() {
  await ensureSchemaLite();
  console.log(
    `Game server worker started. Tick interval=${TICK_INTERVAL_SECONDS}s align=${TICK_ALIGN_SECONDS}s`,
  );

  const schedule = async () => {
    try {
      await runDueTicks();
    } catch (e) {
      console.error("[tick] scheduler error", e);
    }
    const delay = nextAlignedDelayMs(Date.now(), TICK_ALIGN_SECONDS);
    setTimeout(schedule, delay);
  };

  const firstDelay = nextAlignedDelayMs(Date.now(), TICK_ALIGN_SECONDS);
  setTimeout(schedule, firstDelay);

  process.on("SIGINT", async () => {
    await pool.end();
    process.exit(0);
  });
}

if (process.argv.includes("--harness")) {
  runTickDeterminismHarness()
    .catch((e) => {
      console.error("Worker harness failed", e);
      process.exit(1);
    })
    .finally(async () => {
      await pool.end();
    });
} else {
  main().catch((e) => {
    console.error("Worker bootstrap failed", e);
    process.exit(1);
  });
}
