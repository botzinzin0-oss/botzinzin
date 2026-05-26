require("dotenv").config();
const fs = require("fs");
const path = require("path");

const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  AttachmentBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");

const config = require("./config");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember, Partials.User]
});

const DATA_FILE = path.join(__dirname, "staff-stats.json");
const TEMP_BANS_FILE = path.join(__dirname, "temp-bans.json");
const ASSETS_DIR = path.join(__dirname, "assets");
const BRAND_IMAGE_PATH = path.join(ASSETS_DIR, config.branding?.imageFile || "zinzin.png");
const spamMap = new Map();
const joinRaidMap = new Map();
const ticketActivity = new Map();
const giveaways = new Map();

function parseGiveawayDate(input) {
  const date = new Date(input);
  if (isNaN(date.getTime())) return null;
  return date;
}

function pickWinners(participants, count) {
  const shuffled = [...participants].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function loadStats() {
  try {
    if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "{}");
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveStats(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function loadTempBans() {
  try {
    if (!fs.existsSync(TEMP_BANS_FILE)) fs.writeFileSync(TEMP_BANS_FILE, "[]");
    return JSON.parse(fs.readFileSync(TEMP_BANS_FILE, "utf8"));
  } catch {
    return [];
  }
}

function saveTempBans(data) {
  fs.writeFileSync(TEMP_BANS_FILE, JSON.stringify(data, null, 2));
}

function parseDurationMs(input) {
  if (!input) return null;
  const match = String(input).trim().match(/^(\d+)(s|m|h|d|j)$/i);
  if (!match) return null;
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, j: 86_400_000 };
  return value * multipliers[unit];
}

function formatDuration(input) {
  const ms = parseDurationMs(input);
  if (!ms) return null;
  return `${input} (${Math.round(ms / 60000)} min)`;
}

function isInviteLink(content = "") {
  return /(discord\.gg|discord\.com\/invite|discordapp\.com\/invite)\//i.test(content);
}

async function sendSecurityLog(guild, title, description) {
  const channel = getSecurityLogChannel(guild);
  if (!channel) return;
  await channel.send({ embeds: [makeEmbed(title, description)], files: brandFiles() }).catch(() => {});
}

async function resolveMember(guild, raw) {
  const id = raw?.replace(/[<@!>]/g, "");
  if (!id) return null;
  return guild.members.fetch(id).catch(() => null);
}

async function resolveUser(client, raw) {
  const id = raw?.replace(/[<@!>]/g, "");
  if (!id) return null;
  return client.users.fetch(id).catch(() => null);
}

function canModerate(executor, target) {
  if (!executor || !target) return false;
  if (target.id === executor.id) return false;
  if (target.id === executor.guild.ownerId) return false;
  return executor.roles.highest.comparePositionTo(target.roles.highest) > 0;
}

async function handleSecurity(message) {
  if (!message.guild || message.author.bot) return false;
  if (message.member?.permissions?.has(PermissionFlagsBits.Administrator)) return false;

  const security = config.security || {};
  let triggered = null;

  if (security.blockInviteLinks && isInviteLink(message.content)) {
    triggered = "Lien d’invitation Discord interdit";
  }

  if (!triggered && security.maxMentions && message.mentions.users.size >= security.maxMentions) {
    triggered = "Mentions massives";
  }

  if (!triggered && security.maxMessages && security.intervalMs) {
    const key = `${message.guild.id}:${message.author.id}`;
    const now = Date.now();
    const previous = spamMap.get(key) || [];
    const timestamps = previous.filter(ts => now - ts < security.intervalMs);
    timestamps.push(now);
    spamMap.set(key, timestamps);

    if (timestamps.length >= security.maxMessages) {
      triggered = "Spam détecté";
      spamMap.set(key, []);
    }
  }

  if (!triggered) return false;

  await message.delete().catch(() => {});

  const timeoutMs = security.timeoutMs || 60_000;
  if (message.member?.moderatable) {
    await message.member.timeout(timeoutMs, triggered).catch(() => {});
  }

  await sendSecurityLog(
    message.guild,
    "🛡️ Sécurité",
    [
      `Action : **${triggered}**`,
      `Utilisateur : ${message.author} (${message.author.id})`,
      `Salon : ${message.channel}`,
      `Sanction : timeout ${Math.round(timeoutMs / 60000)} min`
    ].join("\n")
  );

  await message.channel.send(`🛡️ ${message.author} sanctionné automatiquement : **${triggered}**.`)
    .then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000))
    .catch(() => {});

  return true;
}

function scheduleTempBan(client, entry) {
  const delay = entry.unbanAt - Date.now();
  if (delay <= 0) {
    client.guilds.fetch(entry.guildId).then(guild => {
      guild.members.unban(entry.userId, "Fin du tempban").catch(() => {});
      const entries = loadTempBans().filter(e => !(e.guildId === entry.guildId && e.userId === entry.userId));
      saveTempBans(entries);
    }).catch(() => {});
    return;
  }

  setTimeout(async () => {
    const guild = await client.guilds.fetch(entry.guildId).catch(() => null);
    if (!guild) return;
    await guild.members.unban(entry.userId, "Fin du tempban").catch(() => {});
    const entries = loadTempBans().filter(e => !(e.guildId === entry.guildId && e.userId === entry.userId));
    saveTempBans(entries);
    await sendModerationLog(guild, "tempban", "✅ Tempban terminé", `Utilisateur : <@${entry.userId}> (${entry.userId})`);
  }, Math.min(delay, 2_147_483_647));
}

function addStaffStat(userId, key) {
  const data = loadStats();

  if (!data[userId]) {
    data[userId] = {
      claimed: 0,
      closed: 0,
      recruitForms: 0
    };
  }

  data[userId][key] = (data[userId][key] || 0) + 1;
  saveStats(data);
}

function getRole(guild, roleName) {
  return guild.roles.cache.find(role => role.name === roleName);
}

function getStaffRolesArray() {
  return [
    config.staffRoles.fondateur,
    config.staffRoles.miniFondateur,
    config.staffRoles.gerantRecruteur
  ];
}

function isStaff(member) {
  if (!member || !member.roles) return false;

  return member.roles.cache.some(role =>
    getStaffRolesArray().includes(role.name)
  );
}

function canCreateGiveaway(member) {
  if (!member || !config.giveaway?.allowedRoles) return false;

  return config.giveaway.allowedRoles.some(roleName =>
    member.roles.cache.some(role => role.name === roleName)
  );
}

function getChannelByName(guild, name) {
  return guild.channels.cache.find(ch => ch.name === name);
}

function getLogChannel(guild) {
  return guild.channels.cache.get(config.channels.ticketLogsId)
    || getChannelByName(guild, config.channels.ticketLogs);
}

function getConfiguredChannel(guild, id) {
  return id ? guild.channels.cache.get(id) : null;
}

function getModerationLogChannel(guild, type = "moderation") {
  const ids = {
    kick: config.channels?.kickLogsId,
    ban: config.channels?.banLogsId,
    unban: config.channels?.banLogsId,
    tempban: config.channels?.tempbanLogsId,
    mute: config.channels?.muteLogsId,
    unmute: config.channels?.muteLogsId,
    command: config.channels?.commandLogsId
  };

  return getConfiguredChannel(guild, ids[type])
    || getConfiguredChannel(guild, config.channels?.moderationLogsId)
    || getChannelByName(guild, config.channels?.moderationLogs || "");
}

function getSecurityLogChannel(guild) {
  return getConfiguredChannel(guild, config.channels?.securityLogsId)
    || getChannelByName(guild, config.channels?.securityLogs || "")
    || getModerationLogChannel(guild);
}

async function sendModerationLog(guild, type, title, description) {
  const channel = getModerationLogChannel(guild, type);
  if (!channel) return;
  await channel.send({ embeds: [makeEmbed(title, description)], files: brandFiles() }).catch(() => {});
}

async function sendCommandLog(message, command, args) {
  const channel = getModerationLogChannel(message.guild, "command");
  if (!channel) return;
  await channel.send({
    embeds: [makeEmbed(
      "⌨️ Commande utilisée",
      [
        `Utilisateur : ${message.author} (${message.author.id})`,
        `Salon : ${message.channel}`,
        `Commande : \`${config.prefix || "!"}${command}${args.length ? " " + args.join(" ") : ""}\``
      ].join("\n")
    )],
    files: brandFiles()
  }).catch(() => {});
}

function makeEmbed(title, description) {

  const embed = new EmbedBuilder()
    .setColor(config.branding?.color || 0xff0a8a)
    .setTitle(title)
    .setDescription(description)
    .setFooter({
      text: `${config.serverName} • Zinzin Bot`
    })
    .setTimestamp();

  if (config.branding?.imageUrl) {
    embed.setImage(config.branding.imageUrl);
  }

  return embed;
}

function brandFiles() {
  if (!fs.existsSync(BRAND_IMAGE_PATH)) return [];
  return [new AttachmentBuilder(BRAND_IMAGE_PATH, { name: config.branding?.imageFile || "zinzin.png" })];
}

function escapeHtml(text = "") {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function sendLog(guild, title, description, files = []) {

  const logChannel = getLogChannel(guild);

  if (!logChannel) return;

  await logChannel.send({
    embeds: [makeEmbed(title, description)],
    files: [...brandFiles(), ...files]
  }).catch(() => {});
}

async function createHtmlTranscript(channel) {

  const messages = [];
  let lastId;

  while (true) {

    const options = { limit: 100 };

    if (lastId) {
      options.before = lastId;
    }

    const fetched = await channel.messages.fetch(options).catch(() => null);

    if (!fetched || fetched.size === 0) break;

    messages.push(...fetched.values());

    lastId = fetched.last().id;

    if (fetched.size < 100) break;
  }

  messages.sort((a, b) =>
    a.createdTimestamp - b.createdTimestamp
  );

  const rows = messages.map(msg => {

    const date =
      new Date(msg.createdTimestamp).toLocaleString("fr-FR");

    const author =
      msg.author
        ? escapeHtml(msg.author.tag)
        : "Inconnu";

    const avatar =
      msg.author?.displayAvatarURL?.() || "";

    const content =
      msg.content
        ? escapeHtml(msg.content).replace(/\n/g, "<br>")
        : "<i>[embed/fichier/sans texte]</i>";

    return `
      <div class="msg">
        <img src="${avatar}" class="avatar">
        <div>
          <div>
            <b>${author}</b>
            <span>${date}</span>
          </div>

          <div class="content">
            ${content}
          </div>
        </div>
      </div>
    `;
  }).join("\n");

  const bg =
    config.branding?.imageUrl
      ? `linear-gradient(rgba(5,10,20,.88), rgba(5,10,20,.88)), url("${escapeHtml(config.branding.imageUrl)}") center/cover fixed`
      : "#0b1220";

  const html = `
<!doctype html>
<html lang="fr">
<head>

<meta charset="utf-8">

<title>
Transcript ${escapeHtml(channel.name)}
</title>

<style>

body{
background:${bg};
color:#e6f7ff;
font-family:Arial,sans-serif;
padding:30px
}

h1{
color:#00aaff
}

.msg{
display:flex;
gap:12px;
background:#111b2e;
border:1px solid #17395c;
border-radius:12px;
padding:12px;
margin:10px 0
}

.avatar{
width:42px;
height:42px;
border-radius:50%
}

span{
color:#8bbbd8;
font-size:12px
}

.content{
margin-top:6px;
line-height:1.4
}

</style>
</head>

<body>

<h1>
Transcript — #${escapeHtml(channel.name)}
</h1>

<p>
Salon ID : ${channel.id}
<br>
Date : ${new Date().toLocaleString("fr-FR")}
</p>

${rows}

</body>
</html>
`;

  return new AttachmentBuilder(
    Buffer.from(html, "utf-8"),
    {
      name: `transcript-${channel.name}.html`
    }
  );
}

async function sendTicketPanel(channel) {

  const embed = makeEmbed(
    "🧊 Panel Tickets — Zinzin",
    [
      "Sélectionne une catégorie dans le menu ci-dessous.",
      "",
      "📋 Recrutement",
      "🛠️ Problème"
    ].join("\n")
  );

  const menu = new StringSelectMenuBuilder()
    .setCustomId("ticket_menu")
    .setPlaceholder("Choisis une catégorie")
    .addOptions(
      {
        label: "Recrutement",
        value: "recrutement",
        emoji: "📋"
      },
      {
        label: "Problème",
        value: "probleme",
        emoji: "🛠️"
      }
    );

  await channel.send({
    embeds: [embed],
    files: brandFiles(),
    components: [
      new ActionRowBuilder().addComponents(menu)
    ]
  });
}

function ticketButtons(ticketType) {

  const row =
    new ActionRowBuilder()
      .addComponents(

        new ButtonBuilder()
          .setCustomId("claim_ticket")
          .setLabel("Claim")
          .setEmoji("🎯")
          .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
          .setCustomId("close_ticket")
          .setLabel("Fermer")
          .setEmoji("🔒")
          .setStyle(ButtonStyle.Danger)

      );

  if (ticketType === "recrutement") {

    row.addComponents(

      new ButtonBuilder()
        .setCustomId("start_recruit_form")
        .setLabel("Formulaire recrutement")
        .setEmoji("📋")
        .setStyle(ButtonStyle.Success)

    );
  }

  return [row];
}

async function createTicket(
  interaction,
  typeLabel,
  ticketType
) {

  const guild = interaction.guild;
  const member = interaction.member;

  const alreadyOpen =
    guild.channels.cache.find(
      ch => ch.topic === `ticket-owner:${member.id}`
    );

  if (alreadyOpen) {
    return interaction.reply({
      content: `Tu as déjà un ticket ouvert : ${alreadyOpen}`,
      ephemeral: true
    });
  }

  let category =
    guild.channels.cache.find(
      ch =>
        ch.type === ChannelType.GuildCategory
        && ch.name === "Tickets"
    );

  if (!category) {

    category =
      await guild.channels.create({
        name: "Tickets",
        type: ChannelType.GuildCategory
      });
  }

  const fondateurRole =
    getRole(guild, config.staffRoles.fondateur);

  const gerantRecruteurRole =
    getRole(guild, config.staffRoles.gerantRecruteur);

  const overwrites = [

    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel]
    },

    {
      id: member.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory
      ]
    },

    {
      id: client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ReadMessageHistory
      ]
    }

  ];

  if (ticketType === "probleme") {

    if (fondateurRole) {

      overwrites.push({
        id: fondateurRole.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageMessages
        ]
      });
    }
  }

  else if (ticketType === "recrutement") {

    if (gerantRecruteurRole) {

      overwrites.push({
        id: gerantRecruteurRole.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageMessages
        ]
      });
    }
  }

  const safeName =
    member.user.username
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .slice(0, 30);

  const channel =
    await guild.channels.create({

      name: `ticket-${safeName}`,
      type: ChannelType.GuildText,
      parent: category.id,

      topic:
        `ticket-owner:${member.id};type:${ticketType};claimed:none`,

      permissionOverwrites: overwrites

    });

  ticketActivity.set(channel.id, Date.now());

  let ping = "";

  let description =
    `${member}, ton ticket est ouvert.\nUn membre du staff va te répondre.`;

  if (ticketType === "recrutement") {

    ping =
      gerantRecruteurRole
        ? `${gerantRecruteurRole}`
        : "";

    description =
      `${member}, ton ticket recrutement est ouvert.\n\n${config.recruitmentMessage}`;
  }

  if (ticketType === "probleme") {

    ping =
      fondateurRole
        ? `${fondateurRole}`
        : "";

    description =
      `${member}, ton ticket problème est ouvert.\nLes fondateurs vont te répondre.`;
  }

  await channel.send({

    content: `${member} ${ping}`.trim(),

    files: brandFiles(),

    embeds: [
      makeEmbed(
        `🎫 Ticket — ${typeLabel}`,
        description
      )
    ],

    components: ticketButtons(ticketType)

  });

  await sendLog(
    guild,
    "📩 Ticket ouvert",
    `Utilisateur : ${member}\nCatégorie : **${typeLabel}**\nSalon : ${channel}`
  );

  return interaction.reply({
    content: `Ticket créé : ${channel}`,
    ephemeral: true
  });
}

async function closeTicket(channel, closedBy) {

  const guild = channel.guild;

  const transcript =
    await createHtmlTranscript(channel);

  await sendLog(
    guild,
    "🔒 Ticket fermé",
    `Salon : **${channel.name}**\nFermé par : ${closedBy}`,
    [transcript]
  );

  if (
    closedBy?.id
    && closedBy.id !== client.user.id
  ) {
    addStaffStat(closedBy.id, "closed");
  }

  await channel.send(
    "🔒 Ticket fermé dans 5 secondes."
  );

  ticketActivity.delete(channel.id);

  setTimeout(() => {
    channel.delete().catch(() => {});
  }, 5000);
}

client.once("ready", () => {

  console.log(
    `Zinzin connecté : ${client.user.tag}`
  );

  client.user.setPresence({
    activities: [
      {
        name: `${config.serverName} 🧊`
      }
    ],
    status: "online"
  });

  for (const entry of loadTempBans()) {
    scheduleTempBan(client, entry);
  }

});

client.on("interactionCreate", async interaction => {
  try {
    if (interaction.isStringSelectMenu() && interaction.customId === "ticket_menu") {
      const choice = interaction.values[0];

      const labels = {
        recrutement: "📋 Recrutement",
        probleme: "🛠️ Problème"
      };

      return createTicket(interaction, labels[choice] || choice, choice);
    }

    if (interaction.isButton()) {
      if (interaction.customId === "claim_ticket") {
        if (!interaction.channel.topic?.startsWith("ticket-owner:")) {
          return interaction.reply({ content: "Ce salon n’est pas un ticket.", ephemeral: true });
        }

        if (!isStaff(interaction.member)) {
          return interaction.reply({ content: "Seul le staff peut claim un ticket.", ephemeral: true });
        }

        const currentTopic = interaction.channel.topic || "";

        if (currentTopic.includes("claimed:") && !currentTopic.includes("claimed:none")) {
          return interaction.reply({ content: "Ce ticket est déjà claim.", ephemeral: true });
        }

        await interaction.channel.setTopic(
          currentTopic.replace("claimed:none", `claimed:${interaction.user.id}`)
        ).catch(() => {});

        addStaffStat(interaction.user.id, "claimed");

        await interaction.reply({
          embeds: [makeEmbed("🎯 Ticket claim", `Ticket pris en charge par ${interaction.user}.`)]
        });

        return;
      }

      if (interaction.customId === "close_ticket") {
        if (!interaction.channel.topic?.startsWith("ticket-owner:")) {
          return interaction.reply({ content: "Ce salon n’est pas un ticket.", ephemeral: true });
        }

        await interaction.reply("Fermeture du ticket...");
        return closeTicket(interaction.channel, interaction.user);
      }

      if (interaction.customId === "start_recruit_form") {
        const modal = new ModalBuilder()
          .setCustomId("recruit_form")
          .setTitle("Candidature Zinzin");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("age")
              .setLabel("Ton âge")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("dispo")
              .setLabel("Tes disponibilités")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("niveau")
              .setLabel("Ton niveau / expérience")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("leaderboard")
              .setLabel("Ton leaderboard")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("pov")
              .setLabel("POV / liens Medal")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          )
        );

        return interaction.showModal(modal);
      }

      if (interaction.customId.startsWith("open_giveaway_modal_")) {
        const ownerId = interaction.customId.replace("open_giveaway_modal_", "");

        if (interaction.user.id !== ownerId) {
          return interaction.reply({ content: "❌ Ce bouton n’est pas pour toi.", ephemeral: true });
        }

        if (!canCreateGiveaway(interaction.member)) {
          return interaction.reply({ content: "❌ Permission refusée.", ephemeral: true });
        }

        const modal = new ModalBuilder()
          .setCustomId(`giveaway_create_${ownerId}`)
          .setTitle("Créer un giveaway");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("endDate")
              .setLabel("Date de fin")
              .setPlaceholder("2026-05-30T20:00")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("winners")
              .setLabel("Nombre de gagnants")
              .setPlaceholder("1")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("prize")
              .setLabel("Lot à gagner")
              .setPlaceholder("Nitro")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("description")
              .setLabel("Description")
              .setPlaceholder("Giveaway Zinzin")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
          )
        );

        return interaction.showModal(modal);
      }

      if (interaction.customId.startsWith("giveaway_join_")) {
        const giveawayId = interaction.customId.replace("giveaway_join_", "");
        const data = giveaways.get(giveawayId);

        if (!data) {
          return interaction.reply({ content: "❌ Giveaway terminé.", ephemeral: true });
        }

        data.participants.add(interaction.user.id);

        return interaction.reply({
          content: "✅ Participation enregistrée.",
          ephemeral: true
        });
      }
    }

    if (interaction.isModalSubmit() && interaction.customId === "recruit_form") {
      const age = interaction.fields.getTextInputValue("age");
      const dispo = interaction.fields.getTextInputValue("dispo");
      const niveau = interaction.fields.getTextInputValue("niveau");
      const leaderboard = interaction.fields.getTextInputValue("leaderboard");
      const pov = interaction.fields.getTextInputValue("pov");

      const embed = makeEmbed(
        "📋 Formulaire recrutement",
        [
          `Candidat : ${interaction.user}`,
          "",
          `**Âge :** ${age}`,
          `**Disponibilités :** ${dispo}`,
          `**Niveau / expérience :** ${niveau}`,
          `**Leaderboard :** ${leaderboard}`,
          `**POV / liens Medal :** ${pov}`
        ].join("\n")
      );

      await interaction.reply({ content: "✅ Formulaire envoyé.", ephemeral: true });
      await interaction.channel.send({ embeds: [embed] });

      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith("giveaway_create_")) {
      const endDateInput = interaction.fields.getTextInputValue("endDate");
      const winnersInput = interaction.fields.getTextInputValue("winners");
      const prize = interaction.fields.getTextInputValue("prize");
      const description = interaction.fields.getTextInputValue("description") || "Bonne chance à tous !";

      const endDate = parseGiveawayDate(endDateInput);

      if (!endDate || endDate.getTime() <= Date.now()) {
        return interaction.reply({
          content: "❌ Date invalide. Utilise ce format : `2026-05-30T20:00`",
          ephemeral: true
        });
      }

      const winnersCount = parseInt(winnersInput, 10);

      if (isNaN(winnersCount) || winnersCount <= 0) {
        return interaction.reply({ content: "❌ Nombre de gagnants invalide.", ephemeral: true });
      }

      const giveawayChannel = interaction.guild.channels.cache.get(config.giveaway.channelId);

      if (!giveawayChannel) {
        return interaction.reply({ content: "❌ Salon giveaway introuvable.", ephemeral: true });
      }

      const rolePing = interaction.guild.roles.cache.find(r => r.name === config.giveaway.pingRole);
      const giveawayId = Date.now().toString();

      const button = new ButtonBuilder()
        .setCustomId(`giveaway_join_${giveawayId}`)
        .setLabel("Participer")
        .setEmoji("🎉")
        .setStyle(ButtonStyle.Success);

      const msg = await giveawayChannel.send({
        content: rolePing ? `${rolePing} 🎉 Nouveau giveaway !` : "@everyone 🎉 Nouveau giveaway !",
        embeds: [
          makeEmbed(
            "🎉 GIVEAWAY ZINZIN",
            [
              `🎁 **Lot :** ${prize}`,
              `🏆 **Gagnants :** ${winnersCount}`,
              `⏰ **Fin :** <t:${Math.floor(endDate.getTime() / 1000)}:F>`,
              `⏳ **Temps restant :** <t:${Math.floor(endDate.getTime() / 1000)}:R>`,
              "",
              description,
              "",
              "Clique sur 🎉 pour participer."
            ].join("\n")
          )
        ],
        components: [new ActionRowBuilder().addComponents(button)]
      });

      giveaways.set(giveawayId, {
        messageId: msg.id,
        prize,
        winnersCount,
        endAt: endDate.getTime(),
        participants: new Set()
      });

      await interaction.reply({
        content: `✅ Giveaway créé.\nID : \`${giveawayId}\``,
        ephemeral: true
      });

      setTimeout(async () => {
        const data = giveaways.get(giveawayId);
        if (!data) return;

        const participants = [...data.participants];

        if (!participants.length) {
          giveaways.delete(giveawayId);
          return giveawayChannel.send(`❌ Giveaway terminé : **${prize}**\nAucun participant.`);
        }

        const winners = pickWinners(participants, winnersCount);
        const winnersPing = winners.map(id => `<@${id}>`).join(" ");

        await giveawayChannel.send(`🎉 Félicitations ${winnersPing} !\nVous gagnez : **${prize}**`);

        giveaways.delete(giveawayId);
      }, endDate.getTime() - Date.now());

      return;
    }
  } catch (err) {
    console.error(err);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ Une erreur est arrivée.",
        ephemeral: true
      }).catch(() => {});
    }
  }
});


client.on("messageCreate", async message => {
  if (message.author.bot || !message.guild) return;

  if (await handleSecurity(message)) return;

  const prefix = config.prefix || "!";
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift()?.toLowerCase();
  if (!command) return;

  sendCommandLog(message, command, args).catch(() => {});

  if (command === "help" || command === "aide") {
    return message.reply({
      embeds: [
        makeEmbed(
          "📖 Commandes Zinzin",
          [
            "`!panel` / `!setup` → envoie le panel ticket",
            "`!close` → ferme le ticket",
            "`!clear 10` → supprime des messages",
            "`!add ID` → ajoute quelqu’un au ticket",
            "`!ban @membre raison` → bannit un membre",
            "`!unban ID raison` → débannit un utilisateur",
            "`!kick @membre raison` → expulse un membre",
            "`!mute @membre 10m raison` → timeout un membre",
            "`!unmute @membre raison` → retire le timeout",
            "`!bantemp @membre 7d raison` → ban temporaire",
            "`!staffstats` → stats staff",
            "`!giveaway op` → créer un giveaway",
            "`!cancelgiveaway ID` → annuler un giveaway",
            "`!statut` → statut du bot",
            "`!help` / `!aide` → aide"
          ].join("\n")
        )
      ]
    });
  }

  if (command === "setup" || command === "panel") {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply("❌ Permission refusée.");
    }

    const panelChannel =
      message.guild.channels.cache.get(config.channels.ticketPanelId)
      || getChannelByName(message.guild, config.channels.ticketPanel)
      || message.channel;

    await sendTicketPanel(panelChannel);
    return message.reply("✅ Panel envoyé.");
  }

  if (command === "close") {
    if (!message.channel.topic?.startsWith("ticket-owner:")) {
      return message.reply("❌ Utilise cette commande dans un ticket.");
    }

    return closeTicket(message.channel, message.author);
  }

  if (command === "giveaway") {
    if (args[0] !== "op") {
      return message.reply("Utilisation : `!giveaway op`");
    }

    if (!canCreateGiveaway(message.member)) {
      return message.reply("❌ Permission refusée.");
    }

    const button = new ButtonBuilder()
      .setCustomId(`open_giveaway_modal_${message.author.id}`)
      .setLabel("Créer le giveaway")
      .setEmoji("🎉")
      .setStyle(ButtonStyle.Success);

    return message.reply({
      content: "🎉 Clique sur le bouton pour ouvrir le menu giveaway.",
      components: [new ActionRowBuilder().addComponents(button)]
    });
  }

  if (command === "cancelgiveaway") {
    if (!canCreateGiveaway(message.member)) {
      return message.reply("❌ Permission refusée.");
    }

    const giveawayId = args[0];

    if (!giveawayId) {
      return message.reply("Utilisation : `!cancelgiveaway ID`");
    }

    const data = giveaways.get(giveawayId);

    if (!data) {
      return message.reply("❌ Giveaway introuvable.");
    }

    giveaways.delete(giveawayId);

    return message.reply(`🛑 Giveaway \`${giveawayId}\` annulé.`);
  }

  if (command === "clear") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return message.reply("❌ Permission refusée.");
    }

    const amount = Math.min(parseInt(args[0] || "10", 10), 100);

    if (Number.isNaN(amount) || amount < 1) {
      return message.reply("Utilisation : `!clear 10`");
    }

    const deleted = await message.channel.bulkDelete(amount, true).catch(() => null);

    if (!deleted) {
      return message.reply("❌ Impossible de supprimer.");
    }

    return message.channel
      .send(`✅ ${deleted.size} messages supprimés.`)
      .then(msg => setTimeout(() => msg.delete().catch(() => {}), 3000));
  }

  if (command === "add") {
    if (!message.channel.topic?.startsWith("ticket-owner:")) {
      return message.reply("❌ À utiliser dans un ticket.");
    }

    if (!isStaff(message.member)) {
      return message.reply("❌ Permission refusée.");
    }

    const userId = args[0]?.replace(/[<@!>]/g, "");

    if (!userId) {
      return message.reply("Utilisation : `!add ID`");
    }

    const user = await message.guild.members.fetch(userId).catch(() => null);

    if (!user) {
      return message.reply("❌ Utilisateur introuvable.");
    }

    await message.channel.permissionOverwrites.edit(user.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true
    });

    return message.reply(`✅ ${user} ajouté au ticket.`);
  }


  if (command === "ban") {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return message.reply("❌ Permission refusée.");
    }

    const target = await resolveMember(message.guild, args[0]);
    const reason = args.slice(1).join(" ") || "Aucune raison donnée";

    if (!target) return message.reply("Utilisation : `!ban @membre raison`");
    if (!target.bannable || !canModerate(message.member, target)) {
      return message.reply("❌ Je ne peux pas bannir ce membre. Vérifie la hiérarchie des rôles.");
    }

    await target.ban({ reason });
    await sendModerationLog(message.guild, "ban", "🔨 Ban", `Modérateur : ${message.author}\nUtilisateur : ${target.user.tag} (${target.id})\nRaison : ${reason}`);
    return message.reply(`✅ ${target.user.tag} a été banni.`);
  }

  if (command === "unban") {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return message.reply("❌ Permission refusée.");
    }

    const userId = args[0]?.replace(/[<@!>]/g, "");
    const reason = args.slice(1).join(" ") || "Aucune raison donnée";
    if (!userId) return message.reply("Utilisation : `!unban ID raison`");

    await message.guild.members.unban(userId, reason).catch(() => null);
    const entries = loadTempBans().filter(e => !(e.guildId === message.guild.id && e.userId === userId));
    saveTempBans(entries);
    await sendModerationLog(message.guild, "unban", "✅ Unban", `Modérateur : ${message.author}\nUtilisateur ID : ${userId}\nRaison : ${reason}`);
    return message.reply(`✅ L’utilisateur \`${userId}\` a été débanni si son ban existait.`);
  }

  if (command === "kick") {
    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) {
      return message.reply("❌ Permission refusée.");
    }

    const target = await resolveMember(message.guild, args[0]);
    const reason = args.slice(1).join(" ") || "Aucune raison donnée";

    if (!target) return message.reply("Utilisation : `!kick @membre raison`");
    if (!target.kickable || !canModerate(message.member, target)) {
      return message.reply("❌ Je ne peux pas expulser ce membre. Vérifie la hiérarchie des rôles.");
    }

    await target.kick(reason);
    await sendModerationLog(message.guild, "kick", "👢 Kick", `Modérateur : ${message.author}\nUtilisateur : ${target.user.tag} (${target.id})\nRaison : ${reason}`);
    return message.reply(`✅ ${target.user.tag} a été expulsé.`);
  }

  if (command === "mute" || command === "timeout") {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply("❌ Permission refusée.");
    }

    const target = await resolveMember(message.guild, args[0]);
    const durationInput = args[1];
    const durationMs = parseDurationMs(durationInput);
    const reason = args.slice(2).join(" ") || "Aucune raison donnée";

    if (!target || !durationMs) return message.reply("Utilisation : `!mute @membre 10m raison` — durées : `10m`, `2h`, `7d`");
    if (!target.moderatable || !canModerate(message.member, target)) {
      return message.reply("❌ Je ne peux pas mute ce membre. Vérifie la hiérarchie des rôles.");
    }
    if (durationMs > 28 * 24 * 60 * 60 * 1000) {
      return message.reply("❌ Discord limite les timeouts à 28 jours maximum.");
    }

    await target.timeout(durationMs, reason);
    await sendModerationLog(message.guild, "mute", "🔇 Mute", `Modérateur : ${message.author}\nUtilisateur : ${target.user.tag} (${target.id})\nDurée : ${durationInput}\nRaison : ${reason}`);
    return message.reply(`✅ ${target.user.tag} a été mute pendant ${durationInput}.`);
  }

  if (command === "unmute") {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply("❌ Permission refusée.");
    }

    const target = await resolveMember(message.guild, args[0]);
    const reason = args.slice(1).join(" ") || "Aucune raison donnée";
    if (!target) return message.reply("Utilisation : `!unmute @membre raison`");

    await target.timeout(null, reason);
    await sendModerationLog(message.guild, "unmute", "🔊 Unmute", `Modérateur : ${message.author}\nUtilisateur : ${target.user.tag} (${target.id})\nRaison : ${reason}`);
    return message.reply(`✅ ${target.user.tag} n’est plus mute.`);
  }

  if (command === "bantemp" || command === "tempban") {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return message.reply("❌ Permission refusée.");
    }

    const target = await resolveMember(message.guild, args[0]);
    const durationInput = args[1];
    const durationMs = parseDurationMs(durationInput);
    const reason = args.slice(2).join(" ") || "Aucune raison donnée";

    if (!target || !durationMs) return message.reply("Utilisation : `!bantemp @membre 7d raison` — durées : `10m`, `2h`, `7d`");
    if (!target.bannable || !canModerate(message.member, target)) {
      return message.reply("❌ Je ne peux pas bannir ce membre. Vérifie la hiérarchie des rôles.");
    }

    const entry = {
      guildId: message.guild.id,
      userId: target.id,
      unbanAt: Date.now() + durationMs,
      reason
    };

    const entries = loadTempBans().filter(e => !(e.guildId === entry.guildId && e.userId === entry.userId));
    entries.push(entry);
    saveTempBans(entries);

    await target.ban({ reason: `Tempban ${durationInput} - ${reason}` });
    scheduleTempBan(client, entry);
    await sendModerationLog(message.guild, "tempban", "⏳ Tempban", `Modérateur : ${message.author}\nUtilisateur : ${target.user.tag} (${target.id})\nDurée : ${durationInput}\nFin : <t:${Math.floor(entry.unbanAt / 1000)}:R>\nRaison : ${reason}`);
    return message.reply(`✅ ${target.user.tag} a été banni temporairement pendant ${durationInput}.`);
  }

  if (command === "staffstats") {
    if (!isStaff(message.member)) {
      return message.reply("❌ Permission refusée.");
    }

    const target = message.mentions.users.first() || message.author;
    const data = loadStats();
    const stats = data[target.id] || {
      claimed: 0,
      closed: 0,
      recruitForms: 0
    };

    return message.reply({
      embeds: [
        makeEmbed(
          `📊 Stats staff — ${target.username}`,
          [
            `🎯 Tickets claim : **${stats.claimed || 0}**`,
            `🔒 Tickets fermés : **${stats.closed || 0}**`,
            `📋 Formulaires : **${stats.recruitForms || 0}**`
          ].join("\n")
        )
      ]
    });
  }

  if (command === "statut") {
    return message.reply({
      embeds: [
        makeEmbed(
          "🟢 Statut du bot",
          [
            `Ping : ${client.ws.ping}ms`,
            `Serveurs : ${client.guilds.cache.size}`,
            `Utilisateurs : ${client.users.cache.size}`
          ].join("\n")
        )
      ]
    });
  }
});


client.on("guildMemberAdd", async member => {
  const antiRaid = config.security?.antiRaid;
  if (!antiRaid?.enabled) return;

  const key = member.guild.id;
  const now = Date.now();
  const joins = (joinRaidMap.get(key) || []).filter(ts => now - ts < antiRaid.intervalMs);
  joins.push(now);
  joinRaidMap.set(key, joins);

  if (joins.length < antiRaid.maxJoins) return;

  await sendSecurityLog(
    member.guild,
    "🚨 Anti-raid déclenché",
    [
      `Nouveaux membres : **${joins.length}** en ${Math.round(antiRaid.intervalMs / 1000)}s`,
      `Action conseillée : vérifie les arrivées et verrouille les salons si besoin.`
    ].join("\n")
  );

  joinRaidMap.set(key, []);
});

if (!process.env.DISCORD_TOKEN) {
  console.error("Erreur : DISCORD_TOKEN manquant.");
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
