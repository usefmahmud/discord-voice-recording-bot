import {
  joinVoiceChannel,
  entersState,
  VoiceConnectionStatus,
  getVoiceConnection,
} from "@discordjs/voice";
import { startRecording, stopRecording } from "./recordingService.js";

async function checkAndJoin(channel) {
  const guildId = channel.guild.id;
  const connection = getVoiceConnection(guildId);

  if (connection) {
    return;
  }

  const members = channel.members.filter((m) => !m.user.bot);
  if (members.size > 0) {
    console.log(`Joining ${channel.name} in ${channel.guild.name}`);
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: guildId,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: false,
    });

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 20000);
      startRecording(guildId, channel.id, connection);

      connection.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
          await Promise.race([
            entersState(connection, VoiceConnectionStatus.Signalling, 5000),
            entersState(connection, VoiceConnectionStatus.Connecting, 5000),
          ]);
        } catch (error) {
          console.log("Disconnected from voice channel");
          await stopRecording(guildId, channel.client);
          connection.destroy();
        }
      });
    } catch (error) {
      console.error("Failed to join voice channel:", error);
      connection.destroy();
    }
  }
}

async function checkAndLeave(channel) {
  const guildId = channel.guild.id;
  const connection = getVoiceConnection(guildId);

  if (!connection || connection.joinConfig.channelId !== channel.id) {
    return;
  }

  const members = channel.members.filter((m) => !m.user.bot);
  if (members.size === 0) {
    console.log(`Leaving ${channel.name} in ${channel.guild.name} (empty)`);
    await stopRecording(guildId, channel.client);
    connection.destroy();
  }
}

export { checkAndJoin, checkAndLeave };
