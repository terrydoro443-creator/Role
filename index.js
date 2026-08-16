// ================================================================
// BADGE ROLE BOT
// Quand un membre reçoit un rôle configuré, un emoji/badge est
// automatiquement ajouté à son pseudo. Si le rôle est retiré,
// le badge est retiré du pseudo.
// ================================================================

const {
  Client,
  GatewayIntentBits,
  Partials,
  SlashCommandBuilder,
  PermissionFlagsBits,
  REST,
  Routes,
  EmbedBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
} = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const DATA_FILE = path.join(__dirname, 'badges.json');

// ---------- Stockage simple en JSON (roleId -> { badge, position }) ----------
function loadBadges() {
  if (!fs.existsSync(DATA_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveBadges(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

let badges = loadBadges();

// ---------- Client Discord ----------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // requis pour détecter les changements de rôle
  ],
  partials: [Partials.GuildMember],
});

// ---------- Déclaration des commandes slash ----------
// Toutes les commandes de configuration sont réservées aux ADMINISTRATEURS
// du serveur (setDefaultMemberPermissions + vérification faite à nouveau
// dans le handler, au cas où un admin retire ce droit à un rôle précis).
const commands = [
  new SlashCommandBuilder()
    .setName('badge-set')
    .setDescription("Lie un rôle à un badge (emoji) qui s'ajoutera au pseudo")
    .addRoleOption((opt) =>
      opt.setName('role').setDescription('Le rôle à configurer').setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName('emoji')
        .setDescription(
          "Tape le nom d'un emoji perso (autocomplétion, tous serveurs) ou colle un emoji classique 🛠️"
        )
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption((opt) =>
      opt
        .setName('position')
        .setDescription('Où placer le badge dans le pseudo')
        .addChoices(
          { name: 'Avant le pseudo (préfixe)', value: 'prefix' },
          { name: 'Après le pseudo (suffixe)', value: 'suffix' }
        )
        .setRequired(true)
    )
    .addBooleanOption((opt) =>
      opt
        .setName('auto_attribution')
        .setDescription('Les membres peuvent-ils se donner ce rôle eux-mêmes via /role-panel ?')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('badge-remove')
    .setDescription('Supprime la configuration de badge liée à un rôle')
    .addRoleOption((opt) =>
      opt.setName('role').setDescription('Le rôle à déconfigurer').setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('badge-list')
    .setDescription('Liste tous les rôles configurés avec leur badge')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('role-panel')
    .setDescription("Publie un menu où les membres choisissent eux-mêmes leurs rôles (sélection multiple)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map((c) => c.toJSON());

// ---------- Enregistrement des commandes au démarrage ----------
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log('✅ Commandes slash enregistrées.');
  } catch (err) {
    console.error('❌ Erreur enregistrement des commandes :', err);
  }
}

// ---------- Utilitaire : construire le pseudo avec badge(s) ----------
// On stocke le "vrai" pseudo de base séparément dans une regex pour
// pouvoir retirer proprement un badge sans toucher au reste du nom.
function stripAllBadges(nickname) {
  let clean = nickname;
  for (const cfg of Object.values(badges)) {
    clean = clean.split(cfg.badge).join('').trim();
  }
  return clean.trim();
}

// Convertit un badge stocké (unicode "🛠️" OU perso "<:nom:id>" / "<a:nom:id>")
// en objet emoji utilisable par un composant Discord (StringSelectMenuOption).
function parseEmojiForComponent(badge) {
  const customMatch = badge.match(/^<(a)?:(\w+):(\d+)>$/);
  if (customMatch) {
    const [, animated, name, id] = customMatch;
    return { id, name, animated: Boolean(animated) };
  }
  if (/^\p{Emoji}/u.test(badge)) return badge;
  return undefined;
}

function buildNickname(baseName, activeBadgeList) {
  let name = baseName;
  const prefixes = activeBadgeList.filter((b) => b.position === 'prefix').map((b) => b.badge);
  const suffixes = activeBadgeList.filter((b) => b.position === 'suffix').map((b) => b.badge);

  if (prefixes.length) name = `${prefixes.join(' ')} ${name}`;
  if (suffixes.length) name = `${name} ${suffixes.join(' ')}`;

  // Discord limite les pseudos à 32 caractères
  if (name.length > 32) {
    const overflow = name.length - 32;
    // On raccourcit le nom de base en priorité, pas les badges
    const baseTrimLength = Math.max(1, baseName.length - overflow);
    const trimmedBase = baseName.slice(0, baseTrimLength);
    name = buildNickname(trimmedBase, activeBadgeList);
  }
  return name;
}

// ---------- Recalcule et applique le pseudo d'un membre ----------
async function syncNickname(member) {
  try {
    const currentDisplay = member.nickname || member.user.username;
    const baseName = stripAllBadges(currentDisplay) || member.user.username;

    const activeBadgeList = Object.entries(badges)
      .filter(([roleId]) => member.roles.cache.has(roleId))
      .map(([, cfg]) => cfg);

    const newNickname = activeBadgeList.length
      ? buildNickname(baseName, activeBadgeList)
      : baseName;

    const finalNickname = newNickname === member.user.username ? null : newNickname;

    if ((member.nickname || null) !== finalNickname) {
      await member.setNickname(finalNickname).catch((err) => {
        console.warn(
          `⚠️ Impossible de changer le pseudo de ${member.user.tag} (permissions/hiérarchie) :`,
          err.message
        );
      });
    }
  } catch (err) {
    console.error('Erreur syncNickname:', err);
  }
}

// ---------- Événements ----------
client.once('ready', () => {
  console.log(`🤖 Connecté en tant que ${client.user.tag}`);
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
  const oldRoles = oldMember.roles.cache;
  const newRoles = newMember.roles.cache;
  if (oldRoles.equals(newRoles)) return; // rien changé côté rôles

  // On ne resynchronise que si un rôle "badge" a changé
  const changedBadgeRole = Object.keys(badges).some(
    (roleId) => oldRoles.has(roleId) !== newRoles.has(roleId)
  );
  if (changedBadgeRole) {
    await syncNickname(newMember);
  }
});

// Double vérification : même si Discord masque la commande aux non-admins,
// on revérifie côté bot (au cas où les permissions de la commande ont été
// changées manuellement dans les paramètres du serveur).
function isAdmin(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
}

client.on('interactionCreate', async (interaction) => {
 try {
  // ---------- Autocomplétion de l'emoji (style Nitro : tous les serveurs où le bot est) ----------
  if (interaction.isAutocomplete()) {
    const focused = interaction.options.getFocused(true);
    if (interaction.commandName === 'badge-set' && focused.name === 'emoji') {
      const query = focused.value.toLowerCase();

      // client.emojis.cache regroupe les emojis persos de TOUS les serveurs
      // où le bot est membre, exactement comme la liste élargie que Nitro
      // donne accès à un membre (mais ici c'est le bot qui doit être présent
      // sur ces serveurs pour "voir" leurs emojis).
      const results = [...client.emojis.cache.values()]
        .filter((e) => e.name && e.name.toLowerCase().includes(query))
        .slice(0, 25)
        .map((e) => ({
          name: `${e.animated ? '🎞️' : '🖼️'} ${e.name} — ${e.guild?.name ?? 'serveur inconnu'}`.slice(0, 100),
          value: e.toString(), // ex: <:nom:1234567890> ou <a:nom:1234567890>
        }));

      await interaction.respond(results);
    }
    return;
  }

  // ---------- Commandes slash ----------
  if (interaction.isChatInputCommand()) {
    if (!isAdmin(interaction)) {
      return interaction.reply({
        content: '⛔ Seuls les **administrateurs** du serveur peuvent utiliser cette commande.',
        ephemeral: true,
      });
    }

    if (interaction.commandName === 'badge-set') {
      const role = interaction.options.getRole('role');
      const emoji = interaction.options.getString('emoji');
      const position = interaction.options.getString('position');
      const autoAttribution = interaction.options.getBoolean('auto_attribution') ?? false;

      badges[role.id] = { badge: emoji, position, selfAssignable: autoAttribution };
      saveBadges(badges);

      const isCustomEmoji = /^<a?:\w+:\d+>$/.test(emoji);
      const warning = isCustomEmoji
        ? '\n⚠️ **Attention** : Discord n\'affiche jamais un emoji perso dans un pseudo (limitation de la plateforme, pas du bot) — il apparaîtra comme texte brut illisible. Il s\'affichera correctement dans le menu `/role-panel`, mais pour le pseudo, utilise plutôt un emoji classique (🛠️, ✨...).'
        : '';

      await interaction.reply({
        content:
          `✅ Le rôle **${role.name}** ajoutera désormais **${emoji}** (${position === 'prefix' ? 'avant' : 'après'} le pseudo).\n` +
          `${autoAttribution ? '🙋 Ce rôle est **auto-attribuable** : il apparaîtra dans /role-panel.' : '🔒 Ce rôle reste attribuable uniquement manuellement.'}` +
          warning +
          `\nMise à jour des membres en cours...`,
        ephemeral: true,
      });

      const members = await interaction.guild.members.fetch();
      for (const member of members.values()) {
        if (member.roles.cache.has(role.id)) {
          await syncNickname(member);
        }
      }
    }

    if (interaction.commandName === 'badge-remove') {
      const role = interaction.options.getRole('role');
      if (!badges[role.id]) {
        return interaction.reply({ content: `Ce rôle n'a pas de badge configuré.`, ephemeral: true });
      }
      delete badges[role.id];
      saveBadges(badges);

      await interaction.reply({ content: `🗑️ Badge retiré pour **${role.name}**. Mise à jour des membres...`, ephemeral: true });

      const members = await interaction.guild.members.fetch();
      for (const member of members.values()) {
        if (member.roles.cache.has(role.id)) {
          await syncNickname(member);
        }
      }
    }

    if (interaction.commandName === 'badge-list') {
      const entries = Object.entries(badges);
      if (!entries.length) {
        return interaction.reply({ content: 'Aucun badge configuré pour le moment.', ephemeral: true });
      }
      const embed = new EmbedBuilder()
        .setTitle('🎖️ Rôles → Badges configurés')
        .setColor(0x5865f2)
        .setDescription(
          entries
            .map(
              ([roleId, cfg]) =>
                `<@&${roleId}> → **${cfg.badge}** (${cfg.position === 'prefix' ? 'préfixe' : 'suffixe'})` +
                (cfg.selfAssignable ? ' · 🙋 auto-attribuable' : '')
            )
            .join('\n')
        );
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (interaction.commandName === 'role-panel') {
      const selfAssignable = Object.entries(badges).filter(([, cfg]) => cfg.selfAssignable);
      if (!selfAssignable.length) {
        return interaction.reply({
          content:
            "Aucun rôle n'est configuré en auto-attribution.\nUtilise `/badge-set` avec `auto_attribution: Vrai` pour en ajouter.",
          ephemeral: true,
        });
      }
      if (selfAssignable.length > 25) {
        return interaction.reply({ content: 'Trop de rôles auto-attribuables (max 25).', ephemeral: true });
      }

      if (!interaction.guild) {
        return interaction.reply({
          content: "⚠️ Impossible de récupérer les informations du serveur, réessaie dans un instant.",
          ephemeral: true,
        });
      }

      const options = selfAssignable.map(([roleId, cfg]) => {
        const role = interaction.guild.roles.cache.get(roleId);
        return {
          label: role ? role.name : 'Rôle inconnu (supprimé ?)',
          value: roleId,
          description: `Ajoute ${cfg.badge} à ton pseudo`,
          emoji: parseEmojiForComponent(cfg.badge),
        };
      });

      const select = new StringSelectMenuBuilder()
        .setCustomId('role-panel-select')
        .setPlaceholder('Choisis un ou plusieurs rôles...')
        .setMinValues(0)
        .setMaxValues(options.length)
        .addOptions(options);

      const row = new ActionRowBuilder().addComponents(select);

      const embed = new EmbedBuilder()
        .setTitle('🎭 Choisis tes rôles')
        .setColor(0x5865f2)
        .setDescription(
          'Sélectionne un ou plusieurs rôles dans le menu ci-dessous.\n' +
            'Ton pseudo sera automatiquement mis à jour avec le badge correspondant.\n' +
            'Tu peux décocher un rôle à tout moment pour le retirer.'
        );

      await interaction.channel.send({ embeds: [embed], components: [row] });
      await interaction.reply({ content: '✅ Panneau de sélection publié.', ephemeral: true });
    }
  }

  // ---------- Menu de sélection (auto-attribution des rôles) ----------
  if (interaction.isStringSelectMenu() && interaction.customId === 'role-panel-select') {
    const member = interaction.member;
    const selfAssignableIds = Object.entries(badges)
      .filter(([, cfg]) => cfg.selfAssignable)
      .map(([roleId]) => roleId);

    const selectedIds = interaction.values; // rôles cochés par le membre
    const toAdd = selfAssignableIds.filter((id) => selectedIds.includes(id) && !member.roles.cache.has(id));
    const toRemove = selfAssignableIds.filter((id) => !selectedIds.includes(id) && member.roles.cache.has(id));

    try {
      if (toAdd.length) await member.roles.add(toAdd);
      if (toRemove.length) await member.roles.remove(toRemove);
      await syncNickname(member);

      await interaction.reply({
        content: selectedIds.length
          ? `✅ Rôles mis à jour : ${selectedIds.map((id) => `<@&${id}>`).join(', ')}`
          : '✅ Tous tes rôles auto-attribuables ont été retirés.',
        ephemeral: true,
      });
    } catch (err) {
      console.error('Erreur auto-attribution rôle:', err);
      await interaction.reply({
        content: "⚠️ Impossible de modifier tes rôles (le bot n'a peut-être pas la permission, ou son rôle est trop bas dans la hiérarchie).",
        ephemeral: true,
      });
    }
  }
 } catch (err) {
  // Filet de sécurité global : si une erreur inattendue survient n'importe où
  // ci-dessus, on la log ET on répond à Discord au lieu de laisser
  // l'interaction "timeout" avec "L'application ne répond plus".
  console.error('❌ Erreur non gérée dans interactionCreate:', err);
  try {
    const payload = {
      content: "⚠️ Une erreur inattendue est survenue. Réessaie, et si ça persiste, préviens un admin.",
      ephemeral: true,
    };
    if (interaction.isRepliable?.()) {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload);
      } else {
        await interaction.reply(payload);
      }
    }
  } catch (replyErr) {
    console.error('❌ Impossible de répondre après erreur:', replyErr);
  }
 }
});

registerCommands().then(() => client.login(process.env.DISCORD_TOKEN));
