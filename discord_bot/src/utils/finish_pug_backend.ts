import pool from "../database/db";
import { redisClient } from "../redis";
import type { finish_pug_backend_props_type } from "../types/finish_pug_data";

interface FinishPugBackendProps {
  data: finish_pug_backend_props_type;
}

export const finish_pug_backend = async ({ data }: FinishPugBackendProps) => {
  const db = await pool.connect();

  try {
    const pugKey = `pug:${data.pug_id}`;
    const finishedKey = `finished_pugs:${data.pug_id}`;

    // 1️⃣ Get PUG from Redis
    const rawPug = await redisClient.get(pugKey);
    if (!rawPug) return { success: false, error: "PUG not found in Redis" };

    const pug = JSON.parse(rawPug);
    const winnerTeam = data.winner;

    // 2️⃣ Put finished version into Redis
    const finishedPugData = {
      ...pug,
      winner: winnerTeam,
      finished_at: data.date,
      user_finished: {
        ...data.user_requested,
        discriminator: data.user_requested.discriminator ?? "",
        globalName: data.user_requested.globalName ?? null,
      },
    };

    await redisClient.zAdd("finished_pugs:by_match", {
      score: pug.match_id,
      value: data.pug_id,
    });

    await redisClient.set(finishedKey, JSON.stringify(finishedPugData), {
      EX: 86400,
    });

    await redisClient.del(pugKey);

    await db.query(
      `
      INSERT INTO commands (discord_id, discord_username, pug_token, action)
      VALUES ($1, $2, $3, $4)
      `,
      [data.user_requested.id, data.user_requested.username, data.pug_id, "finished"]
    );

    // ⭐ Update PUG row in Postgres
    await db.query(
      `
      UPDATE pugs
      SET winner_team = $1,
          verified_by = $2,
          verified_at = NOW()
      WHERE token = $3
      `,
      [winnerTeam, data.user_requested.id, data.pug_id]
    );

    // 5️⃣ Update normal wins/losses
    const winningTeamPlayers = winnerTeam === 1 ? pug.team1 : pug.team2;
    const losingTeamPlayers = winnerTeam === 1 ? pug.team2 : pug.team1;

    for (const player of winningTeamPlayers) {
      await db.query(
        `
        INSERT INTO players (discord_id, wins, losses, last_match_played)
        VALUES ($1, 1, 0, NOW())
        ON CONFLICT (discord_id)
        DO UPDATE SET 
          wins = players.wins + 1,
          last_match_played = NOW()
        `,
        [player.id]
      );
    }

    for (const player of losingTeamPlayers) {
      await db.query(
        `
        INSERT INTO players (discord_id, wins, losses, last_match_played)
        VALUES ($1, 0, 1, NOW())
        ON CONFLICT (discord_id)
        DO UPDATE SET 
          losses = players.losses + 1,
          last_match_played = NOW()
        `,
        [player.id]
      );
    }

    // ⭐ Captain stats
    const captain1Id = pug.captain1.id;
    const captain2Id = pug.captain2.id;
    const winningCaptain = winnerTeam === 1 ? captain1Id : captain2Id;
    const losingCaptain = winnerTeam === 1 ? captain2Id : captain1Id;

    await db.query("BEGIN");

    await db.query(
      `
      INSERT INTO players (discord_id, captain_wins, captain_losses, last_match_played)
      VALUES ($1, 1, 0, NOW())
      ON CONFLICT (discord_id)
      DO UPDATE SET 
        captain_wins = players.captain_wins + 1,
        last_match_played = NOW()
      `,
      [winningCaptain]
    );

    await db.query(
      `
      INSERT INTO players (discord_id, captain_wins, captain_losses, last_match_played)
      VALUES ($1, 0, 1, NOW())
      ON CONFLICT (discord_id)
      DO UPDATE SET 
        captain_losses = players.captain_losses + 1,
        last_match_played = NOW()
      `,
      [losingCaptain]
    );

    // ⭐ MMR History Generation
    const playerSnapshots = pug.playerSnapshots;
    const pugToken = data.pug_id;

    const team1Ids = new Set(pug.team1.map((p:any) => p.id));
    const team2Ids = new Set(pug.team2.map((p:any) => p.id));

    for (const snap of playerSnapshots) {
      const teamNumber = team1Ids.has(snap.id) ? 1 : 2;
      const didWin = teamNumber === winnerTeam;

      const beforeMu = snap.current.mu;
      const beforeSigma = snap.current.sigma;

      const afterMu = didWin ? snap.win.mu : snap.loss.mu;
      const afterSigma = didWin ? snap.win.sigma : snap.loss.sigma;

      const mmrChange = afterMu - beforeMu;

      await db.query(
        `
        INSERT INTO mmr_history (
          discord_id,
          timestamp,
          mu_before,
          mu_after,
          sigma_before,
          sigma_after,
          pug_token,
          team_number,
          won,
          mmr_change
        )
        VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7, $8, $9)
        `,
        [
          snap.id,
          beforeMu,
          afterMu,
          beforeSigma,
          afterSigma,
          pugToken,
          teamNumber,
          didWin,
          mmrChange,
        ]
      );
      await db.query(
        `
        UPDATE players
        SET 
          mu = $1,
          sigma = $2,
          last_match_played = NOW()
        WHERE discord_id = $3
        `,
        [afterMu, afterSigma, snap.id]
      );
    }

    await db.query("COMMIT");

    // Summary message
    const getTeamNames = (teamArr: any[]) =>
      teamArr.map((p) => `• <@${p.id}>`).join("\n") || "_No players found_";

    const summaryMessage = `✅ **PUG Finished!**
      🏆 **Winner:** Team ${winnerTeam}

      **Team 1**
      ${getTeamNames(pug.team1)}

      **Team 2**
      ${getTeamNames(pug.team2)}
      `;

    return { success: true, summaryMessage };

  } catch (error) {
    console.error("Error in finish_pug_backend:", error);
    await db.query("ROLLBACK");
    return { success: false, error };
  } finally {
    db.release();
  }
};