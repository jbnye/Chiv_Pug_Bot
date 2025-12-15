import {Collection, REST, Routes} from "discord.js";
import { ChivClient } from "./types/client";
import type { RESTPostAPIApplicationCommandsJSONBody } from "discord.js";
import fs from 'fs';
import path from 'path';
import dotenv from "dotenv";
dotenv.config();
const clientId = process.env.CLIENT_ID!;
const token = process.env.DISCORD_TOKEN!;
const allowedGuilds = process.env.ALLOWED_GUILDS?.split(",") ?? [];


const client = new ChivClient();
client.commands = new Collection();
const commands: RESTPostAPIApplicationCommandsJSONBody[] = [];


(async () => {
  const commandsPath = path.join(__dirname, "commands");
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".ts") || file.endsWith(".js"));

  for (const file of commandFiles) {
    const commandModule = await import(path.join(commandsPath, file));
    const command = commandModule.default || Object.values(commandModule)[0];
    client.commands.set(command.data.name, command);
    commands.push(command.data.toJSON());
  }

  const rest = new REST().setToken(token);
  try {
    console.log(`Started refreshing ${commands.length} application (/) commands.`);
    const data: any = await rest.put(
      Routes.applicationCommands(clientId),
      { body: commands }
    );
    console.log(`Deployed ${data.length} global commands.`);
  } catch (error) {
    console.error("Error reloading commands:", error);
  }
})();