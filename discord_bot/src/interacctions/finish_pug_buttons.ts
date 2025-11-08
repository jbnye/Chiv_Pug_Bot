import { ButtonInteraction } from "discord.js";
import { finish_pug_backend } from "../utils/finish_pug_backend";
import { update_mmr_after_finish } from "../utils/update_mmr_after_finish";
import type { finish_pug_backend_props_type } from "../types/finish_pug_data";

export async function handleFinishPugButton(interaction: ButtonInteraction) {
  try {
    // defer so Discord doesn't mark the interaction as failed
    await interaction.deferReply({ flags: 64 });

    // customId expected format: like "finish_team1_pug:<uuid>" or "finish_team1_<uuid>"
    // adjust parsing to match your format; this assumes something like "finish_team1_<pugId>"
    const parts = interaction.customId.split("_");
    // parts example: ["finish","team1","pug:ed3..."] or ["finish","team1","ed3..."]
    const teamPart = parts[1];
    let rawPugId = parts.slice(2).join("_"); // support extra underscores
    // if you saved pug id with a "pug:" prefix somewhere, strip it here:
    if (rawPugId.startsWith("pug:")) rawPugId = rawPugId.replace("pug:", "");
    const pug_id = rawPugId;

    const winnerNum = teamPart === "team1" ? 1 : 2;
    // build a value that exactly matches your declared interface
    const data: finish_pug_backend_props_type = {
      pug_id,
      date: new Date().toISOString(),
      winner: winnerNum as 1 | 2,
      user_requested: {
        id: interaction.user.id,
        username: interaction.user.username,
        // optional fields from your interface — include them if available
        discriminator: (interaction.user as any).discriminator ?? undefined,
        globalName: (interaction.user as any).globalName ?? null,
      },
    };

    // Call backend to move the PUG in Redis + log command
    const result = await finish_pug_backend({ data });

    if (!result.success) {
      await interaction.editReply({
        content: `❌ Failed to finish PUG: ${result.error ?? "Unknown error"}`,
      });
      return;
    }

    // Update MMR + write to Postgres (this expects winner_team: 1|2)
    const mmrResult = await update_mmr_after_finish({
      pug_id: data.pug_id,
      winner_team: data.winner,
      verified_by: { id: data.user_requested.id, username: data.user_requested.username },
    });

    if (!mmrResult.success) {
      console.error("MMR update failed:", mmrResult.error);
      await interaction.editReply({
        content: `⚠️ PUG marked finished in Redis but failed to update MMR.`,
      });
      return;
    }

    await interaction.editReply({
      content: `✅ You marked ${data.user_requested.username}’s team as the winner for PUG ${pug_id}.`,
    });
  } catch (error) {
    console.error("Error handling finish_pug button:", error);
    if (!interaction.replied) {
      await interaction.reply({ content: "Failed to finish pug.", flags: 64 });
    } else {
      // we've already replied/deferred - try to followUp
      try { await interaction.followUp({ content: "Failed to finish pug.", flags: 64 }); } catch {}
    }
  }
}