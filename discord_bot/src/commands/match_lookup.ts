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
        .setDescription("Match number #")
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    const matchId = interaction.options.getInteger("match", true);

    console.log("========== /match_lookup START ==========");
    console.log("Match ID requested:", matchId);

    const pugQuery = `
      SELECT 
      pug_id,
      token,
      winner_team,
      created_at,
      captain1_id,
      captain2_id
      FROM pugs
      WHERE pug_id = $1;
    `;

    const { rows: pugRows } = await pool.query(pugQuery, [matchId]);

    console.log("PUG rows returned:", pugRows);

    if (pugRows.length === 0) {
      console.log("No PUG found for ID:", matchId);
      return interaction.editReply(`No match found with ID **${matchId}**.`);
    }

    const pug = pugRows[0];
    console.log("PUG Loaded:", pug);


    console.log("Looking up mmr_history rows using pug token:", pug.token);

    const mmrQuery = `
      SELECT 
      discord_id,
      mu_before,
      mu_after,
      sigma_before,
      sigma_after,
      team_number,
      won,
      mmr_change,
      pug_token
      FROM mmr_history
      WHERE pug_token = $1;
    `;

    const { rows: mmrRows } = await pool.query(mmrQuery, [pug.token]);

    console.log("MMR history rows returned:", mmrRows);

    if (mmrRows.length === 0) {
      console.log("No mmr_history found for pug token:", pug.token);
      return interaction.editReply(
        `Match **#${matchId}** exists, but has no mmr_history records.`
      );
    }

    const playerIds = mmrRows.map((r) => r.discord_id);
    console.log("Player IDs found in mmr_history:", playerIds);

    const usernameQuery = `
      SELECT discord_id, discord_username
      FROM players
      WHERE discord_id = ANY($1)
    `;
    const { rows: usernameRows } = await pool.query(usernameQuery, [playerIds]);

    console.log("Username rows returned:", usernameRows);

    const usernameMap = new Map(
      usernameRows.map((r) => [r.discord_id, r.discord_username])
    );

    console.log("Username map built:", usernameMap);


    const conservative = (mu:any, sigma:any) =>
      parseFloat(Math.max(mu - 3 * sigma, 0).toFixed(2));


    const team1 = mmrRows.filter((p) => p.team_number === 1);
    const team2 = mmrRows.filter((p) => p.team_number === 2);

    console.log("Team 1 players:", team1);
    console.log("Team 2 players:", team2);

    const team1Captain = team1.find((p) => p.discord_id === pug.captain1_id);
    const team2Captain = team2.find((p) => p.discord_id === pug.captain2_id);

    console.log("Detected Team 1 Captain:", team1Captain);
    console.log("Detected Team 2 Captain:", team2Captain);

    const captain1Name =
      usernameMap.get(team1Captain?.discord_id || "") || "Team 1";
    const captain2Name =
      usernameMap.get(team2Captain?.discord_id || "") || "Team 2";

    const formatPlayer = (p: any, winnerTeam: 1 | 2) => {
      const name = usernameMap.get(p.discord_id) || `Unknown (${p.discord_id})`;

      const oldMMR = conservative(p.mu_before, p.sigma_before);
      const newMMR = conservative(p.mu_after, p.sigma_after);
      const delta = newMMR - oldMMR;

      let deltaText: string;
      if ((p.team_number === winnerTeam && delta > 0) || (p.team_number === winnerTeam && delta === 0)) {
        // WIN → always +delta (never zero in your system, but just in case)
        deltaText = `+${delta.toFixed(2)}`;
      } else {
        // LOSS → always -delta, show -0 if clamped
        deltaText = `-${Math.abs(delta).toFixed(2)}`;
      }

      return `**${name}** - ${oldMMR} → ${newMMR} (${deltaText})`;
    };

    const team1List  = team1.map(p => formatPlayer(p, winnerTeam)).join("\n");
    const team2List  = team2.map(p => formatPlayer(p, winnerTeam)).join("\n");


    const winnerTeam = pug.winner_team;
    const winningCaptain =
      winnerTeam === 1 ? captain1Name : captain2Name;

    console.log("Winner team:", winnerTeam);

    const winnerText = `**${winningCaptain}'s Team Won**`;

    const matchTime = new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      hour12: true,
      timeZone: "America/New_York",
    }).format(new Date(pug.created_at));


    const embed = new EmbedBuilder()
      .setTitle(`Match #${matchId}`)
      .setDescription(winnerText)
      .setColor(0x64026d)
      .addFields(
        {
          name: `${captain1Name}'s Team`,
          value: team1List || "_No players?_",
        },
        {
          name: `${captain2Name}'s Team`,
          value: team2List || "_No players?_",
        }
      )
      .setFooter({
        text: `Played: ${matchTime}`,
      })

    console.log("========== /match_lookup END ==========");

    await interaction.editReply({ embeds: [embed] });
  },
};