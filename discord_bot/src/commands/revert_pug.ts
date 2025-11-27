import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from "discord.js";
import { redisClient } from "../redis";

export default {
  data: new SlashCommandBuilder()
    .setName("revert_pug")
    .setDescription("Revert one of the last two finished PUGs (by match #)."),

  async execute(interaction: ChatInputCommandInteraction) {
    try {
      // Pull last two finished match numbers (highest match_id)
      const recentMatchIds = await redisClient.zRange("finished_pugs:by_match", -2, -1);

      if (recentMatchIds.length === 0) {
        await interaction.reply({
          content: "There are no finished matches available to revert.",
          flags: 64,
        });
        return;
      }

      // Get full match objects
      const matches = await Promise.all(
        recentMatchIds.map(async (matchId) => {
          const data = await redisClient.get(`finished_pugs:${matchId}`);
          return data ? JSON.parse(data) : null;
        })
      );

      const validMatches = matches.filter(Boolean);
      if (!validMatches.length) {
        await interaction.reply({
          content: "No valid match data found in Redis.",
          flags: 64,
        });
        return;
      }

      // Build dropdown options
      const options = validMatches.map((match) => {
        const estTime = new Date(match.finished_at).toLocaleString("en-US", {
          timeZone: "America/New_York",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });

        return new StringSelectMenuOptionBuilder()
          .setLabel(`Match #${match.match_id} | ${match.captain1.username} vs ${match.captain2.username}`)
          .setDescription(`${estTime} EST`)
          .setValue(match.token);
      });

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("revert_pug_select")
        .setPlaceholder("Select a match to revert")
        .addOptions(options);

      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

      await interaction.reply({
        content: "Select a finished match to revert:",
        components: [row],
      });
    } catch (error) {
      console.error("Error in /revert_pug:", error);
      await interaction.reply({
        content: "Failed to load finished matches.",
        flags: 64,
      });
    }
  },
};