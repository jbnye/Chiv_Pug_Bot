import { StringSelectMenuInteraction } from "discord.js";
import { redisClient } from "../redis";

export async function handleCaptainSelection(interaction: StringSelectMenuInteraction) {
  try {
    console.log("\n========== handleCaptainSelection START ==========");
    console.log("customId:", interaction.customId);
    console.log("values:", interaction.values);

    const parts = interaction.customId.split("_");
    console.log("Split parts:", parts);

    const team = parts[2]; // should be 'team1' or 'team2'
    const tempPugId = parts[3]; // should be the UUID

    console.log("team:", team);
    console.log("tempPugId:", tempPugId);

    const tempKey = `temp_pug:${tempPugId}`;
    console.log("Redis lookup key:", tempKey);

    const tempRaw = await redisClient.get(tempKey);
    console.log("Redis raw result:", tempRaw ? "✅ Found" : "❌ Not Found");

    if (!tempRaw) {
      console.log("❌ Could not find pug data, replying to interaction.");
      await interaction.reply({
        content: "⚠️ Could not find temporary PUG data in Redis. Please recreate the PUG.",
        ephemeral: true,
      });
      return;
    }

    const tempPug = JSON.parse(tempRaw);
    console.log("Parsed tempPug:", tempPug);

    if (!tempPug.captains) {
      tempPug.captains = { team1: null, team2: null };
      console.log("Initialized missing captains field");
    }

    const selectedCaptainId = interaction.values[0];
    tempPug.captains[team] = selectedCaptainId;

    console.log(`Setting ${team} captain to`, selectedCaptainId);

    await redisClient.set(tempKey, JSON.stringify(tempPug), { EX: 600 });
    console.log("✅ Saved updated temp pug to Redis");

    await interaction.deferUpdate();

    console.log("✅ Interaction replied successfully");
    console.log("========== handleCaptainSelection END ==========\n");
  } catch (error) {
    console.error("💥 Error in handleCaptainSelection:", error);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ Failed to register captain selection. Try again.",
        ephemeral: true,
      });
    }
  }
}