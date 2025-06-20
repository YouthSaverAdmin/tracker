const express = require("express");
const axios = require("axios");
const cron = require("node-cron");
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, InteractionType } = require("discord.js");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3001;


// Load environment variables
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

// CORS middleware
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

// Helper to format stock items
function formatItems(obj) {
  return Object.entries(obj || {})
    .map(([key, val]) => `• **${key}**: ${val}`)
    .join('\n');
}

// Send update to Discord via webhook
async function sendToDiscord() {
  try {
    const ts = Date.now();

    const [stockRes, eggRes, weatherRes] = await Promise.all([
      axios.get(`https://growagardenstock.com/api/stock?type=gear-seeds&ts=${ts}`),
      axios.get(`https://growagardenstock.com/api/stock?type=egg&ts=${ts}`),
      axios.get(`https://growagardenstock.com/api/stock/weather?ts=${ts}&_=${ts}`)
    ]);

    const stock = stockRes.data;
    const eggs = eggRes.data;
    const weather = weatherRes.data;

    const message = `
🌱 **Garden Stock Update**

**🧰 Gear**
${formatItems(stock.gear)}

**🌾 Seeds**
${formatItems(stock.seeds)}

**🥚 Eggs**
${formatItems(eggs.egg)}

**🌤️ Weather**: ${weather.weather || 'Unknown'}
**🌡️ Temp**: ${weather.temp || 'N/A'}°C
    `;

    await axios.post(DISCORD_WEBHOOK_URL, { content: message });
    console.log("✅ Auto-update sent to Discord at", new Date().toLocaleTimeString());
  } catch (err) {
    console.error("❌ Failed to send to Discord:", err.message);
  }
}

// Schedule auto-update every 5 minutes
cron.schedule("*/5 * * * *", () => {
  console.log("⏱️ Scheduled auto-update triggered...");
  sendToDiscord();
});

// Manual trigger route
app.get("/api/send", async (req, res) => {
  await sendToDiscord();
  res.json({ success: true, message: "Sent to Discord!" });
});

// API for frontend use
app.get("/api/stock", async (req, res) => {
  try {
    const ts = Date.now();
    const response = await axios.get(`https://growagardenstock.com/api/stock?type=gear-seeds&ts=${ts}`);
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch stock data." });
  }
});

app.get("/api/egg", async (req, res) => {
  try {
    const ts = Date.now();
    const response = await axios.get(`https://growagardenstock.com/api/stock?type=egg&ts=${ts}`);
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch egg data." });
  }
});

app.get("/api/weather", async (req, res) => {
  try {
    const ts = Date.now();
    const response = await axios.get(`https://growagardenstock.com/api/stock/weather?ts=${ts}&_=${ts}`);
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch weather data." });
  }
});

// Start Express server
app.listen(PORT, () => {
  console.log(`🚀 Proxy server running at http://localhost:${PORT}`);
});


// ========== DISCORD BOT + SLASH COMMAND ==========

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once("ready", async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);

  // Register /stock command globally
  const rest = new REST({ version: "10" }).setToken(DISCORD_BOT_TOKEN);

  try {
    console.log("📦 Registering slash command...");
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, '1031935299783245964'),
      {
        body: [
          new SlashCommandBuilder()
            .setName("stock")
            .setDescription("Get the latest garden gear, seeds, eggs, and weather.")
            .toJSON()
        ]
      }
    );
    console.log("✅ Slash command /stock registered.");
  } catch (error) {
    console.error("❌ Failed to register slash command:", error);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.type !== InteractionType.ApplicationCommand) return;
  if (interaction.commandName === "stock") {
    try {
      await interaction.deferReply();

      const ts = Date.now();
      const [stockRes, eggRes, weatherRes] = await Promise.all([
        axios.get(`https://growagardenstock.com/api/stock?type=gear-seeds&ts=${ts}`),
        axios.get(`https://growagardenstock.com/api/stock?type=egg&ts=${ts}`),
        axios.get(`https://growagardenstock.com/api/stock/weather?ts=${ts}&_=${ts}`)
      ]);

      const stock = stockRes.data;
      const eggs = eggRes.data;
      const weather = weatherRes.data;

      const msgContent = `
🌱 **Garden Stock Update**

**🧰 Gear**
${formatItems(stock.gear)}

**🌾 Seeds**
${formatItems(stock.seeds)}

**🥚 Eggs**
${formatItems(eggs.egg)}

**🌤️ Weather**: ${weather.weather || 'Unknown'}
**🌡️ Temp**: ${weather.temp || 'N/A'}°C
      `;

      await interaction.editReply(msgContent);
      console.log("📤 Responded to /stock");
      
    } catch (err) {
      console.error("❌ Error during /stock:", err.message);
      await interaction.editReply("❌ Failed to fetch stock/weather data.");
    }
  }
});

client.login(DISCORD_BOT_TOKEN);
