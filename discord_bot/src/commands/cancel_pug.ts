import {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  CommandInteraction,
} from "discord.js";
import { redisClient } from "../redis";

export const data = new SlashCommandBuilder()
  .setName("cancel_pug")
  .setDescription("Cancel (delete) an active PUG.");

export async function execute(interaction: CommandInteraction) {
  await interaction.deferReply({ flags: 64 });

  // Get all active pug keys
  const keys = await redisClient.keys("pug:*");

  if (!keys.length) {
    await interaction.editReply("❌ No active PUGs found.");
    return;
  }

  // Load PUG data to display names
  const options = [];
  for (const key of keys) {
    const raw = await redisClient.get(key);
    if (!raw) continue;
    const pug = JSON.parse(raw);

    const name = `${pug?.team1?.length || 0}v${pug?.team2?.length || 0} (${pug?.user_requested?.username ?? "unknown"})`;
    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel(name)
        .setDescription(`ID: ${pug.pug_id}`)
        .setValue(key)
    );
  }

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId("cancel_pug_select")
    .setPlaceholder("Select a PUG to cancel")
    .addOptions(options);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  await interaction.editReply({
    content: "🗑️ Select a PUG to cancel:",
    components: [row],
  });
}