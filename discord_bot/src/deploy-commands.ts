import {Collection, REST, Routes} from "discord.js";
import { ChivClient } from "./types/client";
import type { RESTPostAPIApplicationCommandsJSONBody } from "discord.js";
import fs from 'fs';
import path from 'path';
import dotenv from "dotenv";
dotenv.config();
const clientId = process.env.CLIENT_ID!;
const guildId = process.env.GUILD_ID!;
const token = process.env.DISCORD_TOKEN!;

const client = new ChivClient();
client.commands = new Collection();
const commands: RESTPostAPIApplicationCommandsJSONBody[] = [];


(async () => {
  const commandsPath = path.join(__dirname, "commands");
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".ts"));

  for (const file of commandFiles) {
    const commandModule = await import(path.join(commandsPath, file));
    const command = commandModule.default || Object.values(commandModule)[0];
    
    client.commands.set(command.data.name, command);
    commands.push(command.data.toJSON());
  }
})().then(async () => {
  // Construct and prepare an instance of the REST module
  const rest = new REST().setToken(token);

  try {
    console.log(`Started refreshing ${commands.length} application (/) commands.`);

    // The put method is used to fully refresh all commands in the guild with the current set
    const data: any = await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands }
    );

    console.log(`Successfully reloaded ${data.length} application (/) commands.`);
  } catch (error) {
    console.error("Error reloading commands:", error);
  }
});