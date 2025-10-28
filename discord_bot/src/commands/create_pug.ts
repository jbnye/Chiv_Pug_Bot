import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from "discord.js";
import dotenv from "dotenv";
dotenv.config();
import { create_pug_backend } from "../utils/create_pug_backend";
import { v4 as uuidv4 } from 'uuid';
interface user_requested {
    id: string,
    username: string,
    discriminator: string,
    globalName: string | null,
}

export default {
  data: new SlashCommandBuilder()
    .setName("create_pug")
    .setDescription("Create a new PUG by tagging players for each team.")
    .addStringOption(option =>
      option
        .setName("team1")
        .setDescription("Mention 5 players for Team 1 (e.g. @user1 @user2 ...)")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("team2")
        .setDescription("Mention 5 players for Team 2 (e.g. @user1 @user2 ...)")
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const user_requested:user_requested = interaction.user;
    const team1 = interaction.options.getString("team1", true);
    const team2 = interaction.options.getString("team2", true);

    const parseMentions = (text: string) => {
      const regex = /<@!?(\d+)>/g;
      const ids: string[] = [];
      let match;
      while ((match = regex.exec(text))) ids.push(match[1]);
      return ids;
    };
    
    console.log("TEAM 1 : ", team1);
    const team1Ids = parseMentions(team1);
    console.log("TEAM1 IDS: ", team1Ids)
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

    console.log("TEAM 1 MEMBERS:", team1_members);
    console.log("TEAM 2 MEMBERS:", team2_members);
    console.log();
    // if (team1Ids.length !== 5 || team2Ids.length !== 5) {
    //   await interaction.reply({
    //     content: "❌ Each team must have **exactly 5 tagged players**.",
    //     ephemeral: true,
    //   });
    //   return;
    // }

    
    await interaction.reply({
      content: `✅ **PUG Created!**\n\n**Team 1:** ${team1Ids
        .map((id) => `<@${id}>`)
        .join(", ")}\n**Team 2:** ${team2Ids
        .map((id) => `<@${id}>`)
        .join(", ")}`,
    });
    const date = new Date();
    const pug_id: string = uuidv4();
    const data = {
        pug_id,
        date,
        team1: team1_members,
        team2: team2_members,
        user_requested,
    };
    const result = await create_pug_backend({data});
  },
};