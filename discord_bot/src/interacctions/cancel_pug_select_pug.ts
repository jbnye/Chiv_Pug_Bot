import { redisClient } from "../redis";
import pool from "../database/db";
import {
  StringSelectMenuInteraction,
  EmbedBuilder,
} from "discord.js";


function canSendMessages(
  channel: any
): channel is { send: (options: any) => Promise<any> } {
  return !!channel && typeof channel.send === "function";
}

export async function handleCancelPugSelection(interaction: StringSelectMenuInteraction) {
  try {
    const { token, match_id } = JSON.parse(interaction.values[0]);
    const redisKey = `pug:${token}`;

    const deletedCount = await redisClient.del(redisKey);
    if (deletedCount === 0) {
      return interaction.update({
        content: "PUG not found or already deleted.",
        components: []
      });
    }

    await pool.query(
      `INSERT INTO commands (discord_id, discord_username, pug_token, action)
       VALUES ($1, $2, $3, 'canceled')`,
      [interaction.user.id, interaction.user.username, token]
    );

    const embed = new EmbedBuilder()
      .setTitle(`Match # ${match_id} canceled`)
      .setDescription(`Canceled by **${interaction.user.username}**`)
      .setColor(0x64026d)
      .setTimestamp();


    await interaction.update({
      content: "Canceling PUG...",
      components: []
    });

    const channel = interaction.channel;

    if (canSendMessages(channel)) {
      await channel.send({ embeds: [embed] });
    } else {
      await interaction.followUp({ embeds: [embed] });
    }

  } catch (err) {
    console.error("handleCancelPugSelection error:", err);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "Something went wrong canceling the PUG.",
      });
    }
  }
}