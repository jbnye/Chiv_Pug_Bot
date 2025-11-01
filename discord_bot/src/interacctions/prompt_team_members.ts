import { ChatInputCommandInteraction, ActionRowBuilder, StringSelectMenuBuilder } from "discord.js";


export async function promptTeamMemberSelectionFromCommand(
  interaction: ChatInputCommandInteraction,
  tempData: any,
) {
  const captain1Menu = new StringSelectMenuBuilder()
    .setCustomId("team1_select")
    .setPlaceholder(`Select Team 1 members for ${tempData.captain1.username}`)
    .setMinValues(1)
    .setMaxValues(5)
    .addOptions(
      tempData.guildMembers.map((member: any) => ({
        label: member.displayName,
        value: member.id,
      }))
    );

  const captain2Menu = new StringSelectMenuBuilder()
    .setCustomId("team2_select")
    .setPlaceholder(`Select Team 2 members for ${tempData.captain2.username}`)
    .setMinValues(1)
    .setMaxValues(5)
    .addOptions(
      tempData.guildMembers.map((member: any) => ({
        label: member.displayName,
        value: member.id,
      }))
    );

  await interaction.editReply({
    content: `✅ Captains selected:\nCaptain 1: <@${tempData.captain1.id}>\nCaptain 2: <@${tempData.captain2.id}>\n\nNow select team members for each captain.`,
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(captain1Menu),
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(captain2Menu),
    ],
  });
}