import { 
  Collection, Events, ChatInputCommandInteraction, GatewayIntentBits, Interaction 
} from "discord.js";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { ChivClient } from "./types/client";
import { connectRedisAndLoad } from "./redis";

dotenv.config();

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

// Client ready
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

// AUTOCOMPLETE HANDLER
client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  if (!interaction.isAutocomplete()) return;

  if (interaction.commandName === "create_pug") {
    const focused = interaction.options.getFocused().toLowerCase();
    const members = await interaction.guild!.members.fetch();

    const filtered = members
      .filter((m) => m.user.username.toLowerCase().includes(focused))
      .first(25)
      .map((m) => ({ name: m.user.username, value: m.user.id }));

    await interaction.respond(filtered);
  }
});

// CHAT INPUT COMMAND HANDLER
client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const chivClient = interaction.client as ChivClient;
  const command = chivClient.commands.get(interaction.commandName);

  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found.`);
    return;
  }

  try {
    // Only defer if not already deferred or replied
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: 64 }); 
    }

    await command.execute(interaction as ChatInputCommandInteraction);
  } catch (error) {
    console.error("Error executing command:", error);

    if (!interaction.deferred && !interaction.replied) {
      await interaction.reply({
        content: "There was an error while executing this command.",
        flags: 64,
      });
    } else {
      await interaction.editReply({
        content: "There was an error while executing this command.",
      });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);

