import { ButtonInteraction, EmbedBuilder } from "discord.js";
import { redisClient } from "../redis";
import { create_pug_backend } from "../utils/create_pug_backend";
import { getPlayerMMRsWithStakes } from "../utils/calculate_mmr_stakes";
import pool from "../database/db";

interface predictions {
  username: string;
  current: { mu: number, sigma: number, shown: number };
  win:     { mu: number, sigma: number, shown: number, deltaShown: number };
  loss:    { mu: number, sigma: number, shown: number, deltaShown: number };
}


// Ensure players exist utility
async function ensurePlayersExist(players: { id: string; username: string }[]) {
  const client = await pool.connect();
  try {
    for (const p of players) {
      await client.query(
        `INSERT INTO players (discord_id, discord_username)
         VALUES ($1, $2)
         ON CONFLICT (discord_id) DO NOTHING`,
        [p.id, p.username]
      );
    }
  } finally {
    client.release();
  }
}

export async function handleConfirmCaptains(interaction: ButtonInteraction) {
  try {
    if (!interaction.deferred && !interaction.replied) await interaction.deferReply();

    const parts = interaction.customId.split(":");
    const tempPugId = parts[1];
    const tempKey = `temp_pug:${tempPugId}`;
    const tempRaw = await redisClient.get(tempKey);
    if (!tempRaw) return interaction.followUp({ content: "⚠️ Could not find PUG in Redis.", ephemeral: true });

    const tempPug = JSON.parse(tempRaw);
    if (!tempPug.captains.team1 || !tempPug.captains.team2)
      return interaction.followUp({ content: "⚠️ Both captains must be selected.", ephemeral: true });

    const team1 = [...tempPug.team1];
    const team2 = [...tempPug.team2];

    const t1Index = team1.findIndex((p: any) => p.id === tempPug.captains.team1);
    const t2Index = team2.findIndex((p: any) => p.id === tempPug.captains.team2);
    if (t1Index > 0) [team1[0], team1[t1Index]] = [team1[t1Index], team1[0]];
    if (t2Index > 0) [team2[0], team2[t2Index]] = [team2[t2Index], team2[0]];

    const allPlayers = [...team1, ...team2];
    await ensurePlayersExist(allPlayers.map((p: any) => ({ id: p.id, username: p.username })));

  const stakes = await getPlayerMMRsWithStakes(
      allPlayers.map((p) => ({ id: p.id, username: p.username })),
      team1.map((p) => p.id),
      team2.map((p) => p.id)
    );

    const playerSnapshots = stakes.map((s) => {
      const currentShown = Math.floor(s.currentMMR);

      const winShown = Math.floor(s.winRating.mu - 3 * s.winRating.sigma);
      const lossShown = Math.floor(s.loseRating.mu - 3 * s.loseRating.sigma);

      return {
        id: s.id,
        username: s.username,

        current: {
          mu: s.mu,
          sigma: s.sigma,
          shown: currentShown
        },

        win: {
          mu: s.winRating.mu,
          sigma: s.winRating.sigma,
          shown: winShown,
          delta: winShown - currentShown
        },

        loss: {
          mu: s.loseRating.mu,
          sigma: s.loseRating.sigma,
          shown: lossShown,
          delta: lossShown - currentShown
        }
      };
    });
    
    const pugDate = new Date();
    const { success, error, matchNumber } = await create_pug_backend({
      data: { pug_id: tempPugId, date: pugDate, team1, team2, user_requested: tempPug.user_requested, playerSnapshots },
    });
    if (!success) return interaction.followUp({ content: `❌ Failed to create PUG: ${error || "unknown error"}`, ephemeral: true });

    
    
    const formatDelta = (val: number) => (val >= 0 ? `+${val}` : `${val}`);

    const avgTeamMMR = (team: any[]) => {
      const teamStakes = team.map((p) => stakes.find((s: any) => s.id === p.id)).filter(Boolean);
      if (!teamStakes.length) return 0;
      return Math.round(teamStakes.reduce((acc, s) => acc + s!.currentMMR, 0) / teamStakes.length);
    };

    const buildTeamText = (team: any[], stakes: any[], team1Ids: string[], team2Ids: string[]) =>
      team
        .map((p) => {
          const s = stakes.find((x: any) => x.id === p.id);
          if (!s) return `• <@${p.id}> — *MMR unknown*`;

          const currentShown = s.currentMMR;

          // Compute delta for win and loss previews
          const isTeam1 = team1Ids.includes(p.id);

          const afterWin = isTeam1
            ? s.winRating  // make sure winRating was stored in getPlayerMMRsWithStakes
            : s.winRating;

          const afterLoss = isTeam1
            ? s.loseRating // likewise, from getPlayerMMRsWithStakes
            : s.loseRating;

          const winShown = Math.floor(afterWin.mu - 3 * afterWin.sigma);
          const lossShown = Math.floor(afterLoss.mu - 3 * afterLoss.sigma);

          // Potential delta relative to currentShown
          const potentialWin = winShown - currentShown;
          const potentialLoss = lossShown - currentShown;

          // Format signs for Discord
          const format = (val: number) => (val > 0 ? `+${val}` : val.toString());

          // console.log(`PLAYER ${p.username} (${p.id})`);
          // console.log(`  Current shown: ${currentShown}`);
          // console.log(`  After Win shown: ${winShown} → delta: ${potentialWin}`);
          // console.log(`  After Loss shown: ${lossShown} → delta: ${potentialLoss}`);
          // console.log(`  TrueSkill Win: mu=${afterWin.mu.toFixed(6)}, sigma=${afterWin.sigma.toFixed(6)}`);
          // console.log(`  TrueSkill Loss: mu=${afterLoss.mu.toFixed(6)}, sigma=${afterLoss.sigma.toFixed(6)}`);

          return `• <@${p.id}> — *${currentShown}* (Win: ${format(potentialWin)} / Loss: ${format(potentialLoss)})`;
        })
        .join("\n");
    const timestampSeconds = Math.floor(Date.now() / 1000);
    const embed = new EmbedBuilder()
      .setTitle(`PUG Created — Match #${matchNumber}!`)
      .setColor(0x00ae86)
      .addFields(
        {
          name: `${team1[0].username}'s Team — ${avgTeamMMR(team1)}`,
          value: buildTeamText(team1, stakes, team1.map(p => p.id), team2.map(p => p.id)) || "_No players_"
        },
        {
          name: `${team2[0].username}'s Team — ${avgTeamMMR(team2)}`,
          value: buildTeamText(team2, stakes, team1.map(p => p.id), team2.map(p => p.id)) || "_No players_"
        }
      )
      .setFooter({ text: `Pug Created: <t:${timestampSeconds}:F>` });

    await interaction.followUp({ embeds: [embed], components: [] });

    await redisClient.del(tempKey);
  } catch (err) {
    console.error("⚠️ handleConfirmCaptains error:", err);
    if (!interaction.replied)
      await interaction.followUp({ content: "⚠️ Something went wrong confirming captains.", ephemeral: true });
  }
}
