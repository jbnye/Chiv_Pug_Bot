// src/utils/trueskill.ts
import { Rating, rate } from "ts-trueskill";

export const conservative = (mu: number, sigma: number) => Math.max(mu - 3 * sigma, 0);

// Shown MMR rule you asked for: round DOWN (floor) the conservative MMR for presentation
// (you previously requested 7.9 -> 7)
export const shownMMR = (r: Rating | { mu: number; sigma: number }) =>
  Math.floor(Math.max((r as any).mu - 3 * (r as any).sigma, 0));

// Run rate with consistent input ordering.
// teams: [ team1Ratings, team2Ratings ], winnerRanking: [1,2] for team1 win, [2,1] for team2 win
export function computeNewRatings(team1Ratings: Rating[], team2Ratings: Rating[], winnerIsTeam1: boolean) {
  if (winnerIsTeam1) {
    return rate([team1Ratings, team2Ratings], [1, 2]);
  } else {
    return rate([team1Ratings, team2Ratings], [2, 1]);
  }
}