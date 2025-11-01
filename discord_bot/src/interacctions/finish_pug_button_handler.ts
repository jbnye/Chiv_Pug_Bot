import { StringSelectMenuInteraction } from "discord.js";
import { finish_pug_backend } from "../utils/finish_pug_backend";

export async function handleFinishPugSelect(interaction: StringSelectMenuInteraction) {
  try {
    // Defer reply; ephemeral is still valid in runtime, TS may warn
    await interaction.deferReply({ ephemeral: true });

    const pug_id = interaction.values[0];
    if (!pug_id) throw new Error("No PUG selected.");

    const winner = 1; // Placeholder winner

    const data = {
      pug_id,
      date: new Date().toISOString(),
      winner: winner as 1 | 2,
      user_requested: {
        id: interaction.user.id,
        username: interaction.user.username,
        discriminator: interaction.user.discriminator ?? "",
        globalName: interaction.user.globalName ?? null,
      },
    };

    const result = await finish_pug_backend({ data });

    if (!result.success) {
      await interaction.editReply({ content: `❌ Failed to finish PUG: ${result.error || "Unknown error"}` });
      return;
    }

    await interaction.editReply({
      content: `✅ PUG **${pug_id}** marked as finished! Team ${winner} wins.`,
    });

  } catch (error) {
    console.error("Error handling finish_pug select:", error);

    // Only edit reply since we already deferred
    try {
      await interaction.editReply({ content: "❌ Failed to finish PUG due to an internal error." });
    } catch (e) {
      console.error("Also failed to edit reply:", e);
    }
  }
}