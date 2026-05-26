module.exports = {
  prefix: "!",
  serverName: "Zinzin",

  channels: {
    ticketPanel: "🆘｜𝙏𝙞𝙘𝙠𝙚𝙩s",
    ticketLogs: "✅｜𝙏𝙞𝙘𝙠𝙚𝙩-𝙡𝙤𝙜𝙨",
    ticketLogsId: process.env.TICKET_LOGS_ID || process.env.TRANSCRIPT_CHANNEL_ID || "",
    moderationLogs: "🛡️｜mod-logs",
    moderationLogsId: process.env.MODERATION_LOGS_ID || "",
    securityLogs: "🚨｜security-logs",
    securityLogsId: process.env.SECURITY_LOGS_ID || ""
  },

  staffRoles: {
    fondateur: process.env.FONDATEUR_ROLE_NAME || "Fondateur",
    miniFondateur: process.env.MINI_FONDATEUR_ROLE_NAME || "Mini Fondateur",
    gerantRecruteur: process.env.GERANT_RECRUTEUR_ROLE_NAME || "Gérant recruteur"
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
    channelId: process.env.GIVEAWAY_CHANNEL_ID || "",

    allowedRoles: [
      process.env.FONDATEUR_ROLE_NAME || "Fondateur",
      process.env.MINI_FONDATEUR_ROLE_NAME || "Mini Fondateur"
    ],

    pingRole: process.env.GIVEAWAY_PING_ROLE_NAME || "TEAMZINZIN"
  }
};
