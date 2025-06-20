const express = require("express");
const axios = require("axios");
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, InteractionType } = require("discord.js");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3001;

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

// CORS middleware
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

// Format stock items
function formatItems(obj) {
  return Object.entries(obj || {})
    .map(([key, val]) => `• **${key}**: ${val}`)
    .join('\n');
}

// Countdown to next update
function getNextUpdateCountdown() {
  const now = new Date();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const remaining = ((5 - (minutes % 5)) * 60 - seconds);
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  return `${m}m ${s}s`;
}

// Send stock update to Discord
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

    const manilaTime = new Date().toLocaleTimeString("en-PH", { timeZone: "Asia/Manila" });
    const countdown = getNextUpdateCountdown();

    const message = `
🌱 **Garden Stock Update** *(at ${manilaTime})*

**🧰 Gear**
${formatItems(stock.gear)}

**🌾 Seeds**
${formatItems(stock.seeds)}

**🥚 Eggs**
${formatItems(eggs.egg)}

**🌤️ Weather**: ${weather.weather || 'Unknown'}
**🌡️ Temp**: ${weather.temp || 'N/A'}°C

⏳ **Next update in**: ${countdown}
    `;

    await axios.post(DISCORD_WEBHOOK_URL, { content: message });
    console.log("✅ Sent to Discord at", manilaTime);
  } catch (err) {
    console.error("❌ Failed to send to Discord:", err.message);
  }
}

// Schedule syncing at every 5-minute mark + 12 second delay
function scheduleAtExactFiveMinuteMark() {
  const now = new Date();
  const delayUntilNext5 = (5 - (now.getMinutes() % 5)) * 60 * 1000 - now.getSeconds() * 1000 - now.getMilliseconds();

  console.log(`🕓 Waiting ${Math.round(delayUntilNext5 / 1000)}s to align with next 5-min mark...`);

  setTimeout(() => {
    const buffer = 80000; 

    // First delayed update
    setTimeout(() => {
      sendToDiscord();
    }, buffer);

    // Repeat every 5 minutes
    setInterval(() => {
      setTimeout(() => {
        sendToDiscord();
      }, buffer);
    }, 5 * 60 * 1000);

  }, delayUntilNext5);
}

// ====== EXPRESS ROUTES ======

app.get("/api/send", async (req, res) => {
  await sendToDiscord();
  res.json({ success: true, message: "Sent to Discord!" });
});

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

app.listen(PORT, () => {
  console.log(`🚀 Proxy server running at http://localhost:${PORT}`);

  // Send initial update
  sendToDiscord();

  // Start scheduled syncing
  scheduleAtExactFiveMinuteMark();
});

// ====== DISCORD BOT SETUP ======

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once("ready", async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(DISCORD_BOT_TOKEN);

  try {
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
    console.log("✅ /stock command registered.");
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

      const countdown = getNextUpdateCountdown();
      const manilaTime = new Date().toLocaleTimeString("en-PH", { timeZone: "Asia/Manila" });

      const msgContent = `
🌱 **Garden Stock Update** *(at ${manilaTime})*

**🧰 Gear**
${formatItems(stock.gear)}

**🌾 Seeds**
${formatItems(stock.seeds)}

**🥚 Eggs**
${formatItems(eggs.egg)}

**🌤️ Weather**: ${weather.weather || 'Unknown'}
**🌡️ Temp**: ${weather.temp || 'N/A'}°C

⏳ **Next update in**: ${countdown}
      `;

      await interaction.editReply(msgContent);
      console.log("📤 Responded to /stock");
    } catch (err) {
      console.error("❌ Error in /stock:", err.message);
      await interaction.editReply("❌ Failed to fetch stock/weather data.");
    }
  }
});

client.login(DISCORD_BOT_TOKEN);
