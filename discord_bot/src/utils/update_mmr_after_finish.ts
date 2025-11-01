import { redisClient } from "../redis";
import pool from "../database/db";

interface UpdateMMRAfterFinishProps {
  pug_id: string;
  winner_team: 1 | 2;
  verified_by: { id: string; username: string };
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

  try {
    await db.query("BEGIN");

    // 1️⃣ Ensure all players exist in `players` table
    const playerMap = new Map<string, number>(); // discord_id → player_id

    for (const player of allPlayers) {
      const res = await db.query(
        `SELECT id FROM players WHERE discord_id = $1`,
        [player.id]
      );

      let player_id: number;

      if (res.rows.length === 0) {
        // Insert default player if not found
        const insertRes = await db.query(
          `INSERT INTO players (discord_id, discord_username, mmr)
           VALUES ($1, $2, 1500)
           RETURNING id`,
          [player.id, player.username]
        );
        player_id = insertRes.rows[0].id;
      } else {
        player_id = res.rows[0].id;
      }

      playerMap.set(player.id, player_id);
    }

    // 2️⃣ Ensure verifier exists (even if they didn’t play)
    let verified_by_player_id = playerMap.get(verified_by.id) ?? null;

    if (!verified_by_player_id) {
      const insertVerifier = await db.query(
        `INSERT INTO players (discord_id, discord_username, mmr)
         VALUES ($1, $2, 1500)
         RETURNING id`,
        [verified_by.id, verified_by.username]
      );
      verified_by_player_id = insertVerifier.rows[0].id;
    }

    // 3️⃣ Create or find this pug in SQL `pugs` table
    const pugRes = await db.query(
      `SELECT pug_id FROM pugs WHERE token = $1`,
      [pug_id]
    );

    let pug_sql_id: number;

    if (pugRes.rows.length === 0) {
      const insertPug = await db.query(
        `INSERT INTO pugs (token, captain1_id, captain2_id, created_at)
         VALUES ($1, $2, $3, NOW())
         RETURNING pug_id`,
        [
          pug_id,
          playerMap.get(pug.captain1.id),
          playerMap.get(pug.captain2.id),
        ]
      );
      pug_sql_id = insertPug.rows[0].pug_id;
    } else {
      pug_sql_id = pugRes.rows[0].pug_id;
    }

    // 4️⃣ Calculate MMR updates
    const mmrChange = 25; // simple flat system for now
    const winningTeam = winner_team === 1 ? pug.team1 : pug.team2;
    const losingTeam = winner_team === 1 ? pug.team2 : pug.team1;
    const winningTeamNum = winner_team;
    const losingTeamNum = winner_team === 1 ? 2 : 1;

    for (const player of winningTeam) {
      const player_id = playerMap.get(player.id);
      const { rows } = await db.query(
        `SELECT mmr FROM players WHERE id = $1`,
        [player_id]
      );
      const mmrBefore = rows[0].mmr;
      const mmrAfter = mmrBefore + mmrChange;

      // Update player record
      await db.query(
        `UPDATE players
         SET wins = wins + 1, mmr = $1, last_match_played = NOW()
         WHERE id = $2`,
        [mmrAfter, player_id]
      );

      // Record in pug_players
      await db.query(
        `INSERT INTO pug_players (pug_id, player_id, team_number, is_captain, mmr_before, mmr_after)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          pug_sql_id,
          player_id,
          winningTeamNum,
          player.id === pug.captain1.id || player.id === pug.captain2.id,
          mmrBefore,
          mmrAfter,
        ]
      );

      // Record in mmr_history
      await db.query(
        `INSERT INTO mmr_history (player_id, pug_id, old_mmr, new_mmr, change)
         VALUES ($1, $2, $3, $4, $5)`,
        [player_id, pug_sql_id, mmrBefore, mmrAfter, mmrChange]
      );
    }

    for (const player of losingTeam) {
      const player_id = playerMap.get(player.id);
      const { rows } = await db.query(
        `SELECT mmr FROM players WHERE id = $1`,
        [player_id]
      );
      const mmrBefore = rows[0].mmr;
      const mmrAfter = mmrBefore - mmrChange;

      await db.query(
        `UPDATE players
         SET losses = losses + 1, mmr = $1, last_match_played = NOW()
         WHERE id = $2`,
        [mmrAfter, player_id]
      );

      await db.query(
        `INSERT INTO pug_players (pug_id, player_id, team_number, is_captain, mmr_before, mmr_after)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          pug_sql_id,
          player_id,
          losingTeamNum,
          player.id === pug.captain1.id || player.id === pug.captain2.id,
          mmrBefore,
          mmrAfter,
        ]
      );

      await db.query(
        `INSERT INTO mmr_history (player_id, pug_id, old_mmr, new_mmr, change)
         VALUES ($1, $2, $3, $4, $5)`,
        [player_id, pug_sql_id, mmrBefore, mmrAfter, -mmrChange]
      );
    }

    // 5️⃣ Update pug verification info
    await db.query(
      `UPDATE pugs
       SET winner_team = $1,
           verified_at = NOW(),
           verified_by = $2
       WHERE token = $3`,
      [winner_team, verified_by_player_id, pug_id]
    );

    await db.query("COMMIT");

    // 6️⃣ Remove from Redis (cleanup finished pug)
    await redisClient.del(key);

    console.log(`✅ PUG ${pug_id} finalized: Team ${winner_team} wins. MMR updated.`);
    return { success: true };
  } catch (error) {
    await db.query("ROLLBACK");
    console.error("❌ Error during MMR update:", error);
    return { success: false, error };
  } finally {
    db.release();
  }
}