// interactions/confirm_captains.ts
import { ButtonInteraction } from "discord.js";
import { redisClient } from "../redis";
import { create_pug_backend } from "../utils/create_pug_backend";
import { v4 as uuidv4 } from "uuid";

export async function handleConfirmCaptains(interaction: ButtonInteraction) {
  const parts = interaction.customId.split(":"); // ["pug", "<uuid>", "confirm_captains"]
  const tempPugId = parts[1];

  const tempKey = `temp_pug:${tempPugId}`;
  const tempRaw = await redisClient.get(tempKey);
  if (!tempRaw)
    return interaction.reply({ content: "⚠️ Could not find PUG in Redis.", ephemeral: true });

  const tempPug = JSON.parse(tempRaw);

  if (!tempPug.captains.team1 || !tempPug.captains.team2)
    return interaction.reply({ content: "⚠️ Both captains must be selected.", ephemeral: true });

  const pug_id = uuidv4();

  // Assign captains to first element in each team for backend compatibility
  const team1WithCaptain = tempPug.team1.map((p: any) => ({ ...p }));
  const team2WithCaptain = tempPug.team2.map((p: any) => ({ ...p }));

  // Swap first element with selected captain
  const t1Index = team1WithCaptain.findIndex((p: any) => p.id === tempPug.captains.team1);
  const t2Index = team2WithCaptain.findIndex((p: any) => p.id === tempPug.captains.team2);

  if (t1Index > 0) [team1WithCaptain[0], team1WithCaptain[t1Index]] = [team1WithCaptain[t1Index], team1WithCaptain[0]];
  if (t2Index > 0) [team2WithCaptain[0], team2WithCaptain[t2Index]] = [team2WithCaptain[t2Index], team2WithCaptain[0]];

  const result = await create_pug_backend({
    data: {
      pug_id,
      date: new Date(),
      team1: team1WithCaptain,
      team2: team2WithCaptain,
      user_requested: tempPug.user_requested,
    },
  });

  if (!result.success)
    return interaction.reply({ content: `❌ Failed to create PUG: ${result.error || "unknown error"}`, ephemeral: true });

  await interaction.update({
    content: `✅ PUG created!\n**Captain 1:** <@${tempPug.captains.team1}>\n**Captain 2:** <@${tempPug.captains.team2}>\nToken: \`${pug_id}\``,
    components: [],
  });

  await redisClient.del(tempKey);
}