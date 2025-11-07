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
    console.log("customId:", interaction.customId);
    console.log("values:", interaction.values);

    await interaction.deferReply({ ephemeral: true });

    // 1️⃣ Extract the temp pug ID from the customId
    // Example customId: "pug:<uuid>:team1_select_members"
    const parts = interaction.customId.split(":");
    const tempPugId = parts[1]; // second part = UUID
    const team = interaction.customId.includes("team1") ? "team1" : "team2";

    const tempKey = `temp_pug:${tempPugId}`;
    console.log("Redis key:", tempKey);

    // 2️⃣ Load or initialize temporary pug data
    const tempRaw = await redisClient.get(tempKey);
    let tempPug: TempPugData;

    if (tempRaw) {
      tempPug = JSON.parse(tempRaw);
      console.log("✅ Loaded existing temp pug data");
    } else {
      tempPug = { team1: [], team2: [], captains: { team1: null, team2: null } };
      console.log("🆕 Initialized new temp pug data");
    }

    // 3️⃣ Save who created the PUG if missing
    if (!tempPug.user_requested) {
      tempPug.user_requested = {
        id: interaction.user.id,
        username: interaction.user.username,
        discriminator: interaction.user.discriminator ?? "",
        globalName: interaction.user.globalName ?? null,
      };
      console.log("🧍 Set user_requested:", tempPug.user_requested.username);
    }

    // 4️⃣ Build team member list from selected IDs
    const selectedIds = interaction.values;
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
          } catch (err) {
            console.error(`⚠️ Failed to fetch member ${id}:`, err);
            return null;
          }
        })
      )
    ).filter((m): m is TeamMember => !!m);

    if (!teamMembers.length) {
      await interaction.editReply({ content: `⚠️ No valid members selected for ${team}.` });
      return;
    }

    tempPug[team] = teamMembers;
    console.log(`✅ Saved ${team} members:`, teamMembers.map((m) => m.username));

    // 5️⃣ Save updated pug back to Redis
    await redisClient.set(tempKey, JSON.stringify(tempPug), { EX: 600 });
    console.log("💾 Saved to Redis");

    // 6️⃣ If both teams are selected, move on or finalize
    if (tempPug.team1?.length && tempPug.team2?.length) {
      await interaction.editReply({
        content: `✅ Team members selected for both teams!\nNow choose captains using the select menus.`,
      });
    } else {
      await interaction.editReply({
        content: `✅ ${team} members saved! Please select the other team's members next.`,
      });
    }

    console.log("========== handleTeamMemberSelection END ==========\n");
  } catch (error) {
    console.error("💥 Error in handleTeamMemberSelection:", error);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ Failed to handle team member selection. Try again.",
        ephemeral: true,
      });
    } else {
      await interaction.editReply({ content: "❌ Failed to handle team member selection." });
    }
  }
}