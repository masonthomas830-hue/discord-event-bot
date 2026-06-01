const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
require('dotenv').config();

const TOKEN     = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

const commands = [
  new SlashCommandBuilder()
    .setName('announce')
    .setDescription('📢 DM an event announcement to members')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(opt =>
      opt.setName('message')
        .setDescription('The message to send (use \\n for line breaks)')
        .setRequired(true)
        .setMaxLength(1800)
    )
    .addRoleOption(opt =>
      opt.setName('role')
        .setDescription('Pick a role to DM — leave empty to DM everyone')
        .setRequired(false)
    )
    .toJSON(),
];

async function registerCommands(guildId) {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guildId), { body: commands });
    console.log(`✅ Commands registered for guild ${guildId}`);
  } catch (err) {
    console.error('Failed to register commands:', err);
  }
}

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  for (const guild of client.guilds.cache.values()) {
    await registerCommands(guild.id);
  }
});

client.on('interactionCreate', (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'announce') return;
  handleAnnounce(interaction);
});

async function handleAnnounce(interaction) {
  // Reply FIRST before anything else
  await interaction.reply({ content: '📨 Sending DMs, please wait...', ephemeral: true });

  const rawMessage = interaction.options.getString('message').replace(/\\n/g, '\n');
  const role = interaction.options.getRole('role');
  const guild = interaction.guild;

  await guild.members.fetch();

  const members = guild.members.cache.filter(m => {
    if (m.user.bot) return false;
    if (role) return m.roles.cache.has(role.id);
    return true;
  });

  if (members.size === 0) {
    return interaction.editReply('❌ No eligible members found.');
  }

  const formattedMessage = [
    `📣 **Announcement from ${guild.name}**`,
    '',
    rawMessage,
    '',
    `— ${interaction.user.displayName}`,
  ].join('\n');

  let sent = 0, failed = 0;

  for (const member of members.values()) {
    try {
      await member.send(formattedMessage);
      sent++;
      await sleep(300);
    } catch {
      failed++;
    }
  }

  const targetLabel = role ? `**${role.name}** members` : 'all server members';
  await interaction.editReply(
    `✅ Done! Sent to ${targetLabel}.\n📬 **${sent}** delivered · ❌ **${failed}** couldn't be reached`
  );
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

client.login(TOKEN);
