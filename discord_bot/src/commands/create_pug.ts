import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { create_pug_backend } from "../utils/create_pug_backend";
import { v4 as uuidv4 } from "uuid";

export default {
  data: new SlashCommandBuilder()
    .setName("create_pug")
    .setDescription("Create a new PUG by selecting captains and team members.")
    .addUserOption(opt =>
      opt.setName("captain1").setDescription("Select Captain 1").setRequired(true)
    )
    .addUserOption(opt =>
      opt.setName("captain2").setDescription("Select Captain 2").setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName("team1").setDescription("Mention Team 1 players (@user1 @user2 …)").setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName("team2").setDescription("Mention Team 2 players (@user1 @user2 …)").setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    try {
      const captain1 = interaction.options.getUser("captain1", true);
      const captain2 = interaction.options.getUser("captain2", true);
      const team1Raw = interaction.options.getString("team1", true);
      const team2Raw = interaction.options.getString("team2", true);

      const parseMentions = (text: string) => {
        const regex = /<@!?(\d+)>/g;
        const ids: string[] = [];
        let match;
        while ((match = regex.exec(text))) ids.push(match[1]);
        return ids;
      };

      const guild = interaction.guild;
      if (!guild) return;

      const fetchMembers = async (ids: string[]) =>
        Promise.all(ids.map(async id => {
          const member = await guild.members.fetch(id);
          return {
            id: member.user.id,
            username: member.user.username,
            displayName: member.displayName,
            globalName: member.user.globalName ?? null,
          };
        }));

      const team1 = await fetchMembers(parseMentions(team1Raw));
      const team2 = await fetchMembers(parseMentions(team2Raw));

      const pug_id = uuidv4();
      const result = await create_pug_backend({
        data: {
          captain1: { id: captain1.id, username: captain1.username },
          captain2: { id: captain2.id, username: captain2.username },
          team1,
          team2,
          pug_id,
          date: new Date(),
          user_requested: {
            id: interaction.user.id,
            username: interaction.user.username,
            discriminator: interaction.user.discriminator,
            globalName: interaction.user.globalName ?? null,
          },
        },
      });

      await interaction.reply({
        content: result.success
          ? `✅ **PUG Created!**\n**Captain 1:** <@${captain1.id}>\n**Captain 2:** <@${captain2.id}>\n**Team 1:** ${team1.map(p => `<@${p.id}>`).join(", ")}\n**Team 2:** ${team2.map(p => `<@${p.id}>`).join(", ")}`
          : `❌ Failed to create PUG: ${result.error || "unknown error"}`,
      });
    } catch (error) {
      console.error("Error creating PUG:", error);
      await interaction.reply({ content: "⚠️ Something went wrong creating the PUG.", ephemeral: true });
    }
  },
};