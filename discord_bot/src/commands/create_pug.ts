import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { redisClient } from "../redis";
import { v4 as uuidv4 } from "uuid";

export default {
  data: new SlashCommandBuilder()
    .setName("create_pug")
    .setDescription("Create a new PUG by selecting players for each team.")
    .addStringOption(opt =>
      opt
        .setName("team1")
        .setDescription("Mention players for Team 1 (e.g., @user1 @user2 @user3)")
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt
        .setName("team2")
        .setDescription("Mention players for Team 2 (e.g., @user4 @user5 @user6)")
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    try {
      const guild = interaction.guild;
      if (!guild)
        return interaction.reply({
          content: "⚠️ This command must be used in a server.",
          ephemeral: true,
        });

      const team1Raw = interaction.options.getString("team1", true);
      const team2Raw = interaction.options.getString("team2", true);

      // Parse user mentions into Discord IDs
      const parseMentions = (text: string) => {
        const regex = /<@!?(\d+)>/g;
        const ids: string[] = [];
        let match;
        while ((match = regex.exec(text))) ids.push(match[1]);
        return ids;
      };

      const team1Ids = parseMentions(team1Raw);
      const team2Ids = parseMentions(team2Raw);

      if (!team1Ids.length || !team2Ids.length)
        return interaction.reply({
          content: "⚠️ You must mention at least one player in each team.",
          ephemeral: true,
        });

      // Fetch basic member info for each player
      const fetchMembers = async (ids: string[]) =>
        Promise.all(
          ids.map(async id => {
            const member = await guild.members.fetch(id);
            return {
              id: member.user.id,
              username: member.user.username,
              displayName: member.displayName,
              globalName: member.user.globalName ?? null,
            };
          })
        );

      const team1 = await fetchMembers(team1Ids);
      const team2 = await fetchMembers(team2Ids);

      // Generate a unique temporary PUG ID
      const tempPugId = uuidv4();

      // ✅ Include the user who created the PUG
      const tempPugData = {
        pug_id: tempPugId,
        team1,
        team2,
        captains: { team1: null, team2: null },
        user_requested: {
          id: interaction.user.id,
          username: interaction.user.username,
          discriminator: interaction.user.discriminator ?? "",
          globalName: interaction.user.globalName ?? null,
        },
      };

      // Save to Redis
      await redisClient.set(`temp_pug:${tempPugId}`, JSON.stringify(tempPugData), { EX: 600 });

      console.log("✅ Saved temp PUG to Redis:", tempPugData);

      // Build select menus
      const team1Select = new StringSelectMenuBuilder()
        .setCustomId(`select_captain_team1_${tempPugId}`)
        .setPlaceholder("Select Captain for Team 1")
        .addOptions(team1.map(p => ({ label: p.username, value: p.id })));

      const team2Select = new StringSelectMenuBuilder()
        .setCustomId(`select_captain_team2_${tempPugId}`)
        .setPlaceholder("Select Captain for Team 2")
        .addOptions(team2.map(p => ({ label: p.username, value: p.id })));

      const row1 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(team1Select);
      const row2 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(team2Select);

      // Confirm button
      const confirmButton = new ButtonBuilder()
        .setCustomId(`pug:${tempPugId}:confirm_captains`)
        .setLabel("✅ Confirm Captains")
        .setStyle(ButtonStyle.Success);

      const rowConfirm = new ActionRowBuilder<ButtonBuilder>().addComponents(confirmButton);

      // Reply with menus and confirm button
      await interaction.reply({
        content: `✅ **PUG Created!**\nSelect captains for each team, then confirm.`,
        components: [row1, row2, rowConfirm],
        ephemeral: true,
      });
    } catch (error) {
      console.error("Error in /create_pug:", error);
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: "⚠️ Something went wrong creating the PUG.",
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: "⚠️ Something went wrong creating the PUG.",
          ephemeral: true,
        });
      }
    }
  },
};