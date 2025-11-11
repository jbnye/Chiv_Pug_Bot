import { redisClient } from "../redis";
import pool from "../database/db";
import { Rating, rate } from "ts-trueskill";

interface UpdateMMRAfterFinishProps {
  pug_id: string;
  winner_team: 1 | 2;
  verified_by: { id: string; username: string };
}

interface MMRChange {
  playerId: string;       // Discord ID
  oldMu: number;
  oldSigma: number;
  newMu: number;
  newSigma: number;
  oldMMR: number;         // ≈ conservative MMR before
  newMMR: number;         // ≈ conservative MMR after
  delta: number;          // newMMR - oldMMR
  team: 1 | 2;
}

export async function update_mmr_after_finish({
  pug_id,
  winner_team,
  verified_by,
}: UpdateMMRAfterFinishProps) {
  const key = `pug:${pug_id}`;
  const redisData = await redisClient.get(key);

  if (!redisData) {
    console.error(`❌ No Redis data found for ${key}`);
    return { success: false, error: "PUG not found in Redis" };
  }

  const pug = JSON.parse(redisData);
  const allPlayers = [...pug.team1, ...pug.team2];
  const db = await pool.connect();

  const mmrResults: MMRChange[] = [];

  try {
    await db.query("BEGIN");

    const playerMap = new Map<string, number>(); // discord_id → player_id
    const playerRatings = new Map<string, Rating>(); // discord_id → Rating

    // 1️⃣ Ensure all players exist with TrueSkill
    for (const player of allPlayers) {
      const res = await db.query(`SELECT id, ts_mu, ts_sigma FROM players WHERE discord_id = $1`, [player.id]);
      let player_id: number;
      let rating: Rating;

      if (res.rows.length === 0) {
        const insertRes = await db.query(
          `INSERT INTO players (discord_id, discord_username, ts_mu, ts_sigma)
           VALUES ($1, $2, 25, 8.333)
           RETURNING id`,
          [player.id, player.username]
        );
        player_id = insertRes.rows[0].id;
        rating = new Rating(25, 8.333);
      } else {
        player_id = res.rows[0].id;
        rating = new Rating(res.rows[0].ts_mu ?? 25, res.rows[0].ts_sigma ?? 8.333);
      }

      playerMap.set(player.id, player_id);
      playerRatings.set(player.id, rating);
    }

    // 2️⃣ Ensure verifier exists
    let verified_by_player_id = playerMap.get(verified_by.id);
    if (!verified_by_player_id) {
      const insertVerifier = await db.query(
        `INSERT INTO players (discord_id, discord_username, ts_mu, ts_sigma)
         VALUES ($1, $2, 25, 8.333)
         RETURNING id`,
        [verified_by.id, verified_by.username]
      );
      verified_by_player_id = insertVerifier.rows[0].id;
    }

    // 3️⃣ Create/find pug record
    const pugRes = await db.query(`SELECT pug_id FROM pugs WHERE token = $1`, [pug_id]);
    let pug_sql_id: number;
    if (pugRes.rows.length === 0) {
      const insertPug = await db.query(
        `INSERT INTO pugs (token, captain1_id, captain2_id, created_at)
         VALUES ($1, $2, $3, NOW())
         RETURNING pug_id`,
        [pug_id, playerMap.get(pug.captain1.id), playerMap.get(pug.captain2.id)]
      );
      pug_sql_id = insertPug.rows[0].pug_id;
    } else {
      pug_sql_id = pugRes.rows[0].pug_id;
    }

    // 4️⃣ Build TrueSkill teams
    const tsTeam1 = pug.team1.map((p: any) => playerRatings.get(p.id)!);
    const tsTeam2 = pug.team2.map((p: any) => playerRatings.get(p.id)!);

    // 5️⃣ Update TrueSkill based on winner
    const rankedTeams = winner_team === 1 ? [tsTeam1, tsTeam2] : [tsTeam2, tsTeam1];
    const newRatings = rate(rankedTeams);

    const updateTeam = (team: any[], teamNum: 1 | 2, updatedRatings: Rating[]) => {
      team.forEach((player, i) => {
        const player_id = playerMap.get(player.id)!;
        const oldRating = playerRatings.get(player.id)!;
        const newRating = updatedRatings[i];

        const oldMMR = Math.round(oldRating.mu - 3 * oldRating.sigma);
        const newMMR = Math.round(newRating.mu - 3 * newRating.sigma);

        db.query(
          `UPDATE players
           SET ts_mu = $1, ts_sigma = $2, last_match_played = NOW()
           WHERE id = $3`,
          [newRating.mu, newRating.sigma, player_id]
        );

        db.query(
          `INSERT INTO pug_players (pug_id, player_id, team_number, is_captain, mmr_before, mmr_after)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            pug_sql_id,
            player_id,
            teamNum,
            player.id === pug.captain1.id || player.id === pug.captain2.id,
            oldMMR,
            newMMR,
          ]
        );

        db.query(
          `INSERT INTO mmr_history (player_id, pug_id, old_mmr, new_mmr, change)
           VALUES ($1, $2, $3, $4, $5)`,
          [player_id, pug_sql_id, oldMMR, newMMR, newMMR - oldMMR]
        );

        mmrResults.push({
          playerId: player.id,
          oldMu: oldRating.mu,
          oldSigma: oldRating.sigma,
          newMu: newRating.mu,
          newSigma: newRating.sigma,
          oldMMR,
          newMMR,
          delta: newMMR - oldMMR,
          team: teamNum,
        });
      });
    };

    updateTeam(pug.team1, 1, winner_team === 1 ? newRatings[0] : newRatings[1]);
    updateTeam(pug.team2, 2, winner_team === 1 ? newRatings[1] : newRatings[0]);

    // 6️⃣ Update pug verification info
    await db.query(
      `UPDATE pugs
       SET winner_team = $1,
           verified_at = NOW(),
           verified_by = $2
       WHERE token = $3`,
      [winner_team, verified_by_player_id, pug_id]
    );

    await db.query("COMMIT");

    return { success: true, results: mmrResults };
  } catch (error) {
    await db.query("ROLLBACK");
    console.error("❌ Error during MMR update:", error);
    return { success: false, error };
  } finally {
    db.release();
  }
}