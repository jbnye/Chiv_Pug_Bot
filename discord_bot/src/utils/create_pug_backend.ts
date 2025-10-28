import pool from "../database/db";
import { redisClient } from "../redis";
import type {create_pug_backend_props_type} from "../types/create_pug_data";

interface create_pug_backend_Props {
    data: create_pug_backend_props_type,
}

export const create_pug_backend = async ({data}: create_pug_backend_Props) => {
    try {
        const key = `pug:${data.pug_id}`;
        const pugRecord = {
        pug_id: data.pug_id,
        date: data.date,
        team1: data.team1,
        team2: data.team2,
        captain1: data.team1[0],
        captain2: data.team2[0],
        user_created: data.user_requested,
        };
    await redisClient.set(key, JSON.stringify(pugRecord));

    console.log(`PUG saved to Redis as ${key}`);

    try {
        const db_client = await pool.connect();
        db_client.query(`
            INSERT INTO commands VALUES
            ($1, $2, $3, $4)
        `, [data.user_requested.id, data.user_requested.username, data.pug_id, "created"]);
        console.log("Command saved to PostgreSQL");
        return { success: true, key };
    } catch (error) {
        console.error("Failed to save Command in database:", error);
    }

  } catch (error) {
    console.error("Failed to save PUG in redis:", error);
    return { success: false, error };
  }


}

