import { ButtonInteraction } from "discord.js";
import { redisClient } from "../redis";
import { create_pug_backend } from "../utils/create_pug_backend";
import { v4 as uuidv4 } from "uuid";
import { getPlayerMMRsWithStakes } from "../utils/calculate_mmr_stakes";

export async function handleConfirmCaptains(interaction: ButtonInteraction) {
  const parts = interaction.customId.split(":"); // ["pug", "<uuid>", "confirm_captains"]
  const tempPugId = parts[1];

  const tempKey = `temp_pug:${tempPugId}`;
  const tempRaw = await redisClient.get(tempKey);
  if (!tempRaw) return interaction.reply({ content: "⚠️ Could not find PUG in Redis.", ephemeral: true });

  const tempPug = JSON.parse(tempRaw);
  if (!tempPug.captains.team1 || !tempPug.captains.team2)
    return interaction.reply({ content: "⚠️ Both captains must be selected.", ephemeral: true });

  const pug_id = uuidv4();

  // Assign captains to first element for backend compatibility
  const team1WithCaptain = tempPug.team1.map((p: any) => ({ ...p }));
  const team2WithCaptain = tempPug.team2.map((p: any) => ({ ...p }));

  const t1Index = team1WithCaptain.findIndex((p: any) => p.id === tempPug.captains.team1);
  const t2Index = team2WithCaptain.findIndex((p: any) => p.id === tempPug.captains.team2);
  if (t1Index > 0) [team1WithCaptain[0], team1WithCaptain[t1Index]] = [team1WithCaptain[t1Index], team1WithCaptain[0]];
  if (t2Index > 0) [team2WithCaptain[0], team2WithCaptain[t2Index]] = [team2WithCaptain[t2Index], team2WithCaptain[0]];

  // 1️⃣ Save PUG to backend
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

  // 2️⃣ Fetch TrueSkill ratings + potential changes
  const allPlayers = [...team1WithCaptain, ...team2WithCaptain];
  const stakes = await getPlayerMMRsWithStakes(
    allPlayers.map((p: any) => ({ id: p.id, username: p.username })),
    team1WithCaptain.map((p: any) => p.id),
    team2WithCaptain.map((p: any) => p.id)
  );

  // 3️⃣ Build preview text using TrueSkill
  const buildTeamText = (team: any[]) =>
    team
      .map((p) => {
        const s = stakes.find((x) => x.id === p.id);
        if (!s) return `• <@${p.id}> — **MMR unknown**`;

        const winSign = s.potentialWin >= 0 ? `+${s.potentialWin}` : `${s.potentialWin}`;
        const loseSign = s.potentialLoss >= 0 ? `+${s.potentialLoss}` : `${s.potentialLoss}`;

        return `• <@${p.id}> — ${s.mu.toFixed(1)} ±${s.sigma.toFixed(1)} (≈ ${s.currentMMR}) *(Win: ${winSign} / Loss: ${loseSign})*`;
      })
      .join("\n");

  const team1Text = buildTeamText(team1WithCaptain);
  const team2Text = buildTeamText(team2WithCaptain);

  const captain1 = [...team1WithCaptain, ...team2WithCaptain].find(
    (p) => p.id === tempPug.captains.team1
  );
  const captain2 = [...team1WithCaptain, ...team2WithCaptain].find(
    (p) => p.id === tempPug.captains.team2
  );

  // 4️⃣ Update Discord interaction
  await interaction.update({
    content: `✅ **PUG created!**

  **Captain 1:** <@${tempPug.captains.team1}> (${captain1?.username || "Unknown"})
  **Captain 2:** <@${tempPug.captains.team2}> (${captain2?.username || "Unknown"})
  **Token:** \`${pug_id}\`

  **${captain1?.username || "Captain 1"}'s team**
  ${team1Text}

  **${captain2?.username || "Captain 2"}'s team**
  ${team2Text}`,
    components: [],
  });

  // 5️⃣ Cleanup
  await redisClient.del(tempKey);
}