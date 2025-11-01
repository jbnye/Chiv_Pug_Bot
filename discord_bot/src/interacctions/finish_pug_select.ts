import {
  StringSelectMenuInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";

export async function handleFinishPugSelect(interaction: StringSelectMenuInteraction) {
  const selectedPugId = interaction.values[0];

  const team1Btn = new ButtonBuilder()
    .setCustomId(`finish_team1_${selectedPugId}`)
    .setLabel("Team 1 Won")
    .setStyle(ButtonStyle.Success);

  const team2Btn = new ButtonBuilder()
    .setCustomId(`finish_team2_${selectedPugId}`)
    .setLabel("Team 2 Won")
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(team1Btn, team2Btn);

  await interaction.update({
    content: `Finishing PUG **${selectedPugId}** — select the winning team:`,
    components: [row],
  });
}