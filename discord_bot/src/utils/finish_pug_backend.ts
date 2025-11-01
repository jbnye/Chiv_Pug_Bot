import pool from "../database/db";
import { redisClient } from "../redis";
import { update_mmr_after_finish } from "./update_mmr_after_finish";
import type { finish_pug_backend_props_type } from "../types/finish_pug_data";

interface FinishPugBackendProps {
  data: finish_pug_backend_props_type;
}

/**
 * Handles finishing a PUG:
 *  - Updates all player MMR + PUG info in DB
 *  - Moves PUG from active → finished Redis key
 *  - Logs command to SQL
 */
export const finish_pug_backend = async ({ data }: FinishPugBackendProps) => {
  const db = await pool.connect();

  try {
    const pugKey = `pug:${data.pug_id}`;
    const finishedKey = `finished_pugs:${data.pug_id}`;
    // 1️⃣ Retrieve PUG data from Redis
    const pugData = await redisClient.get(pugKey);
    console.log("Redis data:", pugData);
    if (!pugData) {
      console.error(`No active PUG found for ${pugKey}`);
      return { success: false, error: "PUG not found in Redis" };
    }

    const pug = JSON.parse(pugData);

    console.log("Fetching Redis key for MMR update:", `pug:${data.pug_id}`);
    
    // 2️⃣ Update MMR before moving PUG
    const mmrResult = await update_mmr_after_finish({
    pug_id: data.pug_id,
    winner_team: data.winner as 1 | 2,
    verified_by: {
        id: data.user_requested.id,
        username: data.user_requested.username,
    },
    });

    if (!mmrResult.success) {
      console.error("❌ MMR update failed:", mmrResult.error);
      return { success: false, error: "MMR update failed" };
    }

    console.log(`✅ MMR updated for PUG ${data.pug_id}`);

    // 3️⃣ Move PUG to finished_pugs
    const finishedPugData = {
      ...pug,
      winner: data.winner,
      finished_at: data.date,
      user_finished: {
        ...data.user_requested,
        discriminator: data.user_requested.discriminator ?? "",
        globalName: data.user_requested.globalName ?? null,
      },
    };

    await redisClient.set(finishedKey, JSON.stringify(finishedPugData), { EX: 86400 });
    await redisClient.del(pugKey);

    console.log(`PUG moved from ${pugKey} → ${finishedKey}`);

    // 4️⃣ Log the command in SQL
    await db.query(
      `
      INSERT INTO commands (discord_id, discord_username, pug_token, action)
      VALUES ($1, $2, $3, $4)
      `,
      [data.user_requested.id, data.user_requested.username, data.pug_id, "finished"]
    );

    console.log("✅ Finished PUG command logged to SQL.");

    return { success: true };
  } catch (error) {
    console.error("Error in finish_pug_backend:", error);
    return { success: false, error };
  } finally {
    db.release();
  }
};