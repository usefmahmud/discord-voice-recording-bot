import dotenv from "dotenv";
dotenv.config();

export const BOT_TOKEN = process.env.BOT_TOKEN;
export const TARGET_TEXT_CHANNEL_ID = process.env.TARGET_TEXT_CHANNEL_ID;

if (!BOT_TOKEN) {
  throw new Error("Missing BOT_TOKEN in .env file");
}
