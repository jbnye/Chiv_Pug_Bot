import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  User,
} from "discord.js";
import pool from "../database/db";

export default {
  data: new SlashCommandBuilder()
    .setName("player_lookup")
    .setDescription("Look up detailed stats for a player.")
    .addUserOption((option) =>
      option
        .setName("player")
        .setDescription("Select the player to look up.")
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    const user = interaction.options.getUser("player", true);

    // 🧮 Fetch player data
    const playerQuery = `
      SELECT 
        discord_id,
        discord_username,
        mu,
        sigma,
        wins,
        losses,
        captain_wins,
        captain_losses,
        ROUND(GREATEST((mu - 3 * sigma), 0)::numeric, 1) AS conservative_mmr
      FROM players
      WHERE discord_id = $1;
    `;
    const { rows: playerRows } = await pool.query(playerQuery, [user.id]);

    if (playerRows.length === 0) {
      await interaction.editReply({
        content: `No data found for ${user.username}.`,
      });
      return;
    }

    const p = playerRows[0];
    const confidence = ((1 - (p.sigma / p.mu)) * 100).toFixed(1);

    // 🕒 Fetch last 3 matches
    const matchesQuery = `
        SELECT 
            p.pug_id,
            p.created_at,
            p.captain1_id,
            p.captain2_id,
            pp.team_number AS team,
            pp.mmr_change
        FROM pug_players pp
        JOIN pugs p ON pp.pug_id = p.pug_id
        JOIN players pl ON pp.player_id = pl.id
        WHERE pl.discord_id = $1
        ORDER BY p.created_at DESC
        LIMIT 3;
        `;
    const { rows: matchRows } = await pool.query(matchesQuery, [user.id]);
    // 🧱 Build match history section
    const recentMatches =
    matchRows.length > 0
        ? matchRows
            .map(
            (m) =>
                `• Match #${m.pug_id} — Team ${m.team} — ${m.mmr_change >= 0 ? "+" : ""}${m.mmr_change} MMR`
            )
            .join("\n")
        : "_No recent matches found._";

    // 🎨 Build the embed
    const embed = new EmbedBuilder()
      .setAuthor({
        name: p.discord_username || user.username,
        iconURL: user.displayAvatarURL(),
      })
      .setTitle("Player Profile")
      .setColor(0x00ae86)
      .addFields(
        {
          name: "MMR Overview",
          value: `**Rating:** ${p.conservative_mmr}\n**TrueSkill:** μ=${p.mu.toFixed(
            2
          )}, σ=${p.sigma.toFixed(2)}\n**Confidence:** ${confidence}%`,
          inline: false,
        },
        {
          name: "Match Record",
          value: `Wins: ${p.wins} - ${p.losses}\nCaptain Wins: ${p.captain_wins} - ${p.captain_losses}`,
          inline: false,
        },
        {
          name: "Recent Matches",
          value: recentMatches,
          inline: false,
        }
      )
      .setFooter({
        text: `Player ID: ${p.discord_id}`,
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};