const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const Spotify = require('../src/Spotify');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('spotify-login')
        .setDescription('Login to Spotify to enable playlist support')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction, client) {
        await interaction.deferReply({ flags: [1 << 6] });

        const hasToken = Spotify.refreshToken || false;

        const embed = new EmbedBuilder()
            .setTitle('Spotify Login')
            .setColor(0x1DB954)
            .setDescription(
                hasToken
                    ? '✅ You are already logged in to Spotify!'
                    : 'Click the button below to login to Spotify.\n\nThis is required for **playlist** support (single tracks work without login).'
            );

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel(hasToken ? 'Re-login to Spotify' : 'Login to Spotify')
                .setStyle(ButtonStyle.Link)
                .setURL(Spotify.getAuthUrl())
        );

        await interaction.editReply({ embeds: [embed], components: [row] });
    }
};
