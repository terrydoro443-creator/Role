# Badge Role Bot

Bot Discord qui lie un **rôle** à un **badge (emoji ou texte)**. Dès qu'un membre
reçoit ce rôle, le badge s'ajoute automatiquement dans son **pseudo** sur le
serveur. Si le rôle est retiré, le badge disparaît du pseudo.

Exemple : tu configures le rôle `Owner` avec le badge `👑` en suffixe →
un membre qui a ce rôle et s'appelle `Michael` devient automatiquement
`Michael 👑` dans le serveur.

## Installation

1. Installer les dépendances :
   ```bash
   npm install
   ```

2. Créer une application sur https://discord.com/developers/applications
   - Récupère le **Token** (Bot → Reset Token)
   - Récupère le **Client ID** (General Information → Application ID)

3. Copier `.env.example` en `.env` et remplir les deux valeurs :
   ```
   DISCORD_TOKEN=...
   CLIENT_ID=...
   ```

4. Inviter le bot sur ton serveur avec les permissions :
   - `Manage Roles` (Gérer les rôles)
   - `Manage Nicknames` (Gérer les pseudos)
   - Scope `bot` + `applications.commands`

   Lien d'invitation type :
   ```
   https://discord.com/api/oauth2/authorize?client_id=TON_CLIENT_ID&permissions=268437504&scope=bot%20applications.commands
   ```

5. **Important — hiérarchie des rôles** : dans les paramètres du serveur
   (Rôles), fais glisser le rôle du bot **au-dessus** de tous les rôles que
   tu veux utiliser comme badges (Owner, Admin, Helper...), sinon Discord
   refusera de modifier le pseudo des membres qui ont ces rôles.

6. Lancer le bot :
   ```bash
   npm start
   ```

## Commandes

Toutes les commandes ci-dessous sont **réservées aux administrateurs** du
serveur (permission `Administrator` requise — Discord les masque même dans
la liste des commandes pour les autres membres).

- `/badge-set role:<rôle> emoji:<emoji ou texte> position:<préfixe/suffixe> auto_attribution:<Vrai/Faux>`
  Lie un rôle à un badge. Si `auto_attribution` est **Vrai**, ce rôle
  apparaîtra dans le menu `/role-panel` et les membres pourront se
  l'attribuer eux-mêmes. Par défaut : **Faux** (attribution manuelle
  uniquement, réservée aux admins).
  Ex : `/badge-set role:@Helper emoji:🛠️ position:suffixe auto_attribution:Vrai`

  **Champ `emoji` avec autocomplétion (style Nitro)** : commence à taper le
  nom d'un emoji perso et le bot te propose une liste, en piochant parmi les
  emojis de **tous les serveurs où le bot est ajouté** (pas besoin de
  connaître l'ID). Tu peux aussi coller directement un emoji classique
  (🛠️, ✨, 👑...). ⚠️ Un emoji perso choisi ainsi s'affichera bien dans le
  menu `/role-panel`, mais **pas** dans le pseudo lui-même — Discord
  n'autorise que les emojis Unicode classiques dans les pseudos (voir
  Notes ci-dessous). Pour le badge du pseudo, préfère toujours un emoji
  classique.

- `/badge-remove role:<rôle>`
  Supprime la liaison badge ↔ rôle.

- `/badge-list`
  Affiche tous les rôles configurés avec leur badge, et indique lesquels
  sont auto-attribuables.

- `/role-panel`
  Publie dans le salon un message avec un **menu déroulant à sélection
  multiple**, listant uniquement les rôles marqués `auto_attribution:Vrai`.
  N'importe quel membre peut alors cocher **un ou plusieurs rôles** pour se
  les attribuer (ou décocher pour les retirer) — sans passer par un admin.
  Son pseudo se met à jour automatiquement avec les badges correspondants.

## Notes

- Les emojis **custom** du serveur (ceux avec `<:nom:id>`) ne s'affichent
  **pas** comme image dans un pseudo — Discord n'autorise que les emojis
  Unicode classiques (🛠️ 👑 🎮 etc.) ou du texte simple (`[OWNER]`) dans les
  pseudos. Utilise donc un emoji Unicode ou du texte comme dans tes images
  d'exemple (`HELPER`, `OWNER`).
- Le bot ne peut jamais modifier le pseudo du **propriétaire du serveur**
  (limitation Discord).
- Si un membre a plusieurs rôles-badges à la fois, tous les badges
  s'accumulent dans le pseudo (ex: `Michael 👑 🛠️`).
- Les données sont stockées localement dans `badges.json`, généré
  automatiquement au premier `/badge-set`.
