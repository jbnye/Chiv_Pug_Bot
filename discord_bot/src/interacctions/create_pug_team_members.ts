import { StringSelectMenuInteraction } from "discord.js";
import { redisClient } from "../redis";
import { validatePugTeams } from "../utils/create_pug_team_validation";

interface TeamMember {
  id: string;
  username: string;
  displayName: string;
  globalName: string | null;
}

interface TempPugData {
  team1?: TeamMember[];
  team2?: TeamMember[];
  captains?: { team1: string | null; team2: string | null };
  user_requested?: {
    id: string;
    username: string;
    discriminator: string;
    globalName: string | null;
  };
}

export async function handleTeamMemberSelection(interaction: StringSelectMenuInteraction) {
  try {
    console.log("\n========== handleTeamMemberSelection START ==========");
    await interaction.deferReply({ /*flags: 64 */});

    if (!interaction.customId) {
      console.error("Interaction has no customId!");
      await interaction.editReply({ content: "Invalid interaction. Try again." });
      return;
    }

    const parts = interaction.customId.split(":");
    const tempPugId = parts[1];
    const team = interaction.customId.includes("team1") ? "team1" : "team2";

    const tempKey = `temp_pug:${tempPugId}`;
    const tempRaw = await redisClient.get(tempKey);

    let tempPug: TempPugData = tempRaw
      ? JSON.parse(tempRaw)
      : { team1: [], team2: [], captains: { team1: null, team2: null } };

    if (!tempPug.user_requested) {
      tempPug.user_requested = {
        id: interaction.user.id,
        username: interaction.user.username,
        discriminator: interaction.user.discriminator ?? "",
        globalName: interaction.user.globalName ?? null,
      };
    }


    const selectedIds = interaction.values;
    console.log("Selected IDs:", selectedIds);

    const teamMembers: TeamMember[] = (
      await Promise.all(
        selectedIds.map(async (id) => {
          try {
            const member = await interaction.guild!.members.fetch(id);
            return {
              id: member.user.id,
              username: member.user.username,
              displayName: member.displayName,
              globalName: member.user.globalName ?? null,
            };
          } catch {
            console.warn(`⚠️ Could not fetch member with ID: ${id}`);
            return null;
          }
        })
      )
    ).filter((m): m is TeamMember => !!m);

    console.log(`Team ${team} members fetched:`, teamMembers.map(m => m.username));

    if (!teamMembers.length) {
      await interaction.editReply({ content: `No valid members selected for ${team}.` });
      return;
    }

    tempPug[team] = teamMembers;


    await redisClient.set(tempKey, JSON.stringify(tempPug), { EX: 600 });
    console.log("Saved temp PUG to Redis:", tempPug);


    console.log("Running validatePugTeams with:", {
      team1Count: tempPug.team1?.length,
      team2Count: tempPug.team2?.length,
      currentTeam: team,
    });


    const hasError = await validatePugTeams(
      interaction,
      {
        team1: tempPug.team1?.map(m => m.id) || [],
        team2: tempPug.team2?.map(m => m.id) || [],
      },
      team 
    );

    if (hasError) return; 

    console.log("========== handleTeamMemberSelection END ==========\n");
  } catch (error) {
    console.error("Error in handleTeamMemberSelection:", error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "Failed to handle team member selection. Try again.", flags:64});
    } else {
      await interaction.editReply({ content: "Failed to handle team member selection." });
    }
  }
}