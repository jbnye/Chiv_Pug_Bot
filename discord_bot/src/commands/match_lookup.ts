import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import pool from "../database/db";

export default {
  data: new SlashCommandBuilder()
    .setName("match_lookup")
    .setDescription("Look up the results of a completed match.")
    .addIntegerOption((option) =>
      option
        .setName("match")
        .setDescription("Match number (PUG ID)")
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    const matchId = interaction.options.getInteger("match", true);

    // 🔍 Fetch match info
    const pugQuery = `
      SELECT 
        pug_id,
        captain1_id,
        captain2_id,
        winner_team,
        created_at
      FROM pugs
      WHERE pug_id = $1;
    `;
    const { rows: pugRows } = await pool.query(pugQuery, [matchId]);

    if (pugRows.length === 0) {
      await interaction.editReply({
        content: `❌ No match found with ID **${matchId}**.`,
      });
      return;
    }

    const pug = pugRows[0];

    // 🧍 Fetch all players in that match
    const playersQuery = `
      SELECT 
        pp.player_id,
        pp.team_number,
        pp.is_captain,
        pp.trueskill_before,
        pp.trueskill_after,
        pp.confidence_before,
        pp.confidence_after,
        pp.mmr_change,
        pl.discord_username,
        pl.discord_id
      FROM pug_players pp
      JOIN players pl ON pl.id = pp.player_id
      WHERE pp.pug_id = $1
      ORDER BY pp.team_number;
    `;
    const { rows: playerRows } = await pool.query(playersQuery, [matchId]);

    if (playerRows.length === 0) {
      await interaction.editReply({
        content: `❌ Match **#${matchId}** exists, but has no recorded players.`,
      });
      return;
    }

    // 🧩 Split players by team
    const team1 = playerRows.filter((p) => p.team_number === 1);
    const team2 = playerRows.filter((p) => p.team_number === 2);

    // 🏆 Winner formatting
    const winnerText =
      pug.winner_team === 1
        ? `**${team1.find((p) => p.is_captain)?.discord_username}'s Team Wins!**`
        : `**${team2.find((p) => p.is_captain)?.discord_username}'s Team Wins!**`;

    // 📝 Conservative MMR calculation (floor to nearest whole number)
    const conservativeMMR = (mu: number, sigma: number) =>
      Math.max(Math.floor(mu - 3 * sigma), 0);

    const formatPlayer = (p: any) => {
      const oldMMR = conservativeMMR(p.trueskill_before, p.confidence_before);
      const newMMR = conservativeMMR(p.trueskill_after, p.confidence_after);
      const delta = newMMR - oldMMR;
      const deltaText = p.won ? (delta >= 0 ? `+${delta}` : `${delta}`) : delta <= 0 ? `${delta}` : `-${delta}`;

      return `• **${p.discord_username}** — ${oldMMR} → ${newMMR} (${deltaText})`;
    };

    // Team names by captain
    const team1Name =
      team1.find((p) => p.is_captain)?.discord_username || "Team 1";
    const team2Name =
      team2.find((p) => p.is_captain)?.discord_username || "Team 2";

    const team1Text = team1.map(formatPlayer).join("\n");
    const team2Text = team2.map(formatPlayer).join("\n");


    const matchTime = new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        hour12: true,
        timeZone: "America/New_York",
    }).format(new Date(pug.created_at));

    // 🎨 Build embed
    const embed = new EmbedBuilder()
      .setTitle(`Match #${matchId}`)
      .setDescription(winnerText)
      .setColor(pug.winner_team === 1 ? 0x3498db : 0x2ecc71)
        .addFields(
        {
            name: `${team1Name}'s Team`,
            value: team1Text || "_No players?_",
            inline: true,
        },
        {
            name: `${team2Name}'s Team`,
            value: team2Text || "_No players?_",
            inline: true,
        }
        )
      
      .setFooter({
        text: `Match ID: ${matchId} • Played: ${matchTime}`,
      })
      .setTimestamp(new Date(pug.created_at));

    await interaction.editReply({ embeds: [embed] });
  },
};