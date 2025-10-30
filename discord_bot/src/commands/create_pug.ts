import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { create_pug_backend } from "../utils/create_pug_backend";
import { v4 as uuidv4 } from "uuid";

interface create_pug_response {
  success: boolean;
  key?: string;
  error?: string;
}

interface user_requested {
  id: string;
  username: string;
  discriminator: string;
  globalName: string | null;
}

export default {
  data: new SlashCommandBuilder()
    .setName("create_pug")
    .setDescription("Create a new PUG by tagging players for each team.")
    .addStringOption((option) =>
      option
        .setName("team1")
        .setDescription("Mention 5 players for Team 1 (e.g. @user1 @user2 ...)")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("team2")
        .setDescription("Mention 5 players for Team 2 (e.g. @user1 @user2 ...)")
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    // ✅ Only defer once
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: 64 });
    }

    try {
      const user_requested: user_requested = interaction.user;
      const team1 = interaction.options.getString("team1", true);
      const team2 = interaction.options.getString("team2", true);

      const parseMentions = (text: string) => {
        const regex = /<@!?(\d+)>/g;
        const ids: string[] = [];
        let match;
        while ((match = regex.exec(text))) ids.push(match[1]);
        return ids;
      };

      const team1Ids = parseMentions(team1);
      const team2Ids = parseMentions(team2);

      const team1_members = await Promise.all(
        team1Ids.map(async (id) => {
          const member = await interaction.guild!.members.fetch(id);
          return {
            id: member.user.id,
            username: member.user.username,
            displayName: member.displayName,
            globalName: member.user.globalName,
          };
        })
      );

      const team2_members = await Promise.all(
        team2Ids.map(async (id) => {
          const member = await interaction.guild!.members.fetch(id);
          return {
            id: member.user.id,
            username: member.user.username,
            displayName: member.displayName,
            globalName: member.user.globalName,
          };
        })
      );

      const pug_id = uuidv4();
      const data = {
        pug_id,
        date: new Date(),
        team1: team1_members,
        team2: team2_members,
        user_requested,
      };

      const result: create_pug_response = await create_pug_backend({ data });

      // ✅ Always edit reply, never reply again
      await interaction.editReply({
        content: result.success
          ? `✅ **PUG Created!**\n\n**Team 1:** ${team1Ids
              .map((id) => `<@${id}>`)
              .join(", ")}\n**Team 2:** ${team2Ids
              .map((id) => `<@${id}>`)
              .join(", ")}\n\nToken: \`${pug_id}\``
          : `❌ Failed to create PUG: ${result.error || "unknown error"}`,
      });
    } catch (error) {
      console.error("Error executing /create_pug:", error);

      if (!interaction.replied) {
        await interaction.editReply({
          content: "⚠️ An unexpected error occurred while creating the PUG.",
        });
      }
    }
  },
};