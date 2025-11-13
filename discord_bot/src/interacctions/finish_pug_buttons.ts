import { ButtonInteraction } from "discord.js";
import { update_mmr_after_finish } from "../utils/update_mmr_after_finish";
import { redisClient } from "../redis";

export async function handleFinishPugButton(interaction: ButtonInteraction) {
  try {
    await interaction.deferReply({ flags: 64 });

    const [_, teamWinner, pugId] = interaction.customId.split("_"); // finish_team1_<id>
    const winnerTeam = teamWinner === "team1" ? 1 : 2;

    const pugRaw = await redisClient.get(`pug:${pugId}`) || await redisClient.get(`finished_pugs:${pugId}`);
    if (!pugRaw) {
      await interaction.editReply({ content: "⚠️ PUG data not found." });
      return;
    }

    const pugData = JSON.parse(pugRaw);

    const result = await update_mmr_after_finish({
      pug_id: pugId,
      winner_team: winnerTeam,
      verified_by: { id: interaction.user.id, username: interaction.user.username },
    });

    if (!result.success) {
      await interaction.editReply({ content: "⚠️ MMR update failed." });
      return;
    }

    // --- Generate summary ---
    const mmrData = result.results;
    const team1Lines: string[] = [];
    const team2Lines: string[] = [];

    for (const player of mmrData!) {
      const name = pugData.team1.concat(pugData.team2).find((p: any) => p.id === player.playerId)?.username ?? "Unknown";
      const mu = player.newMu.toFixed(1);
      const sigma = player.newSigma.toFixed(1);
      const approx = Math.round(player.newMu - 3 * player.newSigma);
      const delta = player.delta > 0 ? `+${player.delta}` : `${player.delta}`;

      const line = `• @${name} — ${mu} ±${sigma} (≈ ${approx}) (${player.team === winnerTeam ? `Win: ${delta}` : `Loss: ${delta}`})`;

      if (player.team === 1) team1Lines.push(line);
      else team2Lines.push(line);
    }

    const team1Name = pugData.captain1.username;
    const team2Name = pugData.captain2.username;

    const summary = [
      `🏁 **${team1Name} vs ${team2Name}** — PUG **${pugId}**`,
      "",
      `**${team1Name}’s team**`,
      ...team1Lines,
      "",
      `**${team2Name}’s team**`,
      ...team2Lines,
    ].join("\n");

    await interaction.editReply({ content: summary });
  } catch (error) {
    console.error("Error handling finish_pug button:", error);
    await interaction.editReply({ content: "❌ Failed to finish PUG." });
  }
}