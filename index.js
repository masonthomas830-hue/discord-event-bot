const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
require('dotenv').config();

// ─── Config ───────────────────────────────────────────────────────────────────
const TOKEN       = process.env.DISCORD_TOKEN;
const CLIENT_ID   = process.env.CLIENT_ID;
const TARGET_ROLE = 'Paradis Clan'; // Role name to target for role-only blasts

// ─── Client Setup ─────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

// ─── Register Slash Commands ──────────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName('announce')
    .setDescription('📢 DM an event announcement to members')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(opt =>
      opt.setName('message')
        .setDescription('The message to send (supports newlines with \\n)')
        .setRequired(true)
        .setMaxLength(1800)
    )
    .addStringOption(opt =>
      opt.setName('target')
        .setDescription('Who to send the DM to')
        .setRequired(true)
        .addChoices(
          { name: '🌐 Everyone in the server', value: 'everyone' },
          { name: '🛡️ Paradis Clan role only',  value: 'role'     },
        )
    )
    .toJSON(),
];

async function registerCommands(guildId) {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    console.log('Registering slash commands...');
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guildId), { body: commands });
    console.log('✅ Slash commands registered.');
  } catch (err) {
    console.error('Failed to register commands:', err);
  }
}

// ─── Bot Ready ────────────────────────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  for (const guild of client.guilds.cache.values()) {
    await registerCommands(guild.id);
  }
});

// ─── Handle /announce ─────────────────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'announce') return;

  await interaction.deferReply({ ephemeral: true });

  const rawMessage = interaction.options.getString('message').replace(/\\n/g, '\n');
  const target     = interaction.options.getString('target');
  const guild      = interaction.guild;

  // Fetch all members
  await guild.members.fetch();

  let members;

  if (target === 'everyone') {
    members = guild.members.cache.filter(m => !m.user.bot);
  } else {
    // Find the Paradis Clan role (case-insensitive)
    const role = guild.roles.cache.find(r => r.name.toLowerCase() === TARGET_ROLE.toLowerCase());
    if (!role) {
      return interaction.editReply(`❌ Could not find a role named **${TARGET_ROLE}**. Make sure it exists.`);
    }
    members = guild.members.cache.filter(m => !m.user.bot && m.roles.cache.has(role.id));
  }

  if (members.size === 0) {
    return interaction.editReply('❌ No eligible members found to DM.');
  }

  // ── Send DMs ──────────────────────────────────────────────────────────────
  let sent = 0, failed = 0;

  const formattedMessage = [
    `📣 **Announcement from ${guild.name}**`,
    '',
    rawMessage,
    '',
    `— ${interaction.user.displayName}`,
  ].join('\n');

  for (const member of members.values()) {
    try {
      await member.send(formattedMessage);
      sent++;
      // Small delay to avoid Discord rate limits
      await sleep(300);
    } catch {
      // Member has DMs disabled — silently skip
      failed++;
    }
  }

  const targetLabel = target === 'everyone' ? 'all server members' : `**${TARGET_ROLE}** members`;

  await interaction.editReply(
    `✅ Announcement sent to ${targetLabel}!\n` +
    `📬 **${sent}** delivered · ❌ **${failed}** couldn't be reached (DMs disabled)`
  );

  // Also log in the channel the command was used in
  console.log(`[${new Date().toISOString()}] /announce by ${interaction.user.tag} → ${sent} sent, ${failed} failed`);
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Launch ───────────────────────────────────────────────────────────────────
client.login(TOKEN);
