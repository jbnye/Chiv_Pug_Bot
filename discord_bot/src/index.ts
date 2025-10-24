import { Client, GatewayIntentBits, REST, Routes } from "discord.js";
import dotenv from "dotenv";
dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user?.tag}`);
});

// Example event listener
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (message.content.startsWith("!ping")) {
    await message.reply("pong 🏓");
  }
});

client.login(process.env.DISCORD_TOKEN);