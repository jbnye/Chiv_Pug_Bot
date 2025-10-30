import { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ChatInputCommandInteraction } from "discord.js";
import { redisClient } from "../redis";

export default {
  data: new SlashCommandBuilder()
    .setName("finish_pug")
    .setDescription("Finish a PUG and select the winning team.")
    .addStringOption(opt =>
      opt
        .setName("pug_id")
        .setDescription("The PUG token (from creation)")
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const pug_id = interaction.options.getString("pug_id", true);
    const redisKey = `pug:${pug_id}`;
    const data = await redisClient.get(redisKey);

    if (!data) {
      await interaction.reply({ content: `No PUG found for ID: ${pug_id}`, ephemeral: true });
      return;
    }

    const pug = JSON.parse(data);
    const captain1Name = pug.captain1?.username || "Captain 1";
    const captain2Name = pug.captain2?.username || "Captain 2";

    const button1 = new ButtonBuilder()
      .setCustomId(`finish_${pug_id}_1`)
      .setLabel(`${captain1Name}'s Team Won`)
      .setStyle(ButtonStyle.Success);

    const button2 = new ButtonBuilder()
      .setCustomId(`finish_${pug_id}_2`)
      .setLabel(`${captain2Name}'s Team Won`)
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button1, button2);

    await interaction.reply({
      content: `Who won this PUG?\n**${captain1Name}** vs **${captain2Name}**`,
      components: [row],
      ephemeral: true,
    });
  },
};