# Zinzin Bot Discord

Bot Discord en commandes préfixées `!` uniquement.

## Commandes principales

- `!help` / `!aide`
- `!panel` / `!setup` : envoie le panel ticket dans le salon configuré
- `!close` : ferme le ticket actuel et envoie le transcript HTML
- `!clear 10` : supprime des messages
- `!add ID` : ajoute quelqu’un au ticket
- `!staffstats` : stats staff
- `!statut` : statut du bot

## Modération

- `!kick @membre raison`
- `!ban @membre raison`
- `!unban ID raison`
- `!mute @membre 10m raison`
- `!unmute @membre raison`
- `!bantemp @membre 7d raison`

## Giveaways

- `!giveaway op`
- `!cancelgiveaway ID`

## Sécurité incluse

- anti-spam
- anti-liens d’invitation Discord
- anti-mentions massives
- détection anti-raid avec logs sécurité

## Salons configurés

- Panel tickets : `1411179481850318928`
- Transcripts tickets HTML : `1411192328231850034`
- Logs kick : `1420474600172818595`
- Logs ban/unban : `1420474736210608209`
- Logs bantemp : `1420474764744589565`
- Logs mutes/unmutes : `1420474857874919604`
- Logs commandes : `1420474894092861490`
- Logs sécurité : `1508839256226009160`

## Installation Railway

Variable obligatoire :

```env
DISCORD_TOKEN=ton_token_bot
```

Commande de start :

```bash
npm start
```
