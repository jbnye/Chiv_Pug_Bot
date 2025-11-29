import pool from "../database/db";
import { Rating } from "ts-trueskill";
import { computeNewRatings } from "./trueskill";

function reinflateSigma(r: Rating): Rating {
  const inflatedSigma = Math.min(r.sigma + 0.08, 8.333);
  return new Rating(r.mu, inflatedSigma);
}

export async function getPlayerMMRsWithStakes(
  players: { id: string; username: string }[],
  team1: string[],
  team2: string[]
) {
  const db = await pool.connect();
  try {
    const ratingMap: Record<string, Rating> = {};

    console.log("=== GET PLAYER MMRs WITH STAKES ===");

    // Load/create ratings
    for (const p of players) {
      const res = await db.query(`SELECT mu, sigma FROM players WHERE discord_id = $1`, [p.id]);
      let mu = 25.0;
      let sigma = 8.333;

      if (res.rows.length) {
        mu = res.rows[0].mu ?? mu;
        sigma = res.rows[0].sigma ?? sigma;
      } else {
        await db.query(
          `INSERT INTO players (discord_id, discord_username, mu, sigma)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (discord_id) DO NOTHING`,
          [p.id, p.username, mu, sigma]
        );
      }

      ratingMap[p.id] = new Rating(mu, sigma);
    }

    const team1Ratings = team1.map((id) => ratingMap[id]);
    const team2Ratings = team2.map((id) => ratingMap[id]);

    const [t1Win_newT1, t1Win_newT2] = computeNewRatings(team1Ratings, team2Ratings, true);
    const [t1Lose_newT1, t1Lose_newT2] = computeNewRatings(team1Ratings, team2Ratings, false);

    const shownMMRFromMuSigma = (mu: number, sigma: number) =>
      parseFloat(Math.max(mu - 3 * sigma, 0).toFixed(2));

    const results = [];

    for (const p of players) {
      const rating = ratingMap[p.id];

      const currentShown = shownMMRFromMuSigma(rating.mu, rating.sigma);

      const isTeam1 = team1.includes(p.id);

      let winBase: Rating;
      let loseBase: Rating;

      if (isTeam1) {
        winBase = t1Win_newT1[team1.indexOf(p.id)];
        loseBase = t1Lose_newT1[team1.indexOf(p.id)];
      } else {
        winBase = t1Lose_newT2[team2.indexOf(p.id)];
        loseBase = t1Win_newT2[team2.indexOf(p.id)];
      }

      // BEFORE inflation
      const winShownBefore = shownMMRFromMuSigma(winBase.mu, winBase.sigma);
      const loseShownBefore = shownMMRFromMuSigma(loseBase.mu, loseBase.sigma);

      // AFTER inflation
      const winInflated = reinflateSigma(winBase);
      const loseInflated = reinflateSigma(loseBase);

      const winShownAfter = shownMMRFromMuSigma(winInflated.mu, winInflated.sigma);
      const loseShownAfter = shownMMRFromMuSigma(loseInflated.mu, loseInflated.sigma);

      const potentialWin = winShownAfter - currentShown;
      const potentialLoss = loseShownAfter - currentShown;

      // ---- DEBUG LOGGING ----
      console.log(`\nPLAYER ${p.username} (${p.id})`);
      console.log(
        `  Current trueskill=${rating.mu.toFixed(6)}, sigma=${rating.sigma.toFixed(6)}, shown=${currentShown}`
      );

      console.log("  BEFORE inflation:");
      console.log(
        `    Win  → mu=${winBase.mu.toFixed(6)}, sigma=${winBase.sigma.toFixed(6)}, shown=${winShownBefore}`
      );
      console.log(
        `    Loss → mu=${loseBase.mu.toFixed(6)}, sigma=${loseBase.sigma.toFixed(6)}, shown=${loseShownBefore}`
      );

      console.log("  AFTER inflation:");
      console.log(
        `    Win  → mu=${winInflated.mu.toFixed(6)}, sigma=${winInflated.sigma.toFixed(6)}, shown=${winShownAfter}`
      );
      console.log(
        `    Loss → mu=${loseInflated.mu.toFixed(6)}, sigma=${loseInflated.sigma.toFixed(6)}, shown=${loseShownAfter}`
      );

      console.log(`  deltaWin=${potentialWin}, deltaLoss=${potentialLoss}`);

      // ---- END DEBUG LOGGING ----

      results.push({
        id: p.id,
        username: p.username,
        mu: rating.mu,
        sigma: rating.sigma,
        currentMMR: currentShown,
        potentialWin,
        potentialLoss,
        winRating: winInflated,
        loseRating: loseInflated,
      });
    }

    return results;
  } finally {
    db.release();
  }
}