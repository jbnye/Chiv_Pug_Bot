import pool from "../database/db";
import { rate, Rating } from "ts-trueskill";

/**
 * Get current TrueSkill (mu/sigma) for all players,
 * and calculate potential gain/loss for each player.
 */

export async function getPlayerMMRsWithStakes(
  players: { id: string; username: string }[],
  team1: string[], // array of discord_ids
  team2: string[]  // array of discord_ids
) {
  const db = await pool.connect();

  try {
    // Map each player to their TrueSkill Rating
    const playerRatings: Record<string, Rating> = {};

    for (const player of players) {
      // Try to fetch existing TrueSkill data
      const res = await db.query(
        `SELECT mu, sigma FROM players WHERE discord_id = $1`,
        [player.id]
      );

      let mu = 25.0;
      let sigma = 8.333;

      if (res.rows.length === 0) {
        // Player not found — create default record
        await db.query(
          `INSERT INTO players (discord_id, discord_username, mu, sigma)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (discord_id) DO NOTHING`,
          [player.id, player.username, mu, sigma]
        );
      } else {
        mu = res.rows[0].mu;
        sigma = res.rows[0].sigma;
      }

      playerRatings[player.id] = new Rating(mu, sigma);
    }

    // Convert teams into Rating arrays
    const team1Ratings = team1.map((id) => playerRatings[id]);
    const team2Ratings = team2.map((id) => playerRatings[id]);

    // Simulate both outcomes (Team1 win and Team2 win)
    const [team1Win_newTeam1, team1Win_newTeam2] = rate(
      [team1Ratings, team2Ratings],
      [1, 2]
    );
    const [team2Win_newTeam1, team2Win_newTeam2] = rate(
      [team1Ratings, team2Ratings],
      [2, 1]
    );

    const results = [];
    const [team1Win_t1New, team1Win_t2New] = rate([team1Ratings, team2Ratings], [1, 2]);
    const [team2Win_t1New, team2Win_t2New] = rate([team1Ratings, team2Ratings], [2, 1]);
    // Calculate deltas for each player

  const conservative = (mu: number, sigma: number) => Math.max(mu - 3 * sigma, 0);

  for (const player of players) {
    const rating = playerRatings[player.id];
    const isTeam1 = team1.includes(player.id);

    // Current conservative MMR
    const currentMMR = Math.round(conservative(rating.mu, rating.sigma));

    // Find player's new rating for both outcomes
    const winRating = isTeam1
      ? team1Win_t1New[team1.indexOf(player.id)]
      : team2Win_t2New[team2.indexOf(player.id)];

    const loseRating = isTeam1
      ? team2Win_t1New[team1.indexOf(player.id)]
      : team1Win_t2New[team2.indexOf(player.id)];

    const winMMR = Math.round(conservative(winRating.mu, winRating.sigma));
    const loseMMR = Math.round(conservative(loseRating.mu, loseRating.sigma));

    const potentialWin = winMMR - currentMMR;
    const potentialLoss = loseMMR - currentMMR;

    results.push({
      id: player.id,
      username: player.username,
      mu: rating.mu,
      sigma: rating.sigma,
      currentMMR,
      potentialWin,
      potentialLoss,
    });
  }

    return results;
  } finally {
    db.release();
  }
}