import { redisClient } from "../redis";
import pool from "../database/db";
import { Rating, rate } from "ts-trueskill";

interface UpdateMMRAfterFinishProps {
  pug_id: string; // token (UUID)
  winner_team: 1 | 2;
  verified_by: { id: string; username: string }; // discord_id and username
}

interface MMRChange {
  playerId: string; // discord_id
  oldMu: number;
  oldSigma: number;
  newMu: number;
  newSigma: number;
  oldMMR: number;
  newMMR: number;
  delta: number;
  team: 1 | 2;
}


export async function update_mmr_after_finish({
  pug_id,
  winner_team,
  verified_by,
}: UpdateMMRAfterFinishProps) {
  const shownMMR = (mu: number, sigma: number) => Math.floor(Math.max(mu - 3 * sigma, 0)); 

  const key = `pug:${pug_id}`;
  let redisData = await redisClient.get(key);
  if (!redisData) {
    redisData = await redisClient.get(`finished_pugs:${pug_id}`);
  }
  if (!redisData) {
    console.error(`❌ No Redis data found for pug:${pug_id} or finished_pugs:${pug_id}`);
    return { success: false, error: "PUG not found in Redis" };
  }

  const pug = JSON.parse(redisData);
  const allPlayers = [...(pug.team1 ?? []), ...(pug.team2 ?? [])]; 

  const db = await pool.connect();
  const mmrResults: MMRChange[] = [];

  try {
    await db.query("BEGIN");


    const ratingMap = new Map<string, Rating>();
    for (const p of allPlayers) {
      const res = await db.query(`SELECT mu, sigma FROM players WHERE discord_id = $1`, [p.id]);
      if (res.rows.length === 0) {
        await db.query(
          `INSERT INTO players (discord_id, discord_username, mu, sigma)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (discord_id) DO UPDATE
           SET discord_username = EXCLUDED.discord_username`,
          [p.id, p.username ?? null, 25.0, 8.333]
        );
        ratingMap.set(p.id, new Rating(25.0, 8.333));
      } else {
        const mu = res.rows[0].mu ?? 25.0;
        const sigma = res.rows[0].sigma ?? 8.333;
        ratingMap.set(p.id, new Rating(mu, sigma));
      }
    }

    await db.query(
      `INSERT INTO players (discord_id, discord_username, mu, sigma)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (discord_id) DO UPDATE
       SET discord_username = EXCLUDED.discord_username`,
      [verified_by.id, verified_by.username ?? null, 25.0, 8.333]
    );

    let pug_sql_id: number;
    const pugRes = await db.query(`SELECT pug_id FROM pugs WHERE token = $1`, [pug_id]);
    if (pugRes.rows.length === 0) {
      const insertPug = await db.query(
        `INSERT INTO pugs (token, captain1_id, captain2_id, created_at)
         VALUES ($1, $2, $3, NOW())
         RETURNING pug_id`,
        [pug_id, pug.captain1?.id ?? null, pug.captain2?.id ?? null]
      );
      pug_sql_id = insertPug.rows[0].pug_id;
    } else {
      pug_sql_id = pugRes.rows[0].pug_id;
    }


    const team1Ratings = (pug.team1 ?? []).map((x: any) => ratingMap.get(x.id)!);
    const team2Ratings = (pug.team2 ?? []).map((x: any) => ratingMap.get(x.id)!);


    const [team1AfterIfTeam1Win, team2AfterIfTeam1Win] = rate([team1Ratings, team2Ratings], [1, 2]);
    const [team1AfterIfTeam2Win, team2AfterIfTeam2Win] = rate([team1Ratings, team2Ratings], [2, 1]);

    const newTeam1Ratings = winner_team === 1 ? team1AfterIfTeam1Win : team1AfterIfTeam2Win;
    const newTeam2Ratings = winner_team === 1 ? team2AfterIfTeam1Win : team2AfterIfTeam2Win;


    const computed: Array<{
      discord_id: string;
      team: 1 | 2;
      oldMu: number;
      oldSigma: number;
      newMu: number;
      newSigma: number;
      oldShown: number;
      newShown: number;
      delta: number;
      isCaptain: boolean;
    }> = [];

    // team1
    for (let i = 0; i < (pug.team1 ?? []).length; i++) {
      const pl = pug.team1[i];
      const oldR = team1Ratings[i];
      const newR = newTeam1Ratings[i];
      const oldShown = shownMMR(oldR.mu, oldR.sigma);
      const newShown = shownMMR(newR.mu, newR.sigma);
      computed.push({
        discord_id: pl.id,
        team: 1,
        oldMu: oldR.mu,
        oldSigma: oldR.sigma,
        newMu: newR.mu,
        newSigma: newR.sigma,
        oldShown,
        newShown,
        delta: newShown - oldShown,
        isCaptain: pl.id === pug.captain1?.id || pl.id === pug.captain2?.id,
      });
    }
    // team2
    for (let i = 0; i < (pug.team2 ?? []).length; i++) {
      const pl = pug.team2[i];
      const oldR = team2Ratings[i];
      const newR = newTeam2Ratings[i];
      const oldShown = shownMMR(oldR.mu, oldR.sigma);
      const newShown = shownMMR(newR.mu, newR.sigma);
      computed.push({
        discord_id: pl.id,
        team: 2,
        oldMu: oldR.mu,
        oldSigma: oldR.sigma,
        newMu: newR.mu,
        newSigma: newR.sigma,
        oldShown,
        newShown,
        delta: newShown - oldShown,
        isCaptain: pl.id === pug.captain1?.id || pl.id === pug.captain2?.id,
      });
    }

    for (const row of computed) {
      const didWin = row.team === winner_team;

      await db.query(
        `UPDATE players
         SET mu = $1, sigma = $2,
             wins = wins + $3,
             losses = losses + $4,
             last_match_played = NOW(),
             updated_at = NOW()
         WHERE discord_id = $5`,
        [row.newMu, row.newSigma, didWin ? 1 : 0, didWin ? 0 : 1, row.discord_id]
      );

      // Insert into pug_players (discord_id column)
      await db.query(
        `INSERT INTO pug_players
           (pug_id, discord_id, team_number, is_captain,
            trueskill_before, trueskill_after, confidence_before, confidence_after,
            won, mmr_change)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          pug_sql_id,
          row.discord_id,
          row.team,
          row.isCaptain,
          row.oldMu,
          row.newMu,
          row.oldSigma,
          row.newSigma,
          didWin,
          row.delta,
        ]
      );

      await db.query(
        `INSERT INTO mmr_history
           (discord_id, pug_id, old_mmr, new_mmr, change,
            mu_before, mu_after, sigma_before, sigma_after)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [row.discord_id, pug_sql_id, row.oldShown, row.newShown, row.delta, row.oldMu, row.newMu, row.oldSigma, row.newSigma]
      );

      mmrResults.push({
        playerId: row.discord_id,
        oldMu: row.oldMu,
        oldSigma: row.oldSigma,
        newMu: row.newMu,
        newSigma: row.newSigma,
        oldMMR: row.oldShown,
        newMMR: row.newShown,
        delta: row.delta,
        team: row.team,
      });
    }


    await db.query(
      `UPDATE pugs
       SET winner_team = $1,
           verified_at = NOW(),
           verified_by = $2
       WHERE token = $3`,
      [winner_team, verified_by.id, pug_id]
    );

    await db.query("COMMIT");

    return { success: true, results: mmrResults };
  } catch (err) {
    await db.query("ROLLBACK");
    console.error("Error during MMR update:", err);
    return { success: false, error: err };
  } finally {
    db.release();
  }
}