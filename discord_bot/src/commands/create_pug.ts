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
      if (!guild) {
        return interaction.reply({
          content: "⚠️ This command must be used in a server.",
          flags: 64,
        });
      }

      const team1Raw = interaction.options.getString("team1", true);
      const team2Raw = interaction.options.getString("team2", true);

      // Parse mentions into IDs
      const parseMentions = (text: string) => {
        const regex = /<@!?(\d+)>/g;
        const ids: string[] = [];
        let match;
        while ((match = regex.exec(text))) ids.push(match[1]);
        return ids;
      };

      const team1Ids = parseMentions(team1Raw);
      const team2Ids = parseMentions(team2Raw);

      // Basic checks
      if (!team1Ids.length || !team2Ids.length) {
        return interaction.reply({
          content: "⚠️ You must mention at least one player in each team (e.g. @user).",
          flags: 64,
        });
      }

      // 1) No duplicates within or across teams
      const allIds = [...team1Ids, ...team2Ids];
      const dup = allIds.filter((id, i) => allIds.indexOf(id) !== i);
      if (dup.length) {
        return interaction.reply({
          content: `❌ Duplicate player(s) detected: <@${[...new Set(dup)].join(">, <@")}>. Each player can only appear once.`,
          flags: 64,
        });
      }

      // 2) Everyone must be in the guild (server)
      const notInGuild: string[] = [];
      await Promise.all(
        allIds.map(async (id) => {
          try {
            // fetch returns member or throws
            await guild.members.fetch(id);
          } catch {
            notInGuild.push(id);
          }
        })
      );
      if (notInGuild.length) {
        return interaction.reply({
          content: `❌ The following player(s) are not on this server: <@${notInGuild.join(">, <@")}>.`,
          flags: 64,
        });
      }

      // 3) Even teams (immediate cancel if uneven)
      if (team1Ids.length !== team2Ids.length) {
        return interaction.reply({
          content: `❌ Teams are uneven: Team 1 has ${team1Ids.length}, Team 2 has ${team2Ids.length}. Teams must be the same size.`,
          flags: 64,
        });
      }

      // 4) Minimum team size (uncomment in prod; leave commented for testing)
      // const MIN_TEAM_SIZE = 5;
      // if (team1Ids.length < MIN_TEAM_SIZE) {
      //   return interaction.reply({
      //     content: `❌ Teams are too small. Minimum team size is ${MIN_TEAM_SIZE}.`,
      //     flags: 64,
      //   });
      // }

      // Fetch basic member info for each player (safe now — we ensured they're in guild)
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

      // Generate temp PUG id and save to Redis
      const tempPugId = uuidv4();

      await redisClient.set(
        `temp_pug:${tempPugId}`,
        JSON.stringify({
          pug_id: tempPugId,
          team1,
          team2,
          captains: { team1: null, team2: null },
          user_requested: {
            id: interaction.user.id,
            username: interaction.user.username,
            globalName: interaction.user.globalName ?? null,
            discriminator: interaction.user.discriminator ?? "",
          },
        }),
        { EX: 600 } // 10 minutes
      );

      console.log("✅ Saved temp PUG to Redis:", {
        pug_id: tempPugId,
        team1: team1.map((p) => p.id),
        team2: team2.map((p) => p.id),
      });

      // Build select menus for captains
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

      const confirmButton = new ButtonBuilder()
        .setCustomId(`pug:${tempPugId}:confirm_captains`)
        .setLabel("✅ Confirm Captains")
        .setStyle(ButtonStyle.Success);

      const rowConfirm = new ActionRowBuilder<ButtonBuilder>().addComponents(confirmButton);

      await interaction.reply({
        content: `✅ **PUG Created!**\nSelect captains for each team, then confirm.`,
        components: [row1, row2, rowConfirm],
        flags: 64,
      });
    } catch (error) {
      console.error("Error in /create_pug:", error);
      if ((interaction as any).deferred || (interaction as any).replied) {
        await (interaction as any).followUp({ content: "⚠️ Something went wrong creating the PUG.", flags: 64 });
      } else {
        await (interaction as any).reply({ content: "⚠️ Something went wrong creating the PUG.", flags: 64 });
      }
    }
  },
};