import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
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
        ROUND(mu::double precision, 2) AS mmr
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


    const rankQuery = `
      SELECT discord_id,
            RANK() OVER (ORDER BY mu DESC) AS rank,
            COUNT(*) OVER() AS total_players
      FROM players;
    `;

    const { rows: rankRows } = await pool.query(rankQuery);

    const playerRankRow = rankRows.find((r) => r.discord_id === user.id);
    const rankPosition = playerRankRow ? Number(playerRankRow.rank) : null;

    let medal = "";
    if (rankPosition === 1) medal = "🥇";
    else if (rankPosition === 2) medal = "🥈";
    else if (rankPosition === 3) medal = "🥉";

    const rankText = playerRankRow
      ? `#${rankPosition} out of ${playerRankRow.total_players}`
      : "_Unranked_";


    const matchesQuery = `
      SELECT 
          mh.pug_token,
          mh.mu_before,
          mh.mu_after,
          mh.team_number,
          mh.won,
          p.pug_id,
          p.created_at,
          p.captain1_id,
          p.captain2_id,
          pl1.discord_username AS captain1_username,
          pl2.discord_username AS captain2_username
      FROM mmr_history mh
      JOIN pugs p
          ON mh.pug_token = p.token
      LEFT JOIN players pl1
          ON p.captain1_id = pl1.discord_id
      LEFT JOIN players pl2
          ON p.captain2_id = pl2.discord_id
      WHERE mh.discord_id = $1
      ORDER BY p.created_at DESC
      LIMIT 3;
    `;

    const { rows: matchRows } = await pool.query(matchesQuery, [user.id]);

    const recentMatches =
      matchRows.length > 0
        ? matchRows
            .map((m) => {
              const before = m.mu_before;
              const after = m.mu_after;
              const delta = after - before;

              const deltaText =
                delta >= 0
                  ? `+${delta.toFixed(2)}`
                  : `-${Math.abs(delta).toFixed(2)}`;

              const result = m.won ? "W" : "L";

              return `${result}: Match #${m.pug_id}: ${m.captain1_username} vs ${m.captain2_username} (${deltaText})`;
            })
            .join("\n")
        : "_No recent matches found._";


    const embed = new EmbedBuilder()
      .setTitle(`${medal} **${p.discord_username || user.username}**`)
      .setColor(0x64026d)
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      // .setDescription(`${medal} **${p.discord_username || user.username}**`)
      .addFields(
        {
          name: "Elo Overview",
          value: `**Rating (μ):** **${p.mmr.toFixed(2)}** (${rankText})\n**TrueSkill:** μ=${p.mu.toFixed(2)},
           σ=${p.sigma.toFixed(2)}`,
          inline: false,
        },
        {
          name: "Match Record",
          value: `Wins: ${p.wins} W - ${p.losses} L\nCaptain Wins: ${p.captain_wins} W - ${p.captain_losses} L`,
          inline: false,
        },
        {
          name: "Recent Matches",
          value: recentMatches,
          inline: false,
        }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};