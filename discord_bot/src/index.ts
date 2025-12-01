import dotenv from "dotenv";
dotenv.config();
import { 
  Events, ChatInputCommandInteraction,  Interaction 
} from "discord.js";
import { handleFinishPugSelect } from "./interacctions/finish_pug_select";
import fs from "fs";
import path from "path";
import { ChivClient } from "./types/client";
import { connectRedisAndLoad, redisClient } from "./redis";
import { handleCaptainSelection } from "./interacctions/create_pug_select_captains"
import {handleConfirmCaptains} from "./interacctions/create_pug_confirm_button";
import {handleFinishPugButton} from "./interacctions/finish_pug_buttons";
import {handleRevertPugSelect} from "./interacctions/revert_pug_select";
import {handleCancelPugSelection} from "./interacctions/cancel_pug_select_pug";

const client = new ChivClient(); 

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


client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (message.content.startsWith("!ping")) {
    await message.reply("pong");
  }
});

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  try {
    console.log("\nInteraction triggered:", {
      type: interaction.type,
      isStringSelect: interaction.isStringSelectMenu?.(),
      customId: (interaction as any).customId,
      commandName: (interaction as any).commandName,
    });

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


    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      await command.execute(interaction as ChatInputCommandInteraction);
      return;
    }
    if (interaction.isStringSelectMenu()) {
      const id = interaction.customId;

      if (id.startsWith("select_captain_")) {
        await handleCaptainSelection(interaction);

      } else if (id === "finish_pug_select") {
        await handleFinishPugSelect(interaction);

      } else if (id === "cancel_pug_select") {
        await handleCancelPugSelection(interaction); // <--- FIXED
      } 
      
      else if (id === "revert_pug_select") {
        await handleRevertPugSelect(interaction);
      }

      return;
    }


  if (interaction.isButton()) {
    const id = interaction.customId;

    if (id.includes(":confirm_captains")) {
      console.log("Confirm captains button clicked");
      await handleConfirmCaptains(interaction);
    }
    if (interaction.customId.startsWith("finish_team1_") || interaction.customId.startsWith("finish_team2_")) {
      await handleFinishPugButton(interaction);
    }
  }

  } catch (error) {
    console.error("Error handling interaction:", error);

    if (
      interaction.isChatInputCommand() ||
      interaction.isButton() ||
      interaction.isStringSelectMenu()
    ) {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: "Error handling interaction.", flags: 64});
      } else {
        await interaction.reply({ content: "Error handling interaction.", flags: 64 });
      }
    }
  }
});

client.login(process.env.DISCORD_TOKEN);