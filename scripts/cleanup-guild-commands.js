/**
 * Wipes ALL guild-scoped slash commands for a guild, leaving only global commands.
 * Useful after switching from GUILD_ID (testing) to global deployment — guild
 * commands from old testing sessions otherwise linger and show up doubled.
 *
 * Usage:
 *   node scripts/cleanup-guild-commands.js <guildId>
 *   or set GUILD_ID in .env and run: node scripts/cleanup-guild-commands.js
 */
require('dotenv').config();
const { REST, Routes } = require('discord.js');
const config = require('../config');

const guildId = process.argv[2] || config.discord.guildId;

if (!guildId) {
    console.error('❌ No guild ID. Pass it as an argument or set GUILD_ID in .env');
    process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(config.discord.token);

(async () => {
    const existing = await rest.get(Routes.applicationGuildCommands(config.discord.clientId, guildId));
    if (existing.length === 0) {
        console.log('✅ No guild-scoped commands to delete.');
        return;
    }
    console.log(`🗑️  Deleting ${existing.length} guild command(s): ${existing.map(c => '/' + c.name).join(', ')}`);
    const data = await rest.put(
        Routes.applicationGuildCommands(config.discord.clientId, guildId),
        { body: [] }
    );
    console.log(`✅ Deleted. Remaining guild commands: ${data.length}`);
})().catch(err => {
    console.error('❌ Failed to delete guild commands:', err.message);
    process.exit(1);
});
