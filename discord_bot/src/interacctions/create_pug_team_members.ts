import { StringSelectMenuInteraction } from "discord.js";
import { redisClient } from "../redis";
import { create_pug_backend } from "../utils/create_pug_backend";
import { v4 as uuidv4 } from "uuid";
interface TeamMember {
  id: string;
  username: string;
  displayName: string;
  globalName: string | null;
}

interface TempPugData {
  team1?: TeamMember[];
  team2?: TeamMember[];
  user_requested?: {
    id: string;
    username: string;
    discriminator: string;
    globalName: string | null;
  };
  [key: string]: any;
}

export async function handleTeamMemberSelection(interaction: StringSelectMenuInteraction) {
  try {
    // 1️⃣ Defer immediately
    await interaction.deferReply({ ephemeral: true });

    if (!interaction.guild) {
      await interaction.editReply({ content: "⚠️ Cannot fetch members: guild not found." });
      return;
    }

    // 2️⃣ Load temporary PUG data from Redis
    const tempPugKey = `temp_pug:${interaction.message.interaction?.id}`;
    const tempDataRaw = await redisClient.get(tempPugKey);
    if (!tempDataRaw) {
      await interaction.editReply({ content: "⚠️ Temporary PUG not found." });
      return;
    }

    const tempData: TempPugData = JSON.parse(tempDataRaw);

    // 3️⃣ Record who is using the interaction if not already set
    if (!tempData.user_requested) {
      tempData.user_requested = {
        id: interaction.user.id,
        username: interaction.user.username,
        discriminator: interaction.user.discriminator ?? "",
        globalName: interaction.user.globalName ?? null,
      };
    }

    // 4️⃣ Determine which team this interaction is for
    const teamNumber = interaction.customId.includes("team1") ? "team1" : "team2";
    const selectedIds = interaction.values;

    // 5️⃣ Fetch members safely
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
            return null;
          }
        })
      )
    ).filter((m): m is TeamMember => !!m);

    if (!teamMembers.length) {
      await interaction.editReply({ content: `⚠️ No valid members selected for ${teamNumber}.` });
      return;
    }

    tempData[teamNumber] = teamMembers;

    // 6️⃣ Save back to Redis
    await redisClient.set(tempPugKey, JSON.stringify(tempData), { EX: 600 });
    // 7️⃣ If both teams are ready, create the final PUG
    if (tempData.team1 && tempData.team2 && tempData.user_requested) {
    const pug_id = uuidv4();

    // Create final PUG with guaranteed non-undefined properties
    const result = await create_pug_backend({
        data: {
        pug_id,
        date: new Date(),
        team1: tempData.team1, // guaranteed defined here
        team2: tempData.team2,
        user_requested: tempData.user_requested,
        },
    });

    await interaction.editReply({
        content: result.success
        ? `✅ PUG created!\n**Team 1:** ${tempData.team1.map((p) => `<@${p.id}>`).join(", ")}\n**Team 2:** ${tempData.team2.map((p) => `<@${p.id}>`).join(", ")}\nToken: \`${pug_id}\``
        : `❌ Failed to create PUG: ${result.error || "unknown error"}`,
        components: [],
    });

    await redisClient.del(tempPugKey);
    return;
    }

    // 8️⃣ Otherwise, prompt for the other team
    await interaction.editReply({
      content: `✅ Team members for ${teamNumber} saved. Now select the other team's members.`,
    });
  } catch (error) {
    console.error("Error in team member selection:", error);

    try {
      await interaction.editReply({ content: "⚠️ Failed to save team members." });
    } catch (e) {
      console.error("Failed to edit reply after error:", e);
    }
  }
}