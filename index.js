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
    .addStringOption(opt =>
      opt.setName('target')
        .setDescription('Who to send the DM to')
        .setRequired(true)
        .addChoices(
          { name: '🌐 Everyone in the server', value: 'everyone' },
          { name: '🛡️ Specific role (use the role option below)', value: 'role' },
        )
    )
    .addRoleOption(opt =>
      opt.setName('role')
        .setDescription('Pick a role to DM (only used if target is "Specific role")')
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

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'announce') return;

  await interaction.reply({ content: '📨 Sending DMs...', ephemeral: true });

  const rawMessage = interaction.options.getString('message').replace(/\\n/g, '\n');
  const target     = interaction.options.getString('target');
  const guild      = interaction.guild;

  try {
    await guild.members.fetch();
  } catch (err) {
    return interaction.editReply('❌ Failed to fetch members. Make sure the bot has the Server Members Intent enabled.');
  }

  let members;

  if (target === 'everyone') {
    members = guild.members.cache.filter(m => !m.user.bot);
  } else {
    const role = interaction.options.getRole('role');
    if (!role) {
      return interaction.editReply('❌ Please pick a role using the **role** option when using "Specific role" target.');
    }
    members = guild.members.cache.filter(m => !m.user.bot && m.roles.cache.has(role.id));
  }

  if (members.size === 0) {
    return interaction.editReply('❌ No eligible members found to DM.');
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

  const targetLabel = target === 'everyone'
    ? 'all server members'
    : `**${interaction.options.getRole('role').name}** members`;

  await interaction.editReply(
    `✅ Done! Announcement sent to ${targetLabel}.\n📬 **${sent}** delivered · ❌ **${failed}** couldn't be reached (DMs disabled)`
  );
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

client.login(TOKEN);
