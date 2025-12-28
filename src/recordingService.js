import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import prism from "prism-media";
import { EndBehaviorType } from "@discordjs/voice";
import sessions from "./sessionStore.js";
import { TARGET_TEXT_CHANNEL_ID } from "./config.js";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function startRecording(guildId, channelId, connection) {
  const startTime = Date.now();
  const sessionDir = path.join(
    __dirname,
    "..",
    "recordings",
    `session-${guildId}-${startTime}`
  );
  fs.mkdirSync(sessionDir, { recursive: true });

  sessions.set(guildId, {
    startTime,
    channelId,
    sessionDir,
    users: new Map(),
  });

  connection.receiver.speaking.on("start", (userId) => {
    const session = sessions.get(guildId);
    if (!session) return;

    if (!session.users.has(userId)) {
      const userStreamPath = path.join(
        session.sessionDir,
        `user-${userId}.pcm`
      );
      const writeStream = fs.createWriteStream(userStreamPath);

      const opusStream = connection.receiver.subscribe(userId, {
        end: {
          behavior: EndBehaviorType.Manual,
        },
      });

      const decoder = new prism.opus.Decoder({
        rate: 48000,
        channels: 2,
        frameSize: 960,
      });

      let lastWriteTime = Date.now();

      const initialSilenceDuration = lastWriteTime - session.startTime;
      if (initialSilenceDuration > 0) {
        const silenceBytes = Math.floor(
          (initialSilenceDuration / 1000) * 48000 * 2 * 2
        );
        writeStream.write(Buffer.alloc(silenceBytes));
      }

      opusStream.pipe(decoder);

      decoder.on("data", (chunk) => {
        const now = Date.now();
        const gap = now - lastWriteTime - 20;

        if (gap > 40) {
          const silenceBytes = Math.floor((gap / 1000) * 48000 * 2 * 2);
          if (silenceBytes > 0) {
            writeStream.write(Buffer.alloc(silenceBytes));
          }
        }

        writeStream.write(chunk);
        lastWriteTime = now;
      });

      opusStream.on("error", (err) =>
        console.error(`Opus stream error for ${userId}:`, err)
      );
      decoder.on("error", (err) =>
        console.error(`Decoder error for ${userId}:`, err)
      );

      session.users.set(userId, {
        stream: writeStream,
        decoder,
        subscription: opusStream,
      });
    }
  });
}

async function stopRecording(guildId, client) {
  const session = sessions.get(guildId);
  if (!session) return;

  sessions.delete(guildId);

  const inputFiles = [];

  for (const [userId, userSession] of session.users) {
    userSession.subscription.destroy();
    userSession.decoder.destroy();
    userSession.stream.end();

    const pcmPath = path.join(session.sessionDir, `user-${userId}.pcm`);
    inputFiles.push(pcmPath);
  }

  await new Promise((resolve) => setTimeout(resolve, 1000));

  if (inputFiles.length === 0) {
    console.log("No recordings found for this session.");
    return;
  }

  const outputPath = path.join(session.sessionDir, "recording.mp3");

  const args = [];
  inputFiles.forEach((file) => {
    args.push("-f", "s16le", "-ar", "48000", "-ac", "2", "-i", file);
  });

  args.push(
    "-filter_complex",
    `amix=inputs=${inputFiles.length}:duration=longest`
  );
  args.push(outputPath);

  console.log("Processing recording...");

  const ffmpeg = spawn("ffmpeg", args);

  ffmpeg.stderr.on("data", (data) => {});

  ffmpeg.on("close", async (code) => {
    if (code === 0) {
      console.log("Recording processed successfully.");
      try {
        const channel = await client.channels.fetch(TARGET_TEXT_CHANNEL_ID);
        if (channel) {
          await channel.send({
            content: `Recording for session in <#${session.channelId}>`,
            files: [outputPath],
          });
        }
      } catch (err) {
        console.error("Failed to send recording:", err);
      }
    } else {
      console.error(`FFmpeg exited with code ${code}`);
    }
  });
}

export { startRecording, stopRecording };
