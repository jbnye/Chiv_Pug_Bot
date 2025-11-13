import { ButtonInteraction, EmbedBuilder } from "discord.js";
import { finish_pug_backend } from "../utils/finish_pug_backend";
import { redisClient } from "../redis";

export async function handleFinishPugButton(interaction: ButtonInteraction) {
  try {
    await interaction.deferReply({ ephemeral: false });

    const [_, teamWinner, pugId] = interaction.customId.split("_"); // finish_team1_<id>
    const winnerTeam = (teamWinner === "team1" ? 1 : 2) as 1 | 2;

    // Build the same data object the backend expects
    const data = {
      pug_id: pugId,
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

    // Build visual embed
    const buildTeamField = (team: 1 | 2) => {
      return mmrData
        .filter((p) => p.team === team)
        .map((p) => {
          const oldMMR = Math.round(p.oldMu - 3 * p.oldSigma);
          const newMMR = Math.round(p.newMu - 3 * p.newSigma);
          const diff = newMMR - oldMMR;
          const emoji = diff >= 0 ? "🟢" : "🔴";

          const name =
            pugData?.team1?.find((x: any) => x.id === p.playerId)?.username ||
            pugData?.team2?.find((x: any) => x.id === p.playerId)?.username ||
            "Unknown";

          return `• ${name} — ${oldMMR} → ${newMMR} ${emoji} (${diff})`;
        })
        .join("\n");
    };

    const embed = new EmbedBuilder()
      .setTitle(`🏆 Team ${winnerTeam} Wins!`)
      .addFields(
        { name: "Team 1", value: buildTeamField(1) || "_No players_" },
        { name: "Team 2", value: buildTeamField(2) || "_No players_" }
      )
      .setFooter({ text: `PUG ID: ${pugId}` })
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