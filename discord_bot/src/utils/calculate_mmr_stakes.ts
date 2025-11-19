import pool from "../database/db";
import { Rating } from "ts-trueskill";
import { computeNewRatings } from "./trueskill";

export async function getPlayerMMRsWithStakes(
  players: { id: string; username: string }[],
  team1: string[],
  team2: string[]
) {
  const db = await pool.connect();
  try {
    const ratingMap: Record<string, Rating> = {};

    console.log("=== GET PLAYER MMRs WITH STAKES ===");
    console.log("Players:", players.map((p) => p.id));
    console.log("Team1:", team1);
    console.log("Team2:", team2);

    // 🔹 Load or create player ratings
    for (const p of players) {
      const res = await db.query(`SELECT mu, sigma FROM players WHERE discord_id = $1`, [p.id]);
      let mu = 25.0;
      let sigma = 3.333;
      if (res.rows.length) {
        mu = res.rows[0].mu ?? mu;
        sigma = res.rows[0].sigma ?? sigma;
        console.log(`Loaded ${p.username} (${p.id}): mu=${mu.toFixed(6)}, sigma=${sigma.toFixed(6)}`);
      } else {
        await db.query(
          `INSERT INTO players (discord_id, discord_username, mu, sigma)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (discord_id) DO NOTHING`,
          [p.id, p.username, mu, sigma]
        );
        console.log(`Created ${p.username} (${p.id}) with defaults mu=${mu}, sigma=${sigma}`);
      }
      ratingMap[p.id] = new Rating(mu, sigma);
    }

    const team1Ratings = team1.map((id) => ratingMap[id]);
    const team2Ratings = team2.map((id) => ratingMap[id]);

    console.log("\n--- COMPUTING NEW RATINGS ---");

    // 4 unique scenarios
    const [t1Win_newT1, t1Win_newT2] = computeNewRatings(team1Ratings, team2Ratings, true);   // Team1 wins
    const [t1Lose_newT1, t1Lose_newT2] = computeNewRatings(team1Ratings, team2Ratings, false); // Team1 loses (Team2 wins)
    // const [t2Win_newT2, t2Win_newT1] = computeNewRatings(team2Ratings, team1Ratings, true);   // Team2 wins
    // const [t2Lose_newT2, t2Lose_newT1] = computeNewRatings(team2Ratings, team1Ratings, false); // Team2 loses (Team1 wins)

    const shownMMRFromMuSigma = (mu: number, sigma: number) => Math.floor(Math.max(mu - 3 * sigma, 0));

    const results: Array<{
      id: string;
      username: string;
      mu: number;
      sigma: number;
      currentMMR: number;
      potentialWin: number;
      potentialLoss: number;
      winRating: Rating;
      loseRating: Rating;
    }> = [];

    console.log("\n======= PER PLAYER CALCULATIONS =======");

    for (const p of players) {
      const rating = ratingMap[p.id];
      const currentShown = shownMMRFromMuSigma(rating.mu, rating.sigma);
      const isTeam1 = team1.includes(p.id);
      let effectiveWinR: Rating, effectiveLoseR: Rating;

      if (isTeam1) {
        effectiveWinR = t1Win_newT1[team1.indexOf(p.id)];
        effectiveLoseR = t1Lose_newT1[team1.indexOf(p.id)];
      } else {
        effectiveWinR = t1Lose_newT2[team2.indexOf(p.id)];  // their win is when team2 wins
        effectiveLoseR = t1Win_newT2[team2.indexOf(p.id)];   // their loss is when team2 loses
      }

      const winShown = shownMMRFromMuSigma(effectiveWinR.mu, effectiveWinR.sigma);
      const loseShown = shownMMRFromMuSigma(effectiveLoseR.mu, effectiveLoseR.sigma);

      const potentialWin = winShown - currentShown;
      const potentialLoss = loseShown - currentShown;

      console.log(`\nPLAYER ${p.username} (${p.id})`);
      console.log(`  Current trueskill=${rating.mu.toFixed(6)}, sigma=${rating.sigma.toFixed(6)}, Current shown: ${currentShown}`);
      console.log(
        `  Win → mu=${effectiveWinR.mu.toFixed(6)}, sigma=${effectiveWinR.sigma.toFixed(6)}, shown=${winShown}, delta=${potentialWin}`
      );
      console.log(
        `  Loss → mu=${effectiveLoseR.mu.toFixed(6)}, sigma=${effectiveLoseR.sigma.toFixed(6)}, shown=${loseShown}, delta=${potentialLoss}`
      );

      results.push({
        id: p.id,
        username: p.username,
        mu: rating.mu,
        sigma: rating.sigma,
        currentMMR: currentShown,
        potentialWin,
        potentialLoss,
        winRating: effectiveWinR,
        loseRating: effectiveLoseR,
      });
    }

    console.log("\n=== FINAL RESULTS ===");
    console.log(results);

    return results;
  } finally {
    db.release();
  }
}