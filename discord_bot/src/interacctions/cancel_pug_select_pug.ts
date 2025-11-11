import { StringSelectMenuInteraction } from "discord.js";
import { redisClient } from "../redis";
import pool from "../database/db";

export async function handleCancelPugSelection(interaction: StringSelectMenuInteraction) {
  const key = interaction.values[0];

  // Delete the selected PUG key
  const deletedCount = await redisClient.del(key);

  if (deletedCount === 0) {
    await interaction.reply({ content: `❌ PUG not found or already deleted.`, ephemeral: true });
    return;
  }

  // Log the cancel command in DB
  await pool.query(
    `INSERT INTO commands (discord_id, discord_username, pug_token, action)
     VALUES ($1, $2, $3, 'canceled')`,
    [interaction.user.id, interaction.user.username, key]
  );

  await interaction.reply({
    content: `✅ Successfully canceled and deleted \`${key}\` from Redis.`,
    ephemeral: true,
  });
}