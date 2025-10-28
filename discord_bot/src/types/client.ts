import { Client, Collection, GatewayIntentBits } from 'discord.js';
import type { Command } from './command'

export class ChivClient extends Client {
	public commands: Collection<string, Command>;

	constructor() {
		super({ intents: [
			GatewayIntentBits.Guilds,
			GatewayIntentBits.MessageContent,
   		 	GatewayIntentBits.GuildMembers,
    		GatewayIntentBits.GuildMessages,
    		GatewayIntentBits.MessageContent,
		] });
		this.commands = new Collection();
	}
}