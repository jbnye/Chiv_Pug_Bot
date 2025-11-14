import pool from "../database/db";
import { redisClient } from "../redis";
import type { create_pug_backend_props_type } from "../types/create_pug_data";

interface create_pug_backend_Props {
  data: create_pug_backend_props_type;
}

export const create_pug_backend = async ({ data }: create_pug_backend_Props) => {
  const db_client = await pool.connect();

  try {
    // 1️⃣ Save PUG in Redis using UUID token
    const redisKey = `pug:${data.pug_id}`; // UUID
    const pugRecord = {
      token: data.pug_id, 
      date: data.date,
      team1: data.team1,
      team2: data.team2,
      captain1: data.team1[0],
      captain2: data.team2[0],
      user_created: data.user_requested,
    };

    await redisClient.set(redisKey, JSON.stringify(pugRecord), { EX: 86400 });
    await redisClient.zAdd("pugs:by_date", [
      { score: Date.now(), value: data.pug_id },
    ]);
    console.log(`✅ Created PUG saved to Redis as ${redisKey}`);

    // 2️⃣ Save PUG in Postgres (auto-increment pug_id) with UUID as token
    const res = await db_client.query(
      `
      INSERT INTO pugs (token, captain1_id, captain2_id, created_at)
      VALUES ($1, $2, $3, $4)
      RETURNING pug_id
      `,
      [data.pug_id, data.team1[0].id, data.team2[0].id, data.date]
    );
    const matchNumber = res.rows[0].pug_id;

    // 3️⃣ Save command history with UUID token
    await db_client.query(
      `
      INSERT INTO commands (discord_id, discord_username, pug_token, action)
      VALUES ($1, $2, $3, $4)
      `,
      [
        data.user_requested.id.toString(),
        data.user_requested.username,
        data.pug_id,
        "created",
      ]
    );

    console.log(`✅ Created PUG Command saved to PostgreSQL`);

    return { success: true, key: redisKey, matchNumber };
  } catch (error: any) {
    console.error("⚠️ Failed to save PUG:", error);
    return { success: false, error: error.message || "Database/Redis error" };
  } finally {
    db_client.release();
  }
};