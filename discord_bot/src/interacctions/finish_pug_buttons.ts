import { ButtonInteraction, EmbedBuilder } from "discord.js";
import { finish_pug_backend } from "../utils/finish_pug_backend";
import { redisClient } from "../redis";

export async function handleFinishPugButton(interaction: ButtonInteraction) {
  try {
    await interaction.deferReply({ ephemeral: false });

    const [_, teamWinner, match_id, pugId] = interaction.customId.split("_");
    const winnerTeam: 1 | 2 = teamWinner === "team1" ? 1 : 2;

    const data = {
      pug_id: pugId,
      match_id,
      date: new Date().toISOString(),
      winner: winnerTeam,
      user_requested: {
        id: interaction.user.id,
        username: interaction.user.username,
        discriminator: interaction.user.discriminator ?? "",
        globalName: interaction.user.globalName ?? null,
      },
    };

    // Finish backend
    const result = await finish_pug_backend({ data });

    if (!result.success) {
      return interaction.editReply({
        content: `❌ Failed to finish PUG: ${result.error ?? "Unknown error"}`,
      });
    }

    // Load the stored finished PUG WITH snapshots
    const stored = await redisClient.get(`finished_pugs:${pugId}`);
    if (!stored) {
      return interaction.editReply("❌ Finished PUG saved, but data could not be loaded.");
    }

    const pug = JSON.parse(stored);

    const playerSnapshots = pug.playerSnapshots;
    const winnerCaptain =
      winnerTeam === 1 ? pug.captain1.username : pug.captain2.username;

    // Helper: stringify team results based on snapshot
    const buildTeamField = (team: 1 | 2) => {
      const teamPlayers = team === 1 ? pug.team1 : pug.team2;

      return teamPlayers
        .map((player: any) => {
          const snap = playerSnapshots.find((ps: any) => ps.id === player.id);
          if (!snap) return `• ${player.username} — _no snapshot_`;

          const outcome = snap[team === winnerTeam ? "win" : "loss"];

          const before = snap.current.shown;
          const after = outcome.shown;
          const delta = outcome.delta;
          const diff = delta >= 0 ? `+${delta}` : `${delta}`;

          return `• ${player.username} — ${before} → ${after} (${diff})`;
        })
        .join("\n");
    };

    // Construct embed
    const embed = new EmbedBuilder()
      .setTitle(`Match #${match_id}\n${winnerCaptain}'s Team Wins!`)
      .addFields(
        {
          name: `${pug.captain1.username}'s Team`,
          value: buildTeamField(1) || "_No players_",
        },
        {
          name: `${pug.captain2.username}'s Team`,
          value: buildTeamField(2) || "_No players_",
        }
      )
      // .setFooter({ text: `Match #${match_id}` })
      .setTimestamp();

    await interaction.editReply({
      embeds: [embed],
      components: [],
    });

  } catch (err) {
    console.error("❌ Error finishing PUG:", err);
    await interaction.editReply({
      content: "❌ Failed to finish PUG due to an internal error.",
    });
  }
}