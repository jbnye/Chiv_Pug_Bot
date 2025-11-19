import pool from "../database/db";
import { redisClient } from "../redis";
import { update_mmr_after_finish } from "./update_mmr_after_finish";
import type { finish_pug_backend_props_type } from "../types/finish_pug_data";

interface FinishPugBackendProps {
  data: finish_pug_backend_props_type;
}

/**
 * Handles finishing a PUG:
 *  - Calls MMR update and collects final deltas
 *  - Moves PUG from active → finished Redis key
 *  - Logs command to SQL
 *  - Updates captain win/loss stats
 */
export const finish_pug_backend = async ({ data }: FinishPugBackendProps) => {
  const db = await pool.connect();

  try {
    const pugKey = `pug:${data.pug_id}`;
    const finishedKey = `finished_pugs:${data.pug_id}`;

    // 1️⃣ Retrieve PUG data from Redis
    const pugData = await redisClient.get(pugKey);
    console.log("PUG DATA:", pugData);
    if (!pugData) {
      console.error(`❌ No active PUG found for ${pugKey}`);
      return { success: false, error: "PUG not found in Redis" };
    }

    const pug = JSON.parse(pugData);

    // 2️⃣ Update MMR and get structured deltas
    const mmrResult = await update_mmr_after_finish({
      pug_id: data.pug_id,
      winner_team: data.winner as 1 | 2,
      verified_by: {
        id: data.user_requested.id,
        username: data.user_requested.username, // fixed
      },
    });

    if (!mmrResult.success) {
      console.error("❌ MMR update failed:", mmrResult.error);
      return { success: false, error: "MMR update failed" };
    }

    const { results: mmrChanges } = mmrResult;
    // 3️⃣ Move PUG to finished_pugs in Redis
    const finishedPugData = {
      ...pug,
      winner: data.winner,
      finished_at: data.date,
      user_finished: {
        ...data.user_requested,
        discriminator: data.user_requested.discriminator ?? "",
        globalName: data.user_requested.globalName ?? null,
      },
      mmr_changes: mmrChanges,
    };

    await redisClient.zAdd("finished_pugs:by_date", {
      score: Date.now(),
      value: data.pug_id,
    });

    await redisClient.set(finishedKey, JSON.stringify(finishedPugData), { EX: 86400 });
    await redisClient.del(pugKey);

    console.log(`📦 PUG moved from ${pugKey} → ${finishedKey}`);

    // 4️⃣ Log the command in SQL
    await db.query(
      `
      INSERT INTO commands (discord_id, discord_username, pug_token, action)
      VALUES ($1, $2, $3, $4)
      `,
      [data.user_requested.id, data.user_requested.username, data.pug_id, "finished"] // fixed
    );

    console.log("🧾 Finished PUG command logged to SQL.");

    // 5️⃣ Prepare summary for Discord
    const formatTeam = (teamNum: 1 | 2) =>
      mmrChanges!
        .filter((c) => c.team === teamNum)
        .map((c) => {
          const diff = c.delta >= 0 ? `🟢 (+${c.delta})` : `🔴 (${c.delta})`;
          return `• <@${c.playerId}> — ${c.oldMMR} → ${c.newMMR} ${diff}`;
        })
        .join("\n") || "_No players found_";

    const summaryMessage = `✅ **PUG Finished!**
    🏆 **Winner:** Team ${data.winner}

    **Team 1**
    ${formatTeam(1)}

    **Team 2**
    ${formatTeam(2)}
    `;

    // 6️⃣ Update captain win/loss records
    const captain1Id = pug.captain1.id;
    const captain2Id = pug.captain2.id;
    const winningCaptain = data.winner === 1 ? captain1Id : captain2Id;
    const losingCaptain = data.winner === 1 ? captain2Id : captain1Id;

    await db.query("BEGIN");

    // Increment wins for winning captain
    await db.query(
      `
      INSERT INTO players (discord_id, captain_wins, captain_losses)
      VALUES ($1, 1, 0)
      ON CONFLICT (discord_id)
      DO UPDATE SET captain_wins = players.captain_wins + 1
      `,
      [winningCaptain]
    );

    // Increment losses for losing captain
    await db.query(
      `
      INSERT INTO players (discord_id, captain_wins, captain_losses)
      VALUES ($1, 0, 1)
      ON CONFLICT (discord_id)
      DO UPDATE SET captain_losses = players.captain_losses + 1
      `,
      [losingCaptain]
    );

    await db.query("COMMIT");

    console.log(`📊 Updated captain stats: +1 win for ${winningCaptain}, +1 loss for ${losingCaptain}`);

    return { success: true, mmrChanges, summaryMessage };
  } catch (error) {
    console.error("Error in finish_pug_backend:", error);
    await db.query("ROLLBACK");
    return { success: false, error };
  } finally {
    db.release();
  }
};