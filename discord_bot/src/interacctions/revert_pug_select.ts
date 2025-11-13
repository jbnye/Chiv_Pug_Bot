import { StringSelectMenuInteraction } from "discord.js";
import { redisClient } from "../redis";
import pool from "../database/db";

export async function handleRevertPugSelect(interaction: StringSelectMenuInteraction) {
  const pugId = interaction.values[0];
  const key = `finished_pugs:${pugId}`;

  try {
    const rawPug = await redisClient.get(key);
    if (!rawPug) {
      await interaction.reply({ content: "❌ Could not find that finished PUG in Redis.", ephemeral: true });
      return;
    }

    const pug = JSON.parse(rawPug);

    // Determine winners and losers
    const winningTeam = pug.winning_team; // assuming you store which team won
    const losingTeam = winningTeam === "team1" ? "team2" : "team1";

    // Revert stats for each player
    const dbClient = await pool.connect();
    try {
      for (const player of [...pug.team1, ...pug.team2]) {
        // Fetch previous TrueSkill/confidence from pug_players table
        const res = await dbClient.query(
          `SELECT previous_trueskill, previous_confidence, wins, losses 
           FROM pug_players WHERE discord_id = $1 ORDER BY id DESC LIMIT 1`,
          [player.id]
        );

        if (res.rows.length === 0) continue;
        const prev = res.rows[0];

        // Update current stats
        const newWins = winningTeam === player.team ? prev.wins : prev.wins; // same wins if they lost?
        const newLosses = losingTeam === player.team ? prev.losses : prev.losses;

        await dbClient.query(
          `UPDATE players
           SET trueskill = $1,
               confidence = $2,
               wins = $3,
               losses = $4
           WHERE discord_id = $5`,
          [prev.previous_trueskill, prev.previous_confidence, newWins, newLosses, player.id]
        );
      }

      // Remove the finished pug from Redis and sorted set
      await redisClient.del(key);
      await redisClient.zRem("finished_pugs:by_date", pugId);

      await interaction.reply({ content: `✅ Successfully reverted PUG ${pugId}`, ephemeral: true });
    } catch (dbErr) {
      console.error("Error reverting PUG in DB:", dbErr);
      await interaction.reply({ content: "❌ Failed to revert PUG in database.", ephemeral: true });
    } finally {
      dbClient.release();
    }
  } catch (err) {
    console.error("Error handling revert pug:", err);
    await interaction.reply({ content: "❌ Unexpected error reverting PUG.", ephemeral: true });
  }
}

