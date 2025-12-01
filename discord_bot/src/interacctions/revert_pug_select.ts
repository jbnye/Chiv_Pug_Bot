import { EmbedBuilder, StringSelectMenuInteraction } from "discord.js";
import { redisClient } from "../redis";
import pool from "../database/db";


function canSendMessages(
  channel: any
): channel is { send: (options: any) => Promise<any> } {
  return !!channel && typeof channel.send === "function";
}

export async function handleRevertPugSelect(interaction: StringSelectMenuInteraction) {
  const { token, match_id } = JSON.parse(interaction.values[0]);
  const numericPugId = match_id;
  try {
    const dbClient = await pool.connect();

    const redisKey = `finished_pugs:${token}`;
    const rawPug = await redisClient.get(redisKey);

    if (!rawPug) {
      return interaction.update({
        content: "Could not find that finished PUG in Redis.",
        components: []
      });
    }

    const pug = JSON.parse(rawPug);

    const winnerTeam = pug.winner;
    const playerSnapshots = pug.playerSnapshots;

    await dbClient.query(
      `INSERT INTO commands (discord_id, discord_username, pug_token, action)
       VALUES ($1, $2, $3, 'reverted')`,
      [interaction.user.id, interaction.user.username, token]
    );

    // const res = await dbClient.query(`SELECT pug_id FROM pugs WHERE token = $1`, [token]);
    // if (!res.rows.length) {
    //   return interaction.update({
    //     content: "PUG not found in SQL.",
    //     components: []
    //   });
    // }

    // const numericPugId = res.rows[0].pug_id;

    const getPlayerTeam = (id: string) => {
      if (pug.team1.some((p: any) => p.id === id)) return 1;
      if (pug.team2.some((p: any) => p.id === id)) return 2;
      return null;
    };

    // revert stats
    for (const snap of playerSnapshots) {
      const playerId = snap.id;
      const team = getPlayerTeam(playerId);
      if (!team) continue;

      const isWinner = team === winnerTeam;
      const isCaptain =
        pug.captain1.id === playerId ||
        pug.captain2.id === playerId;

      await dbClient.query(
        `UPDATE players
         SET 
           mu = $1,
           sigma = $2,
           wins = wins - $3,
           losses = losses - $4,
           captain_wins = captain_wins - $5,
           captain_losses = captain_losses - $6
         WHERE discord_id = $7`,
        [
          snap.current.mu,
          snap.current.sigma,
          isWinner ? 1 : 0,
          !isWinner ? 1 : 0,
          isCaptain && isWinner ? 1 : 0,
          isCaptain && !isWinner ? 1 : 0,
          playerId
        ]
      );
    }


    await dbClient.query(`DELETE FROM mmr_history WHERE pug_token = $1`, [token]);
    await dbClient.query(`UPDATE pugs SET reverted = TRUE WHERE token = $1`, [token]);

    await redisClient.del(redisKey);
    await redisClient.zRem("finished_pugs:by_match", token);

    await interaction.update({
      content: `Reverting PUG #${numericPugId}...`,
      components: []
    });

    // build repost embed
    const embed = new EmbedBuilder()
      .setTitle(`Match #${numericPugId} Reverted`)
      .setDescription(`Reverted by ${interaction.user.username}`)
      .setColor(0x64026d)
      .setTimestamp();

    const channel = interaction.channel;

    if (canSendMessages(channel)) {
      await channel.send({ embeds: [embed] });
    } else {
      await interaction.followUp({ embeds: [embed] });
    }

  } catch (err) {
    console.error("Error reverting PUG:", err);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "Unexpected error reverting PUG.",
      });
    }
  }
}