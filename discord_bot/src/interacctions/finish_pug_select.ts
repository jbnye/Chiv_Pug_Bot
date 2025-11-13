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
    const team1Captain = pugData.team1?.[0]?.username ?? "Team 1";
    const team2Captain = pugData.team2?.[0]?.username ?? "Team 2";

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
      .setCustomId(`finish_team1_${selectedPugId}`)
      .setLabel(`${team1Captain}'s Team Won`)
      .setStyle(ButtonStyle.Success);

    const team2Btn = new ButtonBuilder()
      .setCustomId(`finish_team2_${selectedPugId}`)
      .setLabel(`${team2Captain}'s Team Won`)
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(team1Btn, team2Btn);

    const messageContent = `🏁 **Finish PUG Selection**

${team1Captain} vs ${team2Captain}
${estDate} EST
**[PUG ID: ${selectedPugId}]**

Pick the winning team below:`;

    await interaction.editReply({
      content: messageContent,
      components: [row],
    });
  } catch (error) {
    console.error("Error handling finish_pug select:", error);
    await interaction.editReply({ content: "❌ Failed to load PUG for finishing." });
  }
}