import { redisClient } from "../redis";
import pool from "../database/db";
import { Rating, rate } from "ts-trueskill";

interface UpdateMMRAfterFinishProps {
  pug_id: string;
  winner_team: 1 | 2;
  verified_by: { id: string; username: string };
}

interface MMRChange {
  playerId: string;
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
  const allPlayers = [...pug.team1, ...pug.team2];
  const db = await pool.connect();
  const mmrResults: MMRChange[] = [];

  try {
    await db.query("BEGIN");

    const playerMap = new Map<string, number>(); // discord_id → player_id
    const playerRatings = new Map<string, Rating>(); // discord_id → Rating

    const conservative = (mu: number, sigma: number) => Math.max(mu - 3 * sigma, 0);

    // 1️⃣ Ensure all players exist with TrueSkill ratings
    for (const player of allPlayers) {
      const res = await db.query(`SELECT id, mu, sigma FROM players WHERE discord_id = $1`, [player.id]);
      let player_id: number;
      let rating: Rating;

      if (res.rows.length === 0) {
        // Insert with ON CONFLICT so duplicates don't break
        const insertRes = await db.query(
          `
          INSERT INTO players (discord_id, discord_username, mu, sigma)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (discord_id) DO UPDATE
          SET discord_username = EXCLUDED.discord_username
          RETURNING id, mu, sigma
          `,
          [player.id, player.username, 25.0, 8.333]
        );
        player_id = insertRes.rows[0].id;
        rating = new Rating(insertRes.rows[0].mu, insertRes.rows[0].sigma);
      } else {
        player_id = res.rows[0].id;
        rating = new Rating(res.rows[0].mu ?? 25.0, res.rows[0].sigma ?? 8.333);
      }

      playerMap.set(player.id, player_id);
      playerRatings.set(player.id, rating);
    }

    // 2️⃣ Ensure verifier exists
    let verified_by_player_id = playerMap.get(verified_by.id);
    if (!verified_by_player_id) {
      const insertVerifier = await db.query(
        `
        INSERT INTO players (discord_id, discord_username, mu, sigma)
        VALUES ($1, $2, 25.0, 8.333)
        ON CONFLICT (discord_id) DO UPDATE
        SET discord_username = EXCLUDED.discord_username
        RETURNING id
        `,
        [verified_by.id, verified_by.username]
      );
      verified_by_player_id = insertVerifier.rows[0].id;
    }

    // 3️⃣ Create/find pug record
    const pugRes = await db.query(`SELECT pug_id FROM pugs WHERE token = $1`, [pug_id]);
    let pug_sql_id: number;
    if (pugRes.rows.length === 0) {
      const insertPug = await db.query(
        `
        INSERT INTO pugs (token, captain1_id, captain2_id, created_at)
        VALUES ($1, $2, $3, NOW())
        RETURNING pug_id
        `,
        [pug_id, playerMap.get(pug.captain1.id), playerMap.get(pug.captain2.id)]
      );
      pug_sql_id = insertPug.rows[0].pug_id;
    } else {
      pug_sql_id = pugRes.rows[0].pug_id;
    }

    // 4️⃣ Build TrueSkill teams
    const tsTeam1 = pug.team1.map((p: any) => playerRatings.get(p.id)!);
    const tsTeam2 = pug.team2.map((p: any) => playerRatings.get(p.id)!);

    // 5️⃣ Rate based on winner
    const rankedTeams = winner_team === 1 ? [tsTeam1, tsTeam2] : [tsTeam2, tsTeam1];
    const newRatings = rate(rankedTeams);

    const updateTeam = async (team: any[], teamNum: 1 | 2, updatedRatings: Rating[]) => {
      for (let i = 0; i < team.length; i++) {
        const player = team[i];
        const player_id = playerMap.get(player.id)!;
        const oldRating = playerRatings.get(player.id)!;
        const newRating = updatedRatings[i];
        const didWin = winner_team === teamNum;

        const oldMMR = Math.round(conservative(oldRating.mu, oldRating.sigma));
        const newMMR = Math.round(conservative(newRating.mu, newRating.sigma));
        const mmrChange = newMMR - oldMMR;

        // 🧠 Update players table
        await db.query(
          `
          UPDATE players
          SET mu = $1,
              sigma = $2,
              wins = wins + $3,
              losses = losses + $4,
              last_match_played = NOW(),
              updated_at = NOW()
          WHERE id = $5
          `,
          [newRating.mu, newRating.sigma, didWin ? 1 : 0, didWin ? 0 : 1, player_id]
        );

        // 🧾 Insert into pug_players
        await db.query(
          `
          INSERT INTO pug_players 
            (pug_id, player_id, team_number, is_captain, 
             trueskill_before, trueskill_after, confidence_before, confidence_after, 
             won, mmr_change)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          `,
          [
            pug_sql_id,
            player_id,
            teamNum,
            player.id === pug.captain1.id || player.id === pug.captain2.id,
            oldRating.mu,
            newRating.mu,
            oldRating.sigma,
            newRating.sigma,
            didWin,
            mmrChange,
          ]
        );

        // 📈 Insert MMR history
        await db.query(
          `
          INSERT INTO mmr_history 
            (player_id, pug_id, old_mmr, new_mmr, change, 
             mu_before, mu_after, sigma_before, sigma_after)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          `,
          [player_id, pug_sql_id, oldMMR, newMMR, mmrChange, oldRating.mu, newRating.mu, oldRating.sigma, newRating.sigma]
        );

        mmrResults.push({
          playerId: player.id,
          oldMu: oldRating.mu,
          oldSigma: oldRating.sigma,
          newMu: newRating.mu,
          newSigma: newRating.sigma,
          oldMMR,
          newMMR,
          delta: mmrChange,
          team: teamNum,
        });
      }
    };

    await updateTeam(pug.team1, 1, winner_team === 1 ? newRatings[0] : newRatings[1]);
    await updateTeam(pug.team2, 2, winner_team === 1 ? newRatings[1] : newRatings[0]);

    // 6️⃣ Update pug record
    await db.query(
      `
      UPDATE pugs
      SET winner_team = $1,
          verified_at = NOW(),
          verified_by = $2
      WHERE token = $3
      `,
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