import pool from "../database/db";
import { redisClient } from "../redis";
import type {finish_pug_backend_props_type} from "../types/finish_pug_data.ts";
interface finish_pug_backend_props {
    data: finish_pug_backend_props_type,
}

export const finish_pug_backend = async ({data}: finish_pug_backend_props) => {
    try {
        const key = `finished_pugs:${data.pug_id}`;
        const finished_pug_data = {
            pug_id: data.pug_id,
            date: data.date,
            winner: data.winner,
            user_created: data.user_requested,
        };
    await redisClient.set(key, JSON.stringify(finished_pug_data), { EX: 86400} );

    console.log(`Finished PUG saved to Redis as ${key}`);
    const db_client = await pool.connect();
    try {
        await db_client.query(`
        INSERT INTO commands (
            discord_id,
            discord_username,
            pug_token,
            action
        ) VALUES ($1, $2, $3, $4)
        `, [
        data.user_requested.id.toString(),
        data.user_requested.username,
        data.pug_id,
        "finished"
        ]);
        console.log("Finished Pug Command saved to PostgreSQL");
        return { success: true, key };
    } catch (error) {
        console.error("Failed to save Command in database:", error);
    }
    finally{
        db_client.release();
    }

  } catch (error) {
    console.error("Failed to save PUG in redis:", error);
    return { success: false, error };
  }

}

