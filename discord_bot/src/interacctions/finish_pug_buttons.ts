import { ButtonInteraction, EmbedBuilder } from "discord.js";
import { finish_pug_backend } from "../utils/finish_pug_backend";
import { redisClient } from "../redis";

export async function handleFinishPugButton(interaction: ButtonInteraction) {
  try {
    await interaction.deferReply({ ephemeral: false });

    const [_, teamWinner, match_id, pugId] = interaction.customId.split("_"); // finish_team1_<match_id>_<id>
    const winnerTeam = (teamWinner === "team1" ? 1 : 2) as 1 | 2;

    // Build the same data object the backend expects
    const data = {
      pug_id: pugId,
      match_id: match_id,
      date: new Date().toISOString(),
      winner: winnerTeam,
      user_requested: {
        id: interaction.user.id,
        username: interaction.user.username,
        discriminator: interaction.user.discriminator ?? "",
        globalName: interaction.user.globalName ?? null,
      },
    };

    // Call backend (this handles all MMR, Redis, SQL, captains, etc)
    const result = await finish_pug_backend({ data });

    if (!result.success) {
      await interaction.editReply({
        content: `❌ Failed to finish PUG: ${result.error || "Unknown error"}`,
      });
      return;
    }

    const mmrData = result.mmrChanges!;
    const pugRedis = await redisClient.get(`finished_pugs:${pugId}`);
    const pugData = pugRedis ? JSON.parse(pugRedis) : null;

    const computeMMRChange = (oldMu: number, oldSigma: number, newMu: number, newSigma: number) => {
      // Conservative MMR (non-negative)
      const oldHidden = Math.max(oldMu - 3 * oldSigma, 0);
      const newHidden = Math.max(newMu - 3 * newSigma, 0);

      // Show integers
      const oldShown = Math.floor(oldHidden);
      const newShown = Math.floor(newHidden);

      // Compute numeric delta
      const delta = newShown - oldShown;

      return {
        oldShown,
        newShown,
        delta, // number
        hiddenOld: oldHidden,
        hiddenNew: newHidden,
      };
    };

    // Build visual embed
    const buildTeamField = (team: 1 | 2, winningTeam: 1 | 2) => {
  return mmrData
    .filter((p) => p.team === team)
    .map((p) => {
      const { oldShown, newShown, delta } = computeMMRChange(p.oldMu, p.oldSigma, p.newMu, p.newSigma);

      const name =
        pugData?.team1?.find((x: any) => x.id === p.playerId)?.username ||
        pugData?.team2?.find((x: any) => x.id === p.playerId)?.username ||
        "Unknown";

      // Format delta string based on win/loss
      const diffStr =
        team === winningTeam
          ? delta >= 0
            ? `+${delta}`
            : `+0` // always positive for winners
          : delta <= 0
          ? `${delta}` // negative for losers
          : `-0`; // if zero but lost

      return `• ${name} — ${oldShown} → ${newShown} (${diffStr})`;
    })
    .join("\n");
};
    const winnerCaptain =
      winnerTeam === 1 ? pugData.captain1.username : pugData.captain2.username;
    const loserCaptain =
      winnerTeam === 1 ? pugData.captain2.username : pugData.captain1.username;

    const embed = new EmbedBuilder()
      .setTitle(`${winnerCaptain}'s Team Wins!`)
      .addFields(
        {
          name: `${pugData.captain1.username}'s Team`,
          value: buildTeamField(1, winnerTeam) || "_No players_",
        },
        {
          name: `${pugData.captain2.username}'s Team`,
          value: buildTeamField(2, winnerTeam) || "_No players_",
        }
      )
      .setFooter({ text: `Match #${match_id}` })
      .setTimestamp();

    await interaction.editReply({
      embeds: [embed],
      components: [],
    });

  } catch (error) {
    console.error("❌ Error handling finish pug button:", error);
    await interaction.editReply({
      content: "❌ Failed to finish PUG due to internal error.",
    });
  }
}