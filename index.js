const express = require('express');
const nacl    = require('tweetnacl');
const fs      = require('fs');
const { REST, Routes } = require('discord.js');
require('dotenv').config();

const TOKEN      = process.env.DISCORD_TOKEN;
const CLIENT_ID  = process.env.CLIENT_ID;
const PUBLIC_KEY = process.env.PUBLIC_KEY;

const OFFICER_ROLES = ['junior officer perms', 'officer perms'];
const POINTS_FILE   = './points.json';

const rest = new REST({ version: '10' }).setToken(TOKEN);

function loadPoints() {
  try { return JSON.parse(fs.readFileSync(POINTS_FILE, 'utf8')); }
  catch { return {}; }
}
function savePoints(data) { fs.writeFileSync(POINTS_FILE, JSON.stringify(data, null, 2)); }
function getGuildPoints(guildId) { return loadPoints()[guildId] || {}; }
function setGuildPoints(guildId, guildData) { const d = loadPoints(); d[guildId] = guildData; savePoints(d); }

const commands = [
  { name: 'ping', description: '🏓 Check if the bot is online' },
  {
    name: 'announce', description: '📢 DM an event announcement to members',
    default_member_permissions: '8',
    options: [
      { type: 3, name: 'message', description: 'The message to send (use \\n for new lines)', required: true, max_length: 1800 },
      { type: 3, name: 'role', description: 'Role name to target (leave blank to DM everyone)', required: false },
    ],
  },
  {
    name: 'points', description: '⭐ Manage member points',
    options: [
      { type: 1, name: 'add', description: 'Add points to a member (Officer only)', options: [{ type: 6, name: 'user', description: 'The member to give points to', required: true }, { type: 4, name: 'amount', description: 'Number of points to add', required: true, min_value: 1 }] },
      { type: 1, name: 'remove', description: 'Remove points from a member (Officer only)', options: [{ type: 6, name: 'user', description: 'The member to remove points from', required: true }, { type: 4, name: 'amount', description: 'Number of points to remove', required: true, min_value: 1 }] },
      { type: 1, name: 'check', description: "Check a member's points", options: [{ type: 6, name: 'user', description: 'The member to check (defaults to you)', required: false }] },
    ],
  },
  { name: 'leaderboard', description: '🏆 Show the top 10 members by points' },
];

async function registerCommands() {
  try {
    console.log('Registering slash commands...');
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('✅ Slash commands registered globally.');
  } catch (err) { console.error('Failed to register commands:', err.message); }
}

function verifyRequest(req) {
  const sig = req.headers['x-signature-ed25519'];
  const timestamp = req.headers['x-signature-timestamp'];
  if (!sig || !timestamp) return false;
  try {
    return nacl.sign.detached.verify(Buffer.from(timestamp + req.rawBody), Buffer.from(sig, 'hex'), Buffer.from(PUBLIC_KEY, 'hex'));
  } catch { return false; }
}

async function hasOfficerRole(guildId, memberRoleIds) {
  try {
    const guildRoles = await rest.get(Routes.guildRoles(guildId));
    return guildRoles.some(r => OFFICER_ROLES.includes(r.name.toLowerCase()) && memberRoleIds.includes(r.id));
  } catch { return false; }
}

async function buildLeaderboard(guildId) {
  let guildData = getGuildPoints(guildId);
  try {
    const members = await rest.get(Routes.guildMembers(guildId), { query: new URLSearchParams({ limit: '1000' }) });
    const memberIds = new Set(members.map(m => m.user.id));
    let changed = false;
    for (const userId of Object.keys(guildData)) { if (!memberIds.has(userId)) { delete guildData[userId]; changed = true; } }
    if (changed) setGuildPoints(guildId, guildData);
  } catch {}
  return Object.entries(guildData).sort((a, b) => b[1].points - a[1].points).slice(0, 10);
}

async function handlePointsAdd(interaction) {
  const guildId = interaction.guild_id;
  const memberRoles = interaction.member.roles;
  const options = interaction.data.options[0].options;
  const targetId = options.find(o => o.name === 'user').value;
  const amount = options.find(o => o.name === 'amount').value;
  if (!(await hasOfficerRole(guildId, memberRoles))) return '❌ You need the **Junior Officer Perms** or **Officer Perms** role to add points.';
  const guildData = getGuildPoints(guildId);
  const username = interaction.data.resolved?.users?.[targetId]?.username || `User ${targetId}`;
  if (!guildData[targetId]) guildData[targetId] = { username, points: 0 };
  guildData[targetId].username = username;
  guildData[targetId].points += amount;
  setGuildPoints(guildId, guildData);
  const newTotal = guildData[targetId].points;
  return `✅ Added **${amount}** point${
