import { ButtonInteraction, EmbedBuilder } from "discord.js";
import { redisClient } from "../redis";
import { create_pug_backend } from "../utils/create_pug_backend";
import { getPlayerMMRsWithStakes } from "../utils/calculate_mmr_stakes";
import pool from "../database/db";

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
    // if (!interaction.deferred && !interaction.replied) {
    //   await interaction.deferReply();
    // }

    await interaction.update({
      content: "Creating PUG...",
      components: []
    });
    const [, tempPugId] = interaction.customId.split(":");
    const tempKey = `temp_pug:${tempPugId}`;
    const raw = await redisClient.get(tempKey);

    if (!raw) {
      return interaction.followUp({ content: "Could not find PUG in Redis.", flags: 64 });
    }

    const tempPug = JSON.parse(raw);

    if (!tempPug.captains.team1 || !tempPug.captains.team2) {
      return interaction.followUp({ content: "Both captains must be selected.", flags: 64 });
    }

    let team1 = [...tempPug.team1];
    let team2 = [...tempPug.team2];

    // Move captains to index 0
    const cap1 = team1.findIndex(p => p.id === tempPug.captains.team1);
    const cap2 = team2.findIndex(p => p.id === tempPug.captains.team2);

    if (cap1 > 0) [team1[0], team1[cap1]] = [team1[cap1], team1[0]];
    if (cap2 > 0) [team2[0], team2[cap2]] = [team2[cap2], team2[0]];

    const allPlayers = [...team1, ...team2];

    await ensurePlayersExist(allPlayers);

    const playerSnapshots = await getPlayerMMRsWithStakes(
      allPlayers.map(p => ({ id: p.id, username: p.username })),
      team1.map(p => p.id),
      team2.map(p => p.id)
    );

    const findStake = (id: string) =>
      playerSnapshots.find(p => p.id === id);

    const avgTeamMMR = (team: any[]): number => {
      // const values: number[] = team
      //   .map(p => findStake(p.id)?.current.shown)
      //   .filter((n): n is number => typeof n === "number");
      const values: number[] = team
        .map(p => findStake(p.id)?.current.mu)
        .filter((n): n is number => typeof n === "number");

      if (values.length === 0) return 0;

      const sum = values.reduce((a, b) => a + b, 0);
      return parseFloat((sum / values.length).toFixed(2));
    };

    const buildTeamText = (team: any[]) =>
      team
        .map(p => {
          const s = findStake(p.id);
          if (!s) return `<@${p.id}> - *MMR unknown*`;

          const clampDelta = (current: number, delta: number) => {
            if (current + delta < 0) return -current;
            return delta;
          };

          // const winDelta  = clampDelta(s.current.shown, s.win.delta);
          // const lossDelta = clampDelta(s.current.shown, s.loss.delta);
          
          const winDelta = s.win.mu - s.current.mu;
          const lossDelta = s.loss.mu - s.current.mu;

          const formatWin  = (n: number) => `+${n.toFixed(2)}`;
          const formatLoss = (n: number) => `-${Math.abs(n).toFixed(2)}`;

          // return `<@${p.id}> - **${s.current.shown.toFixed(2)}** (Win: ${formatWin(winDelta)} / Loss: ${formatLoss(lossDelta)})`;
          return `<@${p.id}> - **${s.current.mu.toFixed(2)}** (Win: ${formatWin(winDelta)} / Loss: ${formatLoss(lossDelta)})`;
        })
        .join("\n");

    const pugDate = new Date();
    const { success, error, matchNumber } = await create_pug_backend({
      data: {
        pug_id: tempPugId,
        date: pugDate,
        team1,
        team2,
        user_requested: tempPug.user_requested,
        playerSnapshots
      }
    });

    if (!success) {
      return interaction.followUp({
        content: `Failed to create PUG: ${error ?? "unknown error"}`,
        flags: 64 
      });
    }
    const embed = new EmbedBuilder()
      .setTitle(`Match #${matchNumber} Created`)
      .setColor(0x64026d)
      .addFields(
        {
          name: `${team1[0].username}'s Team - ${avgTeamMMR(team1)}`,
          value: buildTeamText(team1)
        },
        {
          name: `${team2[0].username}'s Team - ${avgTeamMMR(team2)}`,
          value: buildTeamText(team2)
        }
      )
      .setFooter({text: `Created by: ${interaction.user.username}`})
      .setTimestamp();

    await interaction.followUp({ embeds: [embed], components: [] });
    await redisClient.del(tempKey);

  } catch (err) {
    console.error("handleConfirmCaptains error:", err);
    if (!interaction.replied) {
      await interaction.followUp({
        content: "Something went wrong confirming captains.",
        flags: 64 
      });
    }
  }
}