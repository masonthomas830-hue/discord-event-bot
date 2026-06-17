const express = require('express');
const nacl    = require('tweetnacl');
const fs      = require('fs');
const { REST, Routes } = require('discord.js');
require('dotenv').config();

// ─── Config ───────────────────────────────────────────────────────────────────
const TOKEN      = process.env.DISCORD_TOKEN;
const CLIENT_ID  = process.env.CLIENT_ID;
const PUBLIC_KEY = process.env.PUBLIC_KEY;

const OFFICER_ROLES   = ['junior officer', 'officer'];
const POINTS_FILE     = './points.json';

const rest = new REST({ version: '10' }).setToken(TOKEN);

// ─── Points Storage ───────────────────────────────────────────────────────────
function loadPoints() {
  try {
    return JSON.parse(fs.readFileSync(POINTS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function savePoints(data) {
  fs.writeFileSync(POINTS_FILE, JSON.stringify(data, null, 2));
}

function getGuildPoints(guildId) {
  const data = loadPoints();
  return data[guildId] || {};
}

function setGuildPoints(guildId, guildData) {
  const data = loadPoints();
  data[guildId] = guildData;
  savePoints(data);
}

// ─── Slash Command Definitions ────────────────────────────────────────────────
const commands = [
  {
    name: 'ping',
    description: '🏓 Check if the bot is online',
  },
  {
    name: 'announce',
    description: '📢 DM an event announcement to members',
    default_member_permissions: '8', // Administrator
    options: [
      {
        type: 3,
        name: 'message',
        description: 'The message to send (use \\n for new lines)',
        required: true,
        max_length: 1800,
      },
      {
        type: 3,
        name: 'role',
        description: 'Role name to target (leave blank to DM everyone)',
        required: false,
      },
    ],
  },
  {
    name: 'points',
    description: '⭐ Manage member points',
    options: [
      {
        type: 1, // SUB_COMMAND
        name: 'add',
        description: 'Add points to a member (Officer only)',
        options: [
          { type: 6, name: 'user',   description: 'The member to give points to', required: true },
          { type: 4, name: 'amount', description: 'Number of points to add',       required: true, min_value: 1 },
        ],
      },
      {
        type: 1,
        name: 'remove',
        description: 'Remove points from a member (Officer only)',
        options: [
          { type: 6, name: 'user',   description: 'The member to remove points from', required: true },
          { type: 4, name: 'amount', description: 'Number of points to remove',        required: true, min_value: 1 },
        ],
      },
      {
        type: 1,
        name: 'check',
        description: 'Check a member\'s points',
        options: [
          { type: 6, name: 'user', description: 'The member to check (defaults to you)', required: false },
        ],
      },
    ],
  },
  {
    name: 'leaderboard',
    description: '🏆 Show the top 10 members by points',
  },
];

// ─── Register Commands Globally ───────────────────────────────────────────────
async function registerCommands() {
  try {
    console.log('Registering slash commands...');
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('✅ Slash commands registered globally.');
  } catch (err) {
    console.error('Failed to register commands:', err.message);
  }
}

// ─── Signature Verification ───────────────────────────────────────────────────
function verifyRequest(req) {
  const sig       = req.headers['x-signature-ed25519'];
  const timestamp = req.headers['x-signature-timestamp'];
  if (!sig || !timestamp) return false;
  try {
    return nacl.sign.detached.verify(
      Buffer.from(timestamp + req.rawBody),
      Buffer.from(sig, 'hex'),
      Buffer.from(PUBLIC_KEY, 'hex')
    );
  } catch {
    return false;
  }
}

// ─── Role Check ───────────────────────────────────────────────────────────────
async function hasOfficerRole(guildId, memberRoleIds) {
  try {
    const guildRoles = await rest.get(Routes.guildRoles(guildId));
    return guildRoles.some(
      r => OFFICER_ROLES.includes(r.name.toLowerCase()) && memberRoleIds.includes(r.id)
    );
  } catch {
    return false;
  }
}

// ─── Leaderboard Builder (cleans up members who left) ────────────────────────
async function buildLeaderboard(guildId) {
  let guildData = getGuildPoints(guildId);

  // Fetch current members and remove anyone who has left
  try {
    const members  = await rest.get(Routes.guildMembers(guildId), {
      query: new URLSearchParams({ limit: '1000' }),
    });
    const memberIds = new Set(members.map(m => m.user.id));
    let changed = false;

    for (const userId of Object.keys(guildData)) {
      if (!memberIds.has(userId)) {
        delete guildData[userId];
        changed = true;
      }
    }
    if (changed) setGuildPoints(guildId, guildData);
  } catch {
    // If we can't fetch members, skip cleanup and show what we have
  }

  return Object.entries(guildData)
    .sort((a, b) => b[1].points - a[1].points)
    .slice(0, 10);
}

// ─── Points Handlers ─────────────────────────────────────────────────────────
async function handlePointsAdd(interaction) {
  const guildId      = interaction.guild_id;
  const memberRoles  = interaction.member.roles;
  const options      = interaction.data.options[0].options;
  const targetUser   = options.find(o => o.name === 'user');
  const amountOpt    = options.find(o => o.name === 'amount');
  const targetId     = targetUser.value;
  const amount       = amountOpt.value;

  if (!(await hasOfficerRole(guildId, memberRoles))) {
    return '❌ You need the **Junior Officer** or **Officer** role to add points.';
  }

  const guildData = getGuildPoints(guildId);

  // Resolve username from interaction resolved data
  const resolvedUser = interaction.data.resolved?.users?.[targetId];
  const username     = resolvedUser?.username || `User ${targetId}`;

  if (!guildData[targetId]) {
    guildData[targetId] = { username, points: 0 };
  }
  guildData[targetId].username = username;
  guildData[targetId].points  += amount;

  setGuildPoints(guildId, guildData);

  const newTotal = guildData[targetId].points;
  console.log(`[${new Date().toISOString()}] +${amount} points → ${username} (total: ${newTotal})`);
  return `✅ Added **${amount}** point${amount !== 1 ? 's' : ''} to <@${targetId}>. They now have **${newTotal}** point${newTotal !== 1 ? 's' : ''}.`;
}

async function handlePointsRemove(interaction) {
  const guildId     = interaction.guild_id;
  const memberRoles = interaction.member.roles;
  const options     = interaction.data.options[0].options;
  const targetUser  = options.find(o => o.name === 'user');
  const amountOpt   = options.find(o => o.name === 'amount');
  const targetId    = targetUser.value;
  const amount      = amountOpt.value;

  if (!(await hasOfficerRole(guildId, memberRoles))) {
    return '❌ You need the **Junior Officer** or **Officer** role to remove points.';
  }

  const guildData = getGuildPoints(guildId);

  if (!guildData[targetId] || guildData[targetId].points === 0) {
    return `❌ <@${targetId}> has no points to remove.`;
  }

  const resolvedUser = interaction.data.resolved?.users?.[targetId];
  const username     = resolvedUser?.username || guildData[targetId]?.username || `User ${targetId}`;

  guildData[targetId].username = username;
  guildData[targetId].points   = Math.max(0, guildData[targetId].points - amount);

  setGuildPoints(guildId, guildData);

  const newTotal = guildData[targetId].points;
  console.log(`[${new Date().toISOString()}] -${amount} points → ${username} (total: ${newTotal})`);
  return `✅ Removed **${amount}** point${amount !== 1 ? 's' : ''} from <@${targetId}>. They now have **${newTotal}** point${newTotal !== 1 ? 's' : ''}.`;
}

function handlePointsCheck(interaction) {
  const guildId  = interaction.guild_id;
  const options  = interaction.data.options[0].options || [];
  const userOpt  = options.find(o => o.name === 'user');
  const targetId = userOpt ? userOpt.value : interaction.member.user.id;

  const guildData = getGuildPoints(guildId);
  const entry     = guildData[targetId];
  const points    = entry ? entry.points : 0;

  return `⭐ <@${targetId}> has **${points}** point${points !== 1 ? 's' : ''}.`;
}

async function handleLeaderboard(interaction) {
  const guildId = interaction.guild_id;
  const top     = await buildLeaderboard(guildId);

  if (top.length === 0) {
    return '📊 No points have been awarded yet.';
  }

  const medals = ['🥇', '🥈', '🥉'];
  const lines  = top.map(([userId, data], i) => {
    const medal  = medals[i] || `**#${i + 1}**`;
    const pts    = data.points;
    return `${medal} <@${userId}> — **${pts}** point${pts !== 1 ? 's' : ''}`;
  });

  return `🏆 **Points Leaderboard**\n\n${lines.join('\n')}`;
}

// ─── Announce Handler ─────────────────────────────────────────────────────────
async function handleAnnounce(interaction) {
  const guildId    = interaction.guild_id;
  const rawMessage = interaction.data.options.find(o => o.name === 'message').value.replace(/\\n/g, '\n');
  const roleOption = interaction.data.options.find(o => o.name === 'role');
  const roleName   = roleOption ? roleOption.value : null;
  const senderName = interaction.member?.nick || interaction.member?.user?.username || 'Admin';

  try {
    const members = await rest.get(Routes.guildMembers(guildId), {
      query: new URLSearchParams({ limit: '1000' }),
    });

    let targets;
    let targetLabel;

    if (!roleName) {
      targets     = members.filter(m => !m.user.bot);
      targetLabel = 'all server members';
    } else {
      const roles = await rest.get(Routes.guildRoles(guildId));
      const role  = roles.find(r => r.name.toLowerCase() === roleName.toLowerCase());
      if (!role) {
        await patchFollowUp(interaction, `❌ Could not find a role named **${roleName}**. Check the spelling and try again.`);
        return;
      }
      targets     = members.filter(m => !m.user.bot && m.roles.includes(role.id));
      targetLabel = `**${role.name}** members`;
    }

    if (targets.length === 0) {
      await patchFollowUp(interaction, '❌ No eligible members found to DM.');
      return;
    }

    const guild = await rest.get(Routes.guild(guildId));

    const formattedMessage = [
      `📣 **Announcement from ${guild.name}**`,
      '',
      rawMessage,
      '',
      `— ${senderName}`,
    ].join('\n');

    let sent = 0, failed = 0;

    for (const member of targets) {
      try {
        const dm = await rest.post(Routes.userChannels(), {
          body: { recipient_id: member.user.id },
        });
        await rest.post(Routes.channelMessages(dm.id), {
          body: { content: formattedMessage },
        });
        sent++;
        await sleep(300);
      } catch {
        failed++;
      }
    }

    await patchFollowUp(
      interaction,
      `✅ Announcement sent to ${targetLabel}!\n` +
      `📬 **${sent}** delivered · ❌ **${failed}** couldn't be reached (DMs disabled)`
    );

    console.log(`[${new Date().toISOString()}] /announce → ${targetLabel} → ${sent} sent, ${failed} failed`);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error in handleAnnounce:`, err.message);
    await patchFollowUp(interaction, '❌ Something went wrong. Please try again.');
  }
}

async function patchFollowUp(interaction, content) {
  try {
    await rest.patch(
      Routes.webhookMessage(CLIENT_ID, interaction.token, '@original'),
      { body: { content } }
    );
  } catch (err) {
    console.error('Failed to patch follow-up:', err.message);
  }
}

// ─── Express App ──────────────────────────────────────────────────────────────
const app = express();

app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); },
}));

app.post('/interactions', async (req, res) => {
  if (!verifyRequest(req)) {
    console.warn('❌ Invalid signature');
    return res.status(401).send('Invalid request signature');
  }

  const interaction = req.body;

  // Discord endpoint verification
  if (interaction.type === 1) {
    return res.json({ type: 1 });
  }

  // Slash commands
  if (interaction.type === 2) {
    const cmd = interaction.data.name;

    // /ping — instant reply
    if (cmd === 'ping') {
      console.log(`[${new Date().toISOString()}] /ping used`);
      return res.json({
        type: 4,
        data: { content: '🏓 Pong! Bot is online.', flags: 64 },
      });
    }

    // /announce — deferred (takes a while)
    if (cmd === 'announce') {
      res.json({ type: 5, data: { flags: 64 } });
      handleAnnounce(interaction);
      return;
    }

    // /points — instant reply for add/remove/check
    if (cmd === 'points') {
      const sub = interaction.data.options[0].name;

      let reply;
      if (sub === 'add')    reply = await handlePointsAdd(interaction);
      if (sub === 'remove') reply = await handlePointsRemove(interaction);
      if (sub === 'check')  reply = handlePointsCheck(interaction);

      return res.json({
        type: 4,
        data: { content: reply, flags: 64 },
      });
    }

    // /leaderboard — deferred (fetches members for cleanup)
    if (cmd === 'leaderboard') {
      res.json({ type: 5, data: { flags: 64 } });
      handleLeaderboard(interaction).then(content => patchFollowUp(interaction, content));
      return;
    }
  }

  res.status(400).send('Unknown interaction type');
});

app.get('/', (_req, res) => res.send('Asian Grandpa bot — online ✅'));

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`✅ HTTP interactions server listening on port ${PORT}`);
  await registerCommands();
  const domain = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : `https://your-railway-domain.up.railway.app`;
  console.log(`✅ Ready. Interactions endpoint: ${domain}/interactions`);
});
