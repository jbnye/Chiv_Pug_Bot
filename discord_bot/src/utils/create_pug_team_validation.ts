import { StringSelectMenuInteraction } from "discord.js";

interface ValidateTeamsInput {
  team1: string[];
  team2: string[];
}

/**
 * Validate teams before continuing.
 * Returns true if there IS an error (so caller should stop).
 */
export async function validatePugTeams(
  interaction: StringSelectMenuInteraction,
  teams: ValidateTeamsInput,
  currentTeam: "team1" | "team2"
): Promise<boolean> {
  console.log("\n[validatePugTeams] START");
  console.log("Team1 IDs:", teams.team1);
  console.log("Team2 IDs:", teams.team2);
  console.log("Current team editing:", currentTeam);

  const team1Count = teams.team1.length;
  const team2Count = teams.team2.length;

  // Check for duplicates across both teams
  const allPlayers = [...teams.team1, ...teams.team2];
  const hasDuplicates = allPlayers.length !== new Set(allPlayers).size;
  if (hasDuplicates) {
    console.warn("Duplicate player found across teams!");
    await interaction.editReply({
      content: "A player cannot be on both teams. Please fix and try again.",
    });
    return true;
  }

  // Check for uneven teams
  if (Math.abs(team1Count - team2Count) > 0) {
    console.warn("Teams are uneven!");
    await interaction.editReply({
      content: `Teams are uneven: Team 1 has ${team1Count} players, Team 2 has ${team2Count} players. Both must have the same number.`,
    });
    return true;
  }


  if (team1Count === 0 || team2Count === 0) {
    console.warn("One of the teams is empty!");
    await interaction.editReply({
      content: "Both teams must have at least one player before continuing.",
    });
    return true;
  }

  console.log("✅ [validatePugTeams] PASS");
  return false; 
}