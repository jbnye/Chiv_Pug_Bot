import {
  StringSelectMenuInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { redisClient } from "../redis";


export async function handleFinishPugSelect(interaction: StringSelectMenuInteraction) {
  try {
    await interaction.deferReply({ flags: 64 });

    const selectedPugId = interaction.values[0];
    if (!selectedPugId) {
      await interaction.editReply({ content: "⚠️ No PUG selected." });
      return;
    }

    const pugRaw = await redisClient.get(`pug:${selectedPugId}`);
    if (!pugRaw) {
      await interaction.editReply({ content: "⚠️ PUG not found in Redis." });
      return;
    }

    const pugData = JSON.parse(pugRaw);
    const match_id = pugData.match_id ?? 0;
    const team1Captain = pugData.captain1?.username ?? "Team 1";
    const team2Captain = pugData.captain2?.username ?? "Team 2";

    const date = new Date();
    const estDate = date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "America/New_York",
    });

    const team1Btn = new ButtonBuilder()
      .setCustomId(`finish_team1_${match_id}_${selectedPugId}`)
      .setLabel(`${team1Captain}'s Team Won`)
      .setStyle(ButtonStyle.Secondary);

    const team2Btn = new ButtonBuilder()
      .setCustomId(`finish_team2_${match_id}_${selectedPugId}`)
      .setLabel(`${team2Captain}'s Team Won`)
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(team1Btn, team2Btn);

    const messageContent = [
      `**Match #${match_id}**`,
      `**${team1Captain}** vs **${team2Captain}**`,
      `${estDate} EST`,
      "",
      "Select the winning team below:"
    ].join("\n");

    await interaction.editReply({
      content: messageContent,
      components: [row],
    });
  } catch (error) {
    console.error("Error handling finish_pug select:", error);
    await interaction.editReply({ content: "❌ Failed to load PUG for finishing." });
  }
}