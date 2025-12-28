import { Client, GatewayIntentBits } from "discord.js";
import { BOT_TOKEN } from "./src/config.js";
import { checkAndJoin, checkAndLeave } from "./src/voiceService.js";
import { stopRecording } from "./src/recordingService.js";
import sessions from "./src/sessionStore.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
  ],
});

process.on("SIGINT", async () => {
  console.log("Shutting down...");
  for (const guildId of sessions.keys()) {
    await stopRecording(guildId, client);
  }
  client.destroy();
  process.exit(0);
});

client.on("ready", () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on("voiceStateUpdate", async (oldState, newState) => {
  if (newState.member.user.bot) return;

  const channel = newState.channel || oldState.channel;
  if (!channel) return;

  if (newState.channelId && !oldState.channelId) {
    await checkAndJoin(newState.channel);
  } else if (
    newState.channelId &&
    oldState.channelId &&
    newState.channelId !== oldState.channelId
  ) {
    await checkAndLeave(oldState.channel);
    await checkAndJoin(newState.channel);
  } else if (!newState.channelId && oldState.channelId) {
    await checkAndLeave(oldState.channel);
  }
});

client.login(BOT_TOKEN);
