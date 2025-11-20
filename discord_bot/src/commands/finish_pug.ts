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
      // 1️⃣ Read the sorted set — THIS IS NOW THE SOURCE OF TRUTH
      const entries = await redisClient.zRangeWithScores("pug:by_match", 0, -1);

      if (entries.length === 0) {
        await interaction.reply({
          content: "❌ There are no active PUGs.",
          flags: 64,
        });
        return;
      }

      // 2️⃣ Convert sorted set results → list of pugs
      // entries structure: [token1, score1, token2, score2, ...]
      const pugs: any[] = [];
      for (const entry of entries) {
        const token = entry.value;
        const matchId = entry.score; // <-- This is a number!
        const raw = await redisClient.get(`pug:${token}`);
        if (!raw) continue;
        const pug = JSON.parse(raw);
        pug.match_id = matchId; 
        pugs.push(pug);
      }

      if (pugs.length === 0) {
        await interaction.reply({
          content: "❌ No valid PUG records found.",
          flags: 64,
        });
        return;
      }

      // 3️⃣ Convert pugs → Discord select menu options
      const options = pugs.map((pug) => {
        const estTime = new Date(pug.date).toLocaleString("en-US", {
          timeZone: "America/New_York",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });

        const label = `${pug.captain1.username} vs ${pug.captain2.username}`;
        const desc = `${estTime} EST\n[Match #${pug.match_id}]`;

        return new StringSelectMenuOptionBuilder()
          .setLabel(label)
          .setDescription(desc)
          .setValue(pug.token);
      });

      // 4️⃣ Build select menu (Discord allows max 25)
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("finish_pug_select")
        .setPlaceholder("Select a PUG to finish")
        .addOptions(options.slice(0, 25));

      const row =
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          selectMenu
        );

      // 5️⃣ Respond to user
      await interaction.reply({
        content: "Select the PUG you'd like to finish:",
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