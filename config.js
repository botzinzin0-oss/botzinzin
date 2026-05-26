module.exports = {
  prefix: "!",
  serverName: "Zinzin",

  channels: {
    ticketPanel: "🆘｜𝙏𝙞𝙘𝙠𝙚𝙩s",
    ticketPanelId: process.env.TICKET_PANEL_ID || "1411179481850318928",

    ticketLogs: "✅｜𝙏𝙞𝙘𝙠𝙚𝙩-𝙡𝙤𝙜𝙨",
    ticketLogsId: process.env.TICKET_LOGS_ID || process.env.TRANSCRIPT_CHANNEL_ID || "1411192328231850034",

    kickLogsId: process.env.KICK_LOGS_ID || "1420474600172818595",
    banLogsId: process.env.BAN_LOGS_ID || "1420474736210608209",
    tempbanLogsId: process.env.TEMPBAN_LOGS_ID || "1420474764744589565",
    muteLogsId: process.env.MUTE_LOGS_ID || "1420474857874919604",
    commandLogsId: process.env.COMMAND_LOGS_ID || "1420474894092861490",
    securityLogsId: process.env.SECURITY_LOGS_ID || "1508839256226009160",

    moderationLogs: "🛡️｜mod-logs",
    moderationLogsId: process.env.MODERATION_LOGS_ID || "",
    securityLogs: "🚨｜security-logs"
  },

  staffRoles: {
    fondateur: process.env.FONDATEUR_ROLE_NAME || "Fondateur",
    miniFondateur: process.env.MINI_FONDATEUR_ROLE_NAME || "Mini Fondateur",
    gerantRecruteur: process.env.GERANT_RECRUTEUR_ROLE_NAME || "Gérant recruteur",
    ids: [
      "1411180786819928064",
      "1443329749849210910",
      "1421076564921024612"
    ]
  },

  recruitmentMessage: "Auras-tu le niveau pour nous rejoindre ?",

  security: {
    maxMessages: 6,
    intervalMs: 5000,
    timeoutMs: 60000,
    maxMentions: 6,
    blockInviteLinks: true,

    antiRaid: {
      enabled: true,
      maxJoins: 5,
      intervalMs: 20000,
      lockMinutes: 10
    },

    autoCloseTickets: {
      enabled: true,
      inactiveHours: 12
    }
  },

  branding: {
    name: "Zinzin",
    color: 0xff0a8a,
    imageFile: "zinzin.png",
    imageUrl: null
  },

  giveaway: {
    channelId: process.env.GIVEAWAY_CHANNEL_ID || "1431077575232458934",

    allowedRoles: [
      process.env.FONDATEUR_ROLE_NAME || "Fondateur",
      process.env.MINI_FONDATEUR_ROLE_NAME || "Mini Fondateur"
    ],
    allowedRoleIds: [
      "1411180786819928064",
      "1443329749849210910",
      "1421076564921024612"
    ],

    pingRole: process.env.GIVEAWAY_PING_ROLE_NAME || "TEAMZINZIN"
  }
};
