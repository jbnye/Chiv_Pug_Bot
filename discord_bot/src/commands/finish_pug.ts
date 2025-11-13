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
    .setName("finish_pug")
    .setDescription("Select a PUG to finish and record a winner."),

  async execute(interaction: ChatInputCommandInteraction) {
    try {
      const keys = await redisClient.keys("pug:*");
      if (keys.length === 0) {
        await interaction.reply({
          content: "❌ There are no active PUGs.",
          flags: 64,
        });
        return;
      }

      const pugs = await Promise.all(
        keys.map(async (key) => {
          const data = await redisClient.get(key);
          return data ? JSON.parse(data) : null;
        })
      );

      const validPugs = pugs.filter(Boolean);

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
        const desc = `${estTime} EST\n[PUG ID: ${pug.pug_id}]`;

        return new StringSelectMenuOptionBuilder()
          .setLabel(label)
          .setDescription(desc)
          .setValue(pug.pug_id);
      });

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("finish_pug_select")
        .setPlaceholder("Select a PUG to finish")
        .addOptions(options.slice(0, 25));

      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

      await interaction.reply({
        content: "🏁 Select the PUG you’d like to finish:",
        components: [row],
      });
    } catch (error) {
      console.error("Error in /finish_pug:", error);
      await interaction.reply({
        content: "❌ Failed to load PUGs.",
        flags: 64,
      });
    }
  },
};