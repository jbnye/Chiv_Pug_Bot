import { ButtonInteraction  } from "discord.js";
import { update_mmr_after_finish } from "../utils/update_mmr_after_finish";


export async function finish_pug_button(interaction: ButtonInteraction ) {
  if (!interaction.isButton()) return;

  const [prefix, pug_id, team] = interaction.customId.split("_");
  if (prefix !== "finish") return;

  const winner_team = parseInt(team, 10) as 1 | 2;

  await interaction.deferReply({ ephemeral: true });

  const result = await update_mmr_after_finish({
    pug_id,
    winner_team,
    verified_by: {
      id: interaction.user.id,
      username: interaction.user.username,
    },
  });

  if (result.success) {
    await interaction.editReply({
      content: `PUG **${pug_id}** marked as finished!\nWinner: Team ${winner_team}.`,
    });
  } else {
    await interaction.editReply({
      content: `Failed to finish PUG: ${result.error || "unknown error"}`,
    });
  }
}