import { Client, Collection, Events, ChatInputCommandInteraction, GatewayIntentBits, MessageFlags, REST, Routes } from "discord.js";
import { ChivClient } from "./types/client"; 
import { connectRedisAndLoad } from "./redis";
import fs from 'fs';
import path from 'path';
import dotenv from "dotenv";
import { connect } from "http2";
dotenv.config();

// const client = new Client({
//   intents: [
//     GatewayIntentBits.Guilds,
//     GatewayIntentBits.GuildMessages,
//     GatewayIntentBits.MessageContent,
//     GatewayIntentBits.GuildMembers,
//   ],
// });
const client = new ChivClient();
client.commands = new Collection();

client.once(Events.ClientReady, (readyClient) => {
	console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});
client.login(process.env.DISCORD_TOKEN);


(async () => {
  const commandsPath = path.join(__dirname, "commands");
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".ts"));

  for (const file of commandFiles) {
    const command = await import(path.join(commandsPath, file));
    client.commands.set(command.default.data.name, command.default);
  }
})();

(async () =>  (
    await connectRedisAndLoad()
))();

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (message.content.startsWith("!ping")) {
    await message.reply("pong");
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isAutocomplete()) return;
  
  if (interaction.commandName === "create_pug") {
    const focused = interaction.options.getFocused().toLowerCase();
    const members = await interaction.guild!.members.fetch();

    const filtered = members
      .filter(m => m.user.username.toLowerCase().includes(focused))
      .first(25) 
      .map(m => ({ name: m.user.username, value: m.user.id }));
    //console.log(members)

    await interaction.respond(filtered);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
	if (!interaction.isChatInputCommand()) return;
  const client = getChivClient(interaction);
  const command = client.commands.get(interaction.commandName);

	if (!command) {
		console.error(`No command matching ${interaction.commandName} was found.`);
		return;
	}

	try {
		await command.execute(interaction);
	} catch (error) {
		console.error(error);
		if (interaction.replied || interaction.deferred) {
			await interaction.followUp({
				content: 'There was an error while executing this command!',
				flags: MessageFlags.Ephemeral,
			});
		} else {
			await interaction.reply({
				content: 'There was an error while executing this command!',
				flags: MessageFlags.Ephemeral,
			});
		}
	}
});


function getChivClient(interaction: ChatInputCommandInteraction): ChivClient {
  return interaction.client as ChivClient;
}


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

