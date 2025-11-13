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
    .setDescription("Revert one of the last two finished PUGs."),

  async execute(interaction: ChatInputCommandInteraction) {
    try {
      // Get the last 2 finished PUGs by date
      const recentPugIds = await redisClient.zRange("finished_pugs:by_date", -2, -1);

      if (recentPugIds.length === 0) {
        await interaction.reply({
          content: "There are no finished PUGs available to revert.",
          flags: 64,
        });
        return;
      }

      // Fetch full PUG data for each recent pug
      const pugs = await Promise.all(
        recentPugIds.map(async (id) => {
          const data = await redisClient.get(`finished_pugs:${id}`);
          return data ? JSON.parse(data) : null;
        })
      );

      const validPugs = pugs.filter(Boolean);
      if (!validPugs.length) {
        await interaction.reply({
          content: "No valid finished PUG data found in Redis.",
          flags: 64,
        });
        return;
      }

      // Build dropdown options
      const options = validPugs.map((pug) => {
        const estTime = new Date(pug.date).toLocaleString("en-US", {
          timeZone: "America/New_York",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });

        const label = `${pug.captain1.username} vs ${pug.captain2.username}`;
        const desc = `${estTime} EST • ID: ${pug.pug_id}`;
        return new StringSelectMenuOptionBuilder()
          .setLabel(label)
          .setDescription(desc)
          .setValue(pug.pug_id);
      });

      // Build select menu
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("revert_pug_select")
        .setPlaceholder("Select a finished PUG to revert")
        .addOptions(options);

      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

      await interaction.reply({
        content: "Select a finished PUG to revert:",
        components: [row],
      });
    } catch (error) {
      console.error("Error in /revert_pug:", error);
      await interaction.reply({
        content: "Failed to load finished PUGs.",
        flags: 64,
      });
    }
  },
};