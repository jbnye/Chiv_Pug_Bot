import dotenv from "dotenv";
dotenv.config();
import { Events, ChatInputCommandInteraction, Interaction } from "discord.js";
import fs from "fs";
import path from "path";
import { ChivClient } from "./types/client";
import { connectRedisAndLoad } from "./redis";
import { createDatabase } from "./database/init_db";

// Interaction handlers
import { handleFinishPugSelect } from "./interacctions/finish_pug_select";
import { handleCaptainSelection } from "./interacctions/create_pug_select_captains";
import { handleConfirmCaptains } from "./interacctions/create_pug_confirm_button";
import { handleFinishPugButton } from "./interacctions/finish_pug_buttons";
import { handleRevertPugSelect } from "./interacctions/revert_pug_select";
import { handleCancelPugSelection } from "./interacctions/cancel_pug_select_pug";

const allowed_guilds = new Set(process.env.ALLOWED_GUILDS?.split(",") ?? []);
console.log("Allowed guilds: ", allowed_guilds);

const client = new ChivClient();


// Load commands
(async () => {
  const commandsPath = path.join(__dirname, "commands");
  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter(file => file.endsWith(".js") || file.endsWith(".ts"));

  for (const file of commandFiles) {
    const commandModule = await import(path.join(commandsPath, file));
    const command = commandModule.default || Object.values(commandModule)[0];
    client.commands.set(command.data.name, command);
  }
})();

// Connect Redis
(async () => await connectRedisAndLoad())();

// Initialize database
(async () => await createDatabase())();

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});

// Ping test
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (message.content.startsWith("!ping")) {
    await message.reply("pong");
  }
});

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  if (!interaction.guildId || !allowed_guilds.has(interaction.guildId)) {
    if (
      interaction.isChatInputCommand() ||
      interaction.isButton() ||
      interaction.isStringSelectMenu()
    ) {
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp({
            content: "This Discord server is not allowed to use the bot.",
            ephemeral: true
          });
        } else {
          await interaction.reply({
            content: "This Discord server is not allowed to use the bot.",
            ephemeral: true
          });
        }
      } catch (err) {
        console.warn("Failed to notify about disallowed guild:", err);
      }
    }
    return; 
  }

  try {
    console.log("\nInteraction triggered:", {
      type: interaction.type,
      isStringSelect: interaction.isStringSelectMenu?.(),
      customId: (interaction as any).customId,
      commandName: (interaction as any).commandName,
    });

    // Autocomplete
    if (interaction.isAutocomplete()) {
      if (interaction.commandName === "create_pug") {
        const focused = interaction.options.getFocused().toLowerCase();
        const members = await interaction.guild!.members.fetch();
        const filtered = members
          .filter((m) => m.user.username.toLowerCase().includes(focused))
          .first(25)
          .map((m) => ({ name: m.user.username, value: m.user.id }));
        await interaction.respond(filtered);
      }
      return;
    }

    // Chat input commands
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      await command.execute(interaction as ChatInputCommandInteraction);
      return;
    }

    // String select menus
    if (interaction.isStringSelectMenu()) {
      const id = interaction.customId;
      if (id.startsWith("select_captain_")) await handleCaptainSelection(interaction);
      else if (id === "finish_pug_select") await handleFinishPugSelect(interaction);
      else if (id === "cancel_pug_select") await handleCancelPugSelection(interaction);
      else if (id === "revert_pug_select") await handleRevertPugSelect(interaction);
      return;
    }

    // Button interactions
    if (interaction.isButton()) {
      const id = interaction.customId;
      if (id.includes(":confirm_captains")) await handleConfirmCaptains(interaction);
      if (id.startsWith("finish_team1_") || id.startsWith("finish_team2_"))
        await handleFinishPugButton(interaction);
      return;
    }

  } catch (error) {
    console.error("Error handling interaction:", error);
    if (
      interaction.isChatInputCommand() ||
      interaction.isButton() ||
      interaction.isStringSelectMenu()
    ) {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: "Error handling interaction.", ephemeral: true });
      } else {
        await interaction.reply({ content: "Error handling interaction.", ephemeral: true });
      }
    }
  }
});

client.login(process.env.DISCORD_TOKEN);