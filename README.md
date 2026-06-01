# 📢 Discord Event Announcement Bot

DMs server members whenever you run `/announce`. Supports targeting **everyone** or only **Paradis Clan** role members.

---

## ⚡ Quick Setup

### 1. Prerequisites
- [Node.js](https://nodejs.org/) v18 or higher

### 2. Create a Discord Bot

1. Go to [https://discord.com/developers/applications](https://discord.com/developers/applications)
2. Click **New Application** → give it a name (e.g. *Event Bot*)
3. Go to **Bot** (left sidebar) → click **Add Bot**
4. Under **Token**, click **Reset Token** and copy it — save it somewhere safe
5. Scroll down to **Privileged Gateway Intents** and enable:
   - ✅ **Server Members Intent**
6. Go to **General Information** → copy your **Application ID**

### 3. Invite the Bot to Your Server

Build your invite URL:
```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=274877991936&scope=bot%20applications.commands
```
Replace `YOUR_CLIENT_ID` with your Application ID, then open it in a browser and invite the bot.

> **Required permissions included:** Send Messages, Read Message History, Use Slash Commands

### 4. Configure the Bot

```bash
# Clone / download this folder, then:
cd discord-event-bot

# Install dependencies
npm install

# Set up your environment
cp .env.example .env
```

Open `.env` and fill in:
```
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_application_id_here
```

### 5. Run the Bot

```bash
npm start
```

You'll see:
```
✅ Logged in as YourBot#1234
Registering slash commands...
✅ Slash commands registered.
```

---

## 🎮 Usage

In any channel, type:

```
/announce
```

You'll be prompted to fill in:

| Field | Description |
|-------|-------------|
| `message` | Your event announcement text. Use `\n` for line breaks. |
| `target` | `🌐 Everyone in the server` or `🛡️ Paradis Clan role only` |

Only users with **Administrator** permission can run `/announce`.

### Example message
```
🎉 GAME NIGHT TONIGHT!\n\nJoin us at 8PM EST in Voice Channel #gaming.\nBring your A-game — prizes for the winner!
```

### What members receive

```
📣 Announcement from Your Server

🎉 GAME NIGHT TONIGHT!

Join us at 8PM EST in Voice Channel #gaming.
Bring your A-game — prizes for the winner!

— YourName
```

---

## 📝 Notes

- Members with DMs disabled will be silently skipped (the bot reports how many failed)
- A small delay is added between DMs to respect Discord's rate limits
- Slash commands are registered per-server (guild) so they appear instantly

---

## 🛠 Customization

| What | Where |
|------|-------|
| Change the role name from "Paradis Clan" | `index.js` line 8: `TARGET_ROLE` |
| Change the DM format/header | `index.js` → `formattedMessage` block |
| Restrict command to a specific role instead of Admins only | Change `PermissionFlagsBits.Administrator` |
