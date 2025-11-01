import { ButtonInteraction } from "discord.js";
import { finish_pug_backend } from "../utils/finish_pug_backend";

export async function handleFinishPugButton(interaction: ButtonInteraction) {
  try {
    await interaction.deferReply({ flags: 64 });

    const [_, team, rawPugId] = interaction.customId.split("_");
    const pug_id = rawPugId.replace("pug:", "");

    const data = {
    pug_id,
    date: new Date().toISOString(),
    winner: (team === "team1" ? 1 : 2) as 1 | 2,
    user_requested: {
        id: interaction.user.id,
        username: interaction.user.username,
    },
    };

    const result = await finish_pug_backend({ data });

    if (!result.success) {
      await interaction.editReply({
        content: "❌ Failed to finish PUG. Check logs.",
      });
      return;
    }

    await interaction.editReply({
      content: `✅ PUG **${pug_id}** marked as finished!`,
    });
  } catch (error) {
    console.error("Error handling finish_pug button:", error);
    if (!interaction.replied)
      await interaction.reply({ content: "Failed to finish pug.", flags: 64 });
  }
}