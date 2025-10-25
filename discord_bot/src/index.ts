import { Client, Collection, Events, GatewayIntentBits, MessageFlags, REST, Routes } from "discord.js";
import fs from 'fs';
import path from 'path';
import { ping_command } from "./commands/ping";
import axios from "axios";
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


client.once(Events.ClientReady, (readyClient) => {
	console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});
client.login(process.env.DISCORD_TOKEN);

client.commands = new Collection();


client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (message.content.startsWith("!ping")) {
    await message.reply("pong");
  }
});

// client.on("interactionCreate", async (interaction) => {
//     if(!interaction.isChatInputCommand()) return;

//     if(interaction.commandName === "create_pug") {
//         const token = Math.random().toString(36).substring(2,8).toUpperCase();

//         await interaction.reply(`Pug created token: ${token}. \nPlease reply with captains.`);
//         try{
//             await axios.post(`${process.env.BACKEND_URL}/create`, {
//                 token,
//                 createBy: interaction.user.id,
//             })
//         } catch(error){
//             console.error(error);
//             await interaction.followUp("Failed to create pug in backend.");
//         }
//     }
// })

