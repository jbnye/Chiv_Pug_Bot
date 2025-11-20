import { StringSelectMenuInteraction } from "discord.js";
import { redisClient } from "../redis";
import pool from "../database/db";

export async function handleRevertPugSelect(interaction: StringSelectMenuInteraction) {
  const pugToken = interaction.values[0];
  await interaction.deferReply({ flags: 64 });

  const dbClient = await pool.connect();
  try {
    const redisKey = `finished_pugs:${pugToken}`;
    const rawPug = await redisClient.get(redisKey);

    if (!rawPug) {
      return interaction.editReply("❌ Could not find that finished PUG in Redis.");
    }

    const pug = JSON.parse(rawPug);

    const winnerTeam = pug.winner; // 1 or 2
    const loserTeam = winnerTeam === 1 ? 2 : 1;

    const playerSnapshots = pug.playerSnapshots;

    // 1️⃣ Log revert command
    await dbClient.query(
      `INSERT INTO commands (discord_id, discord_username, pug_token, action)
       VALUES ($1, $2, $3, 'reverted')`,
      [interaction.user.id, interaction.user.username, pugToken]
    );

    // 2️⃣ Get numeric pug_id from SQL
    const res = await dbClient.query(`SELECT pug_id FROM pugs WHERE token = $1`, [pugToken]);
    if (!res.rows.length) {
      return interaction.editReply("❌ PUG not found in SQL.");
    }

    const numericPugId = res.rows[0].pug_id;

    // Helper to check team
    const getPlayerTeam = (id: string) => {
      if (pug.team1.some((p: any) => p.id === id)) return 1;
      if (pug.team2.some((p: any) => p.id === id)) return 2;
      return null;
    };

    // 3️⃣ Revert stats & MMR for each player
    for (const snap of playerSnapshots) {
      const playerId = snap.id;
      const team = getPlayerTeam(playerId);
      if (!team) continue;

      const isWinner = team === winnerTeam;
      const isCaptain =
        pug.captain1.id === playerId ||
        pug.captain2.id === playerId;

      // we revert back to the "current" snapshot from before the match
      const oldMu = snap.current.mu;
      const oldSigma = snap.current.sigma;

      await dbClient.query(
        `UPDATE players
         SET 
           mu = $1,
           sigma = $2,
           wins = wins - $3,
           losses = losses - $4,
           captain_wins = captain_wins - $5,
           captain_losses = captain_losses - $6
         WHERE discord_id = $7`,
        [
          oldMu,
          oldSigma,
          isWinner ? 1 : 0,
          !isWinner ? 1 : 0,
          isCaptain && isWinner ? 1 : 0,
          isCaptain && !isWinner ? 1 : 0,
          playerId
        ]
      );
    }

    // 4️⃣ Delete mmr_history for the pug
    await dbClient.query(`DELETE FROM mmr_history WHERE pug_token = $1`, [pugToken]);

    // 5️⃣ Mark pug as reverted
    await dbClient.query(`UPDATE pugs SET reverted = TRUE WHERE token = $1`, [pugToken]);

    // 6️⃣ Remove redis entries
    await redisClient.del(redisKey);
    await redisClient.zRem("finished_pugs:by_match", pugToken);

    await interaction.editReply(`✅ Successfully reverted PUG #${numericPugId}`);
  } catch (err) {
    console.error("Error reverting PUG:", err);
    await interaction.editReply("❌ Unexpected error reverting PUG.");
  } finally {
    dbClient.release();
  }
}