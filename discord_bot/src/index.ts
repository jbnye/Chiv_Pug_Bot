import dotenv from "dotenv";
dotenv.config();
import { 
  Collection, Events, ChatInputCommandInteraction, GatewayIntentBits, Interaction 
} from "discord.js";
import { handleFinishPugSelect } from "./interacctions/finish_pug_button_handler";
import fs from "fs";
import path from "path";
import { ChivClient } from "./types/client";
import { connectRedisAndLoad } from "./redis";

const client = new ChivClient();
client.commands = new Collection<string, any>();

// Load commands
(async () => {
  const commandsPath = path.join(__dirname, "commands");
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".ts"));

  for (const file of commandFiles) {
    const command = await import(path.join(commandsPath, file));
    client.commands.set(command.default.data.name, command.default);
  }
})();

(async () => {
  await connectRedisAndLoad();
})();

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});

// Simple message handler
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (message.content.startsWith("!ping")) {
    await message.reply("pong");
  }
});

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  try {
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
      return; // done for autocomplete
    }

    // Chat input commands
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      await command.execute(interaction as ChatInputCommandInteraction);
      return;
    }

    // Select menus
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "finish_pug_select") {
        await handleFinishPugSelect(interaction);
      }
      return;
    }

  } catch (error) {
    console.error("Error handling interaction:", error);

    // Only reply/followUp for interactions that support it
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