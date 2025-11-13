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
    .setName("cancel_pug")
    .setDescription("Select a PUG to cancel."),

  async execute(interaction: ChatInputCommandInteraction) {
    try {
      const keys = await redisClient.keys("pug:*");

      if (keys.length === 0) {
        await interaction.reply({
          content: "❌ There are no active PUGs in Redis.",
          flags: 64,
        });
        return;
      }

      const pugs = await Promise.all(
        keys.map(async (key) => {
          const pugData = await redisClient.get(key);
          return pugData ? JSON.parse(pugData) : null;
        })
      );

      const validPugs = pugs.filter(Boolean);

      if (validPugs.length === 0) {
        await interaction.reply({
          content: "❌ No valid PUGs found in Redis.",
          flags: 64,
        });
        return;
      }

      // ✅ Format each PUG nicely
      const options = validPugs.map((pug) => {
        const estTime = pug.date
          ? new Date(pug.date).toLocaleString("en-US", {
              timeZone: "America/New_York",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            })
          : "Unknown time";

        const captain1 = pug.captain1?.username ?? "Team 1";
        const captain2 = pug.captain2?.username ?? "Team 2";

        const label = `${captain1} vs ${captain2}`;
        const desc = `${estTime} EST\n[PUG ID: ${pug.pug_id}]`;

        return new StringSelectMenuOptionBuilder()
          .setLabel(label.slice(0, 100)) // safeguard for Discord 100-char limit
          .setDescription(desc.slice(0, 100))
          .setValue(pug.pug_id);
      });

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("cancel_pug_select")
        .setPlaceholder("Select a PUG to cancel")
        .addOptions(options.slice(0, 10)); // Discord max 25, keeping it clean at 10

      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

      await interaction.reply({
        content: "🗑️ **Cancel PUG** — choose one from the list below:",
        components: [row],
        flags: 64, // ephemeral
      });
    } catch (error) {
      console.error("Error in /cancel_pug:", error);
      await interaction.reply({
        content: "❌ Failed to load PUGs.",
        flags: 64,
      });
    }
  },
};