const express = require("express");
const axios = require("axios");
const dotenv = require("dotenv");
const _ = require("lodash");

dotenv.config();

const app = express();
const PORT = 3001;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

let lastData = null;

// CORS for frontend dev
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  next();
});

// Utility: clean and normalize data
function cleanData(raw) {
  const filter = obj => Object.entries(obj).filter(([_, v]) => v !== "0");

  return {
    playerName: "POOPY",
    timestamp: raw.timestamp,
    weather: filter(raw.weather),
    seeds: filter(raw.seeds),
    gear: filter(raw.gear),
    honeyEvent: filter(raw.honeyevent),
    cosmetics: filter(raw.cosmetic),
    eggs: raw.eggs || []
  };
}

// Utility: build Discord message content
function buildDiscordMessage(data, changeSummary = null) {
  const format = list => list.map(([name, qty]) => `• ${name} × ${qty}`).join("\n") || "_None_";
  const eggs = data.eggs.map(e => `• ${e.name} × ${e.quantity}`).join("\n") || "_None_";

  let content = `
🌿 **Garden Stock Update**
👤 Player: ${data.playerName}
🕒 ${new Date(data.timestamp * 1000).toLocaleString()}

🌤️ Weather: ${data.weather?.type || "Unknown"}


🌱 **Seeds**
${format(data.seeds)}

⚙️ **Gear**
${format(data.gear)}

🍯 **Honey Event**
${format(data.honeyEvent)}

🎨 **Cosmetics**
${format(data.cosmetics)}

🥚 **Eggs**
${eggs}
`.trim();

  if (changeSummary) {
    content += `

🌟 **Change Summary**
${changeSummary}
`;
  }

  return content;
}

// Utility: compare previous vs current and build summary
function getChangeSummary(prev, curr) {
  const compareList = (oldList, newList) => {
    const diff = [];
    const map = Object.fromEntries(oldList);
    for (const [name, qty] of newList) {
      const oldQty = parseInt(map[name] || "0");
      const newQty = parseInt(qty);
      const delta = newQty - oldQty;
      if (delta !== 0) {
        diff.push(`• ${name} ${delta > 0 ? "+" : ""}${delta}`);
      }
    }
    return diff;
  };

  const eggChanges = [];
  const eggMap = Object.fromEntries((prev.eggs || []).map(e => [e.name, e.quantity]));
  for (const e of curr.eggs || []) {
    const old = eggMap[e.name] || 0;
    const diff = e.quantity - old;
    if (diff !== 0) eggChanges.push(`• ${e.name} ${diff > 0 ? "+" : ""}${diff}`);
  }

  const combined = [
    ...compareList(prev.seeds, curr.seeds),
    ...compareList(prev.gear, curr.gear),
    ...compareList(prev.honeyEvent, curr.honeyEvent),
    ...compareList(prev.cosmetics, curr.cosmetics),
    ...eggChanges
  ];

  return combined.length > 0 ? combined.join("\n") : null;
}

// Discord sender
async function sendToDiscord(data, changeSummary = null) {
  if (!DISCORD_WEBHOOK_URL) return;

  try {
    await axios.post(DISCORD_WEBHOOK_URL, {
      content: buildDiscordMessage(data, changeSummary),
      username: "GardenBot",
      avatar_url: "https://cdn-icons-png.flaticon.com/512/2909/2909766.png"
    });
    console.log("✅ Sent update to Discord.");
  } catch (err) {
    console.error("❌ Failed to send Discord message:", err.message);
  }
}

// Main route
app.get("/api/stock", async (req, res) => {
  try {
    const response = await axios.get("https://www.gamersberg.com/api/grow-a-garden/stock");
    const raw = response.data?.data?.[0];
    if (!raw) throw new Error("Invalid response");

    const currentData = cleanData(raw);
    const comparable = _.omit(currentData, "timestamp");
    const previousComparable = lastData ? _.omit(lastData, "timestamp") : null;

    if (!_.isEqual(previousComparable, comparable)) {
      const summary = lastData ? getChangeSummary(lastData, currentData) : null;
      lastData = currentData;
      await sendToDiscord(currentData, summary);
    }

    res.json({ success: true, extracted: currentData });
  } catch (err) {
    console.error("❌ Error fetching data:", err.message);
    res.status(500).json({ success: false, message: "Fetch failed", error: err.message });
  }
});

// Periodic check
setInterval(() => {
  axios.get(`http://localhost:${PORT}/api/stock`)
    .then(() => console.log("🔄 Auto-check completed."))
    .catch(err => console.error("❌ Auto-check failed:", err.message));
}, 30000);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Proxy server running at http://localhost:${PORT}/api/stock`);
});
