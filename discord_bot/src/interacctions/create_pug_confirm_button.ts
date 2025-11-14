import { ButtonInteraction, EmbedBuilder } from "discord.js";
import { redisClient } from "../redis";
import { create_pug_backend } from "../utils/create_pug_backend";
import { v4 as uuidv4 } from "uuid";
import { getPlayerMMRsWithStakes } from "../utils/calculate_mmr_stakes";
import pool from "../database/db";

// Utility: ensure players exist in DB
async function ensurePlayersExist(players: { id: string; username: string }[]) {
  const client = await pool.connect();
  try {
    for (const p of players) {
      await client.query(
        `INSERT INTO players (id, discord_username) VALUES ($1, $2)
         ON CONFLICT (id) DO NOTHING`,
        [p.id, p.username]
      );
    }
  } finally {
    client.release();
  }
}

export async function handleConfirmCaptains(interaction: ButtonInteraction) {
  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
    }

    const parts = interaction.customId.split(":"); // ["pug", "<uuid>", "confirm_captains"]
    const tempPugId = parts[1];
    const tempKey = `temp_pug:${tempPugId}`;
    const tempRaw = await redisClient.get(tempKey);

    if (!tempRaw) {
      return interaction.followUp({
        content: "⚠️ Could not find PUG in Redis.",
        ephemeral: true,
      });
    }

    const tempPug = JSON.parse(tempRaw);
    if (!tempPug.captains.team1 || !tempPug.captains.team2) {
      return interaction.followUp({
        content: "⚠️ Both captains must be selected.",
        ephemeral: true,
      });
    }

    // Assign captains to first element
    const team1 = [...tempPug.team1];
    const team2 = [...tempPug.team2];

    const t1Index = team1.findIndex((p: any) => p.id === tempPug.captains.team1);
    const t2Index = team2.findIndex((p: any) => p.id === tempPug.captains.team2);

    if (t1Index > 0) [team1[0], team1[t1Index]] = [team1[t1Index], team1[0]];
    if (t2Index > 0) [team2[0], team2[t2Index]] = [team2[t2Index], team2[0]];

    // 0️⃣ Ensure captains exist in DB
    const allPlayers = [...team1, ...team2];
    await ensurePlayersExist(
      allPlayers.map((p: any) => ({ id: p.id, username: p.username }))
    );

    // 1️⃣ Save PUG to backend
    const pugToken = tempPugId; // <- use the existing UUID
    const pugDate = new Date();
    const { success, error, matchNumber } = await create_pug_backend({
      data: {
        pug_id: pugToken,
        date: pugDate,
        team1,
        team2,
        user_requested: tempPug.user_requested,
      },
    });

    if (!success) {
      return interaction.followUp({
        content: `❌ Failed to create PUG: ${error || "unknown error"}`,
        ephemeral: true,
      });
    }

    // 2️⃣ Calculate TrueSkill
    const stakes = await getPlayerMMRsWithStakes(
      allPlayers.map((p) => ({ id: p.id, username: p.username })),
      team1.map((p) => p.id),
      team2.map((p) => p.id)
    );

    const avgConservativeMMR = (team: any[]) => {
      const teamStakes = team.map((p) => stakes.find((s) => s.id === p.id)).filter(Boolean);
      if (!teamStakes.length) return 0;
      return (
        teamStakes.reduce((sum, s) => sum + (s!.mu - 3 * s!.sigma), 0) /
        teamStakes.length
      ).toFixed(1);
    };

    const team1Avg = avgConservativeMMR(team1);
    const team2Avg = avgConservativeMMR(team2);

    const buildTeamText = (team: any[]) =>
      team
        .map((p) => {
          const s = stakes.find((x) => x.id === p.id);
          if (!s) return `• <@${p.id}> — *MMR unknown*`;

          const conservativeMMR = Math.max(s.mu - 3 * s.sigma, 0).toFixed(1);
          const winSign = s.potentialWin >= 0 ? `+${s.potentialWin}` : `${s.potentialWin}`;
          const loseSign =
            s.potentialLoss > 0 ? `+${s.potentialLoss}` : s.potentialLoss === 0 ? `-0` : `${s.potentialLoss}`;

          return `• <@${p.id}> — *${conservativeMMR}* (Win: ${winSign} / Loss: ${loseSign})`;
        })
        .join("\n");

    const embed = new EmbedBuilder()
      .setTitle(`✅ PUG Created — Match #${matchNumber}!`)
      .setColor(0x00ae86)
      .addFields(
        { name: `${team1[0].username}'s Team — ${team1Avg}`, value: buildTeamText(team1)},
        { name: `${team2[0].username}'s Team — ${team2Avg}`, value: buildTeamText(team2)}
      )
      .setFooter({
        text: `Match ID: ${matchNumber} • ${pugDate.toLocaleString("en-US", {
          month: "long",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
          timeZone: "America/New_York",
        })} EST`,
      })
      .setTimestamp();

    await interaction.followUp({ embeds: [embed], components: [] });

    // Cleanup
    await redisClient.del(tempKey);
  } catch (err) {
    console.error("⚠️ handleConfirmCaptains error:", err);
    if (!interaction.replied) {
      await interaction.followUp({
        content: "⚠️ Something went wrong confirming captains.",
        ephemeral: true,
      });
    }
  }
}