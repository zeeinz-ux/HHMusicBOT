const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const Spotify = require('../src/Spotify');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('spotify-code')
        .setDescription('Set Spotify authorization code (get from URL after login)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName('code')
                .setDescription('The authorization code from the callback URL')
                .setRequired(true)
        ),

    async execute(interaction, client) {
        await interaction.deferReply({ flags: [1 << 6] });

        try {
            const code = interaction.options.getString('code');
            const refreshToken = await Spotify.exchangeCode(code);
            await interaction.editReply({
                content: '✅ **Spotify authorization successful!** You can now use playlists with `/play`.\n\nTo persist across Railway restarts, add this to your Railway env vars:\n**`SPOTIFY_REFRESH_TOKEN`**:\n```\n' + refreshToken + '\n```'
            });
        } catch (error) {
            await interaction.editReply({ content: `❌ **Failed:** ${error.message}` });
        }
    }
};
