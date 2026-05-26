# Zinzin Bot Discord

Bot Discord en commandes préfixées `!` uniquement.

## Commandes principales

- `!help` / `!aide` : affiche l'aide
- `!panel` / `!setup` : envoie le panel ticket
- `!close` : ferme le ticket actuel
- `!clear 10` : supprime des messages
- `!add ID` : ajoute quelqu'un au ticket
- `!staffstats` : affiche les stats staff
- `!statut` : affiche le statut du bot

## Modération

- `!ban @membre raison`
- `!unban ID raison`
- `!kick @membre raison`
- `!mute @membre 10m raison`
- `!unmute @membre raison`
- `!bantemp @membre 7d raison`

Durées acceptées : `s`, `m`, `h`, `d` ou `j`.
Exemples : `10m`, `2h`, `7d`.

## Giveaway

- `!giveaway op` : ouvre le formulaire giveaway
- `!cancelgiveaway ID` : annule un giveaway

## Sécurité incluse

Le fichier `config.js` contient déjà une partie sécurité :

- anti-spam
- blocage des liens d'invitation Discord
- anti-mentions massives
- détection anti-raid à l'arrivée de plusieurs membres
- auto-close tickets configuré dans la config

## Railway

Variables minimales :

```env
DISCORD_TOKEN=ton_token_bot
```

Variables recommandées :

```env
TICKET_LOGS_ID=id_salon_logs_tickets
MODERATION_LOGS_ID=id_salon_logs_moderation
SECURITY_LOGS_ID=id_salon_logs_securite
GIVEAWAY_CHANNEL_ID=id_salon_giveaway
FONDATEUR_ROLE_NAME=Fondateur
MINI_FONDATEUR_ROLE_NAME=Mini Fondateur
GERANT_RECRUTEUR_ROLE_NAME=Gérant recruteur
```

Commande de start Railway :

```bash
npm start
```

Aucune commande slash `/` n'est nécessaire.
