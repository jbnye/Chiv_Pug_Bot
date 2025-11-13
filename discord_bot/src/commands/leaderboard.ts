import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ComponentType,
} from "discord.js";
import pool from "../database/db";

export default {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("View the player leaderboard.")
    .addStringOption((option) =>
      option
        .setName("sort")
        .setDescription("Sort leaderboard by this category")
        .setRequired(false)
        .addChoices(
          { name: "Rating", value: "mmr" },
          { name: "Wins", value: "wins" },
          { name: "Captain Wins", value: "captain_wins" }
        )
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    const sortBy = interaction.options.getString("sort") ?? "mmr";
    let page = 1;
    const limit = 10;

    const sortColumn =
      sortBy === "wins"
        ? "wins"
        : sortBy === "captain_wins"
        ? "captain_wins"
        : "(mu - 3 * sigma)";

    // 🧮 Fetch leaderboard page
    const fetchLeaderboardPage = async (page: number) => {
      const offset = (page - 1) * limit;
      const query = `
        SELECT 
          discord_username, mu, sigma, wins, losses, captain_wins, captain_losses,
          ROUND(GREATEST((mu - 3 * sigma), 0)::numeric, 1) AS conservative_mmr
        FROM players
        ORDER BY ${sortColumn} DESC
        LIMIT $1 OFFSET $2;
      `;
      const { rows } = await pool.query(query, [limit, offset]);
      return rows;
    };

    // 🎨 Build leaderboard embed
    const renderLeaderboard = (rows: any[], page: number) => {
      const desc =
        rows
          .map((row, i) => {
            const rank = (page - 1) * limit + i + 1;
            const username = row.discord_username ?? "Unknown Player";
            const wins = row.wins ?? 0;
            const losses = row.losses ?? 0;
            const capWins = row.captain_wins ?? 0;
            const capLosses = row.captain_losses ?? 0;

            if (sortBy === "mmr") {
              return `**${rank}.** ${username} — ${row.conservative_mmr} (μ=${row.mu.toFixed(
                1
              )}, σ=${row.sigma.toFixed(1)}) • ${wins}W - ${losses}L`;
            } else if (sortBy === "wins") {
              return `**${rank}.** ${username} — ${wins}W - ${losses}L`;
            } else {
              return `**${rank}.** ${username} — ${capWins}W - ${capLosses}L (Captain)`;
            }
          })
          .join("\n") || "_No players found._";

      const titleMap = {
        mmr: "Leaderboard (Rating)",
        wins: "Leaderboard (Wins)",
        captain_wins: "Leaderboard (Captain Wins)",
      };

      return new EmbedBuilder()
        .setTitle(`${titleMap[sortBy as keyof typeof titleMap]} — Page ${page}`)
        .setDescription(desc)
        .setColor(0x2f3136)
        .setFooter({ text: `Sorted by ${sortBy}` });
    };

    // 📄 Initial render
    const rows = await fetchLeaderboardPage(page);
    const embed = renderLeaderboard(rows, page);

    const prevBtn = new ButtonBuilder()
      .setCustomId("lb_prev")
      .setLabel("Prev")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 1);

    const nextBtn = new ButtonBuilder()
      .setCustomId("lb_next")
      .setLabel("Next")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(rows.length < limit);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(prevBtn, nextBtn);

    const msg = await interaction.editReply({
      embeds: [embed],
      components: [row],
    });

    // 🕒 Collector for pagination
    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60_000,
    });

    collector.on("collect", async (btnInt) => {
      if (btnInt.user.id !== interaction.user.id) {
        await btnInt.reply({
          content: "You can’t control this leaderboard.",
          ephemeral: true,
        });
        return;
      }

      if (btnInt.customId === "lb_prev" && page > 1) page--;
      else if (btnInt.customId === "lb_next") page++;

      const newRows = await fetchLeaderboardPage(page);
      if (newRows.length === 0) {
        await btnInt.reply({
          content: "No more players on this page.",
          ephemeral: true,
        });
        if (btnInt.customId === "lb_next") page--; // revert
        return;
      }

      const newEmbed = renderLeaderboard(newRows, page);
      const newRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        prevBtn.setDisabled(page === 1),
        nextBtn.setDisabled(newRows.length < limit)
      );

      await btnInt.update({ embeds: [newEmbed], components: [newRow] });
    });

    collector.on("end", async () => {
      const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        prevBtn.setDisabled(true),
        nextBtn.setDisabled(true)
      );
      await msg.edit({ components: [disabledRow] });
    });
  },
};