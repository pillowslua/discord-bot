// Discord Plant Care Bot v3.2 - Fixed Leaderboard and Weather API
// Author: Enhanced by Grok for TW1SK

require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, Collection, SlashCommandBuilder, ActivityType } = require('discord.js');
const fs = require('fs');
const axios = require('axios');
const cron = require('node-cron');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');

// Configuration
const config = {
    token: process.env.DISCORD_TOKEN,
    weatherApiKey: process.env.WEATHER_API_KEY,
    clientId: '1410050017560887326',
    dataFile: './data/garden_data.json'
};

// Validate environment variables
if (!config.token || !config.weatherApiKey || !config.clientId) {
    console.error('❌ Missing environment variables! Ensure DISCORD_TOKEN, WEATHER_API_KEY, and CLIENT_ID are set in .env');
    process.exit(1);
}

// Plant Database
const plantsDatabase = {
    basic: [
        { name: 'Cây Xương Rồng', emoji: '🌵', waterNeed: 2, sunNeed: 8, growthTime: 3, rarity: 'Thường', exp: 10, cost: 50, description: 'Cây dễ chăm, chịu hạn tốt' },
        { name: 'Cây Lưỡi Hổ', emoji: '🪴', waterNeed: 3, sunNeed: 6, growthTime: 4, rarity: 'Thường', exp: 12, cost: 60, description: 'Cây thanh lọc không khí tuyệt vời' },
        { name: 'Cây Đồng Tiền', emoji: '🌿', waterNeed: 4, sunNeed: 5, growthTime: 5, rarity: 'Thường', exp: 15, cost: 70, description: 'Cây phong thủy mang lại may mắn' }
    ],
    rare: [
        { name: 'Cây Bonsai Tùng', emoji: '🌲', waterNeed: 6, sunNeed: 7, growthTime: 10, rarity: 'Hiếm', exp: 50, cost: 200, description: 'Cây nghệ thuật cần chăm sóc tỉ mỉ' },
        { name: 'Monstera Deliciosa', emoji: '🌱', waterNeed: 7, sunNeed: 6, growthTime: 8, rarity: 'Hiếm', exp: 45, cost: 180, description: 'Cây Instagram nổi tiếng với lá lỗ' }
    ],
    legendary: [
        { name: 'Cây Sâm Ngọc Linh', emoji: '🌟', waterNeed: 10, sunNeed: 5, growthTime: 30, rarity: 'Huyền Thoại', exp: 200, cost: 500, description: 'Cây quý hiếm của núi rừng Việt Nam' }
    ]
};

// Bot Initialization
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Command cooldowns
const cooldowns = new Collection();

// Load garden data
let gardenData = {};
if (fs.existsSync(config.dataFile)) {
    try {
        gardenData = JSON.parse(fs.readFileSync(config.dataFile, 'utf8'));
        console.log('✅ Loaded garden_data.json:', Object.keys(gardenData).length, 'users');
    } catch (error) {
        console.error('❌ Error loading garden_data.json:', error.message);
        gardenData = {};
    }
}

// Save garden data
function saveGardenData() {
    try {
        fs.writeFileSync(config.dataFile, JSON.stringify(gardenData, null, 2));
        console.log('✅ Saved garden_data.json');
    } catch (error) {
        console.error('❌ Error saving garden_data.json:', error.message);
    }
}

// Weather Function
async function getWeatherVietnam(cityName) {
    try {
        const url = `http://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(cityName)},VN&appid=${config.weatherApiKey}&units=metric&lang=vi`;
        console.log('📡 Fetching weather for:', cityName);
        const response = await axios.get(url);
        const data = response.data;
        const weatherEmoji = {
            'clear sky': '☀️', 'few clouds': '🌤️', 'scattered clouds': '⛅', 'broken clouds': '☁️',
            'shower rain': '🌦️', 'rain': '🌧️', 'thunderstorm': '⛈️', 'snow': '❄️', 'mist': '🌫️'
        };
        return {
            city: data.name,
            temp: Math.round(data.main.temp),
            humidity: data.main.humidity,
            weather: data.weather[0].description,
            emoji: weatherEmoji[data.weather[0].main.toLowerCase()] || '🌈',
            windSpeed: data.wind.speed,
            windDirection: getWindDirection(data.wind.deg),
            isRainy: data.weather[0].main.toLowerCase().includes('rain')
        };
    } catch (error) {
        console.error('❌ Weather API error:', error.response?.data?.message || error.message);
        return null;
    }
}

function getWindDirection(deg) {
    const directions = ['Bắc', 'Đông Bắc', 'Đông', 'Đông Nam', 'Nam', 'Tây Nam', 'Tây', 'Tây Bắc'];
    return directions[Math.round(deg / 45) % 8];
}

// Plant Care Functions
function initUser(userId) {
    if (!gardenData[userId]) {
        gardenData[userId] = {
            plants: {},
            level: 1,
            exp: 0,
            coins: 100,
            lastDaily: null,
            lastWatered: null,
            lastSun: null
        };
        saveGardenData();
    }
}

function getPlantInfo(plantName) {
    const allPlants = [...plantsDatabase.basic, ...plantsDatabase.rare, ...plantsDatabase.legendary];
    return allPlants.find(p => p.name.toLowerCase().includes(plantName.toLowerCase()));
}

function plantSeed(userId, plantName) {
    initUser(userId);
    const plantInfo = getPlantInfo(plantName);
    if (!plantInfo) return { success: false, message: 'Không tìm thấy loại cây này!' };
    if (gardenData[userId].coins < plantInfo.cost) return { success: false, message: `Bạn cần ${plantInfo.cost} coins để mua ${plantInfo.name}!` };

    const plantId = Date.now().toString();
    gardenData[userId].plants[plantId] = {
        ...plantInfo,
        plantedAt: Date.now(),
        wateredAt: Date.now(),
        sunAt: Date.now(),
        health: 100,
        growth: 0,
        stage: 'Hạt giống',
        id: plantId
    };
    gardenData[userId].coins -= plantInfo.cost;
    saveGardenData();
    return { success: true, message: `Đã trồng ${plantInfo.emoji} ${plantInfo.name}!`, plant: plantInfo };
}

function waterPlant(userId, plantName) {
    initUser(userId);
    const userPlants = gardenData[userId].plants;
    for (let plantId in userPlants) {
        const plant = userPlants[plantId];
        if (plant.name.toLowerCase().includes(plantName.toLowerCase())) {
            const now = Date.now();
            const hoursSinceWatered = (now - (plant.wateredAt || 0)) / (1000 * 60 * 60);
            if (hoursSinceWatered < 2) return { success: false, message: `${plant.emoji} ${plant.name} vẫn còn đủ nước!` };

            plant.wateredAt = now;
            plant.health = Math.min(100, plant.health + 15);
            plant.growth = Math.min(100, plant.growth + 5);
            if (plant.growth >= 100) updatePlantStage(userId, plantId);
            saveGardenData();
            return { success: true, message: `Đã tưới nước cho ${plant.emoji} ${plant.name}! 💧` };
        }
    }
    return { success: false, message: 'Không tìm thấy cây này trong vườn!' };
}

function giveSunlight(userId, plantName) {
    initUser(userId);
    const userPlants = gardenData[userId].plants;
    for (let plantId in userPlants) {
        const plant = userPlants[plantId];
        if (plant.name.toLowerCase().includes(plantName.toLowerCase())) {
            const now = Date.now();
            const hoursSinceSun = (now - (plant.sunAt || 0)) / (1000 * 60 * 60);
            if (hoursSinceSun < 3) return { success: false, message: `${plant.emoji} ${plant.name} đã đủ ánh sáng!` };

            plant.sunAt = now;
            plant.health = Math.min(100, plant.health + 10);
            plant.growth = Math.min(100, plant.growth + 8);
            if (plant.growth >= 100) updatePlantStage(userId, plantId);
            saveGardenData();
            return { success: true, message: `Đã cho ${plant.emoji} ${plant.name} tắm nắng! ☀️` };
        }
    }
    return { success: false, message: 'Không tìm thấy cây này trong vườn!' };
}

function updatePlantStage(userId, plantId) {
    const plant = gardenData[userId].plants[plantId];
    if (plant.growth >= 100) {
        if (plant.stage === 'Hạt giống') plant.stage = 'Cây non';
        else if (plant.stage === 'Cây non') {
            plant.stage = 'Cây trưởng thành';
            gardenData[userId].exp += plant.exp;
            gardenData[userId].coins += plant.cost * 2;
            updateUserLevel(userId);
        }
        plant.growth = 0;
        saveGardenData();
    }
}

function updateUserLevel(userId) {
    const user = gardenData[userId];
    const expForNextLevel = user.level * 100;
    if (user.exp >= expForNextLevel) {
        user.level += 1;
        user.exp -= expForNextLevel;
        saveGardenData();
    }
}

function claimDaily(userId) {
    initUser(userId);
    const now = Date.now();
    const lastDaily = gardenData[userId].lastDaily || 0;
    if (now - lastDaily < 24 * 60 * 60 * 1000) {
        return { success: false, message: 'Bạn đã nhận thưởng hôm nay! Quay lại sau!' };
    }
    gardenData[userId].lastDaily = now;
    gardenData[userId].coins += 100;
    saveGardenData();
    return { success: true, message: '🎉 Nhận 100 coins thưởng hàng ngày!' };
}

function viewShop() {
    const allPlants = [...plantsDatabase.basic, ...plantsDatabase.rare, ...plantsDatabase.legendary];
    return allPlants.map(p => `${p.emoji} ${p.name} - ${p.cost} coins (${p.rarity})`);
}

function buyPlant(userId, plantName) {
    const plantResult = plantSeed(userId, plantName);
    if (plantResult.success) {
        return { success: true, message: `Đã mua và trồng ${plantResult.plant.emoji} ${plantResult.plant.name}!` };
    }
    return plantResult;
}

function getLeaderboard() {
    const users = Object.entries(gardenData)
        .filter(([_, data]) => data.level > 0 || data.exp > 0)
        .map(([userId, data]) => ({
            userId,
            level: data.level,
            exp: data.exp
        }));
    console.log('📊 Leaderboard data:', users);
    return users.sort((a, b) => b.level - a.level || b.exp - a.exp).slice(0, 5);
}

// Daily Reminders & Health Updates
cron.schedule('0 8 * * *', () => {
    updatePlantsHealth();
    sendDailyReminders();
}, { timezone: 'Asia/Ho_Chi_Minh' });

function updatePlantsHealth() {
    const now = Date.now();
    for (let userId in gardenData) {
        for (let plantId in gardenData[userId].plants) {
            const plant = gardenData[userId].plants[plantId];
            const hoursSinceWater = (now - (plant.wateredAt || 0)) / (1000 * 60 * 60);
            const hoursSinceSun = (now - (plant.sunAt || 0)) / (1000 * 60 * 60);
            if (hoursSinceWater > 12) plant.health = Math.max(0, plant.health - 10);
            if (hoursSinceSun > 12) plant.health = Math.max(0, plant.health - 8);
            if (plant.health <= 0) delete gardenData[userId].plants[plantId];
        }
        saveGardenData();
    }
}

async function sendDailyReminders() {
    for (const guild of client.guilds.cache.values()) {
        const channel = guild.channels.cache.find(ch => ch.name.includes('bot') || ch.name.includes('general'));
        if (channel && channel.permissionsFor(client.user).has(['SendMessages', 'EmbedLinks'])) {
            const embed = new EmbedBuilder()
                .setTitle('🌅 Nhắc Nhở Hàng Ngày')
                .setDescription('Đừng quên chăm sóc cây của bạn hôm nay! Nhận thưởng bằng `/daily`!')
                .setColor(0xFFD700)
                .setFooter({ text: 'FREE TOOL BY TW1SK' });
            channel.send({ embeds: [embed] }).catch(error => console.error('❌ Error sending reminder:', error.message));
        }
    }
}

// Bot Status and Slash Commands
client.on('ready', () => {
    console.log(`✅ Bot logged in as ${client.user.tag}`);
    client.user.setPresence({
        activities: [{ name: 'https://twisk.fun/DuoNexus . Free Growing Plants Games , Free & Stable Weather API', type: ActivityType.Playing }],
        status: 'online'
    });
});

// Register slash commands
const commands = [
    new SlashCommandBuilder().setName('help').setDescription('Hiển thị danh sách lệnh'),
    new SlashCommandBuilder()
        .setName('weather')
        .setDescription('Xem thời tiết tại một thành phố ở Việt Nam')
        .addStringOption(option => option.setName('city').setDescription('Tên thành phố').setRequired(true)),
    new SlashCommandBuilder()
        .setName('plant')
        .setDescription('Xem danh sách cây hoặc trồng một cây')
        .addStringOption(option => option.setName('name').setDescription('Tên cây để trồng (tùy chọn)').setRequired(false)),
    new SlashCommandBuilder().setName('garden').setDescription('Xem vườn cây của bạn'),
    new SlashCommandBuilder()
        .setName('water')
        .setDescription('Tưới nước cho một cây')
        .addStringOption(option => option.setName('name').setDescription('Tên cây').setRequired(true)),
    new SlashCommandBuilder()
        .setName('sun')
        .setDescription('Cho cây tắm nắng')
        .addStringOption(option => option.setName('name').setDescription('Tên cây').setRequired(true)),
    new SlashCommandBuilder().setName('daily').setDescription('Nhận thưởng hàng ngày'),
    new SlashCommandBuilder().setName('shop').setDescription('Xem cửa hàng cây'),
    new SlashCommandBuilder()
        .setName('buy')
        .setDescription('Mua và trồng một cây')
        .addStringOption(option => option.setName('name').setDescription('Tên cây').setRequired(true)),
    new SlashCommandBuilder().setName('leaderboard').setDescription('Xem bảng xếp hạng nhà vườn')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(config.token);

(async () => {
    try {
        console.log('📡 Registering slash commands...');
        await rest.put(Routes.applicationCommands(config.clientId), { body: commands });
        console.log('✅ Slash commands registered!');
    } catch (error) {
        console.error('❌ Error registering slash commands:', error.message);
    }
})();

// Handle slash commands
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;
    console.log(`Interaction: ${interaction.commandName} from ${interaction.user.tag} in #${interaction.channel.name}`);

    const { commandName, user } = interaction;
    const userId = user.id;

    // Cooldown check
    if (!cooldowns.has(commandName)) cooldowns.set(commandName, new Collection());
    const now = Date.now();
    const timestamps = cooldowns.get(commandName);
    const cooldownAmount = 3 * 1000;
    if (timestamps.has(userId)) {
        const expirationTime = timestamps.get(userId) + cooldownAmount;
        if (now < expirationTime) {
            const timeLeft = (expirationTime - now) / 1000;
            return interaction.reply({ content: `⏳ Vui lòng đợi ${timeLeft.toFixed(1)} giây trước khi dùng lại lệnh \`${commandName}\`!`, ephemeral: true });
        }
    }
    timestamps.set(userId, now);
    setTimeout(() => timestamps.delete(userId), cooldownAmount);

    try {
        await interaction.deferReply();
        switch (commandName) {
            case 'help':
                const helpEmbed = new EmbedBuilder()
                    .setTitle('🌱 Hướng Dẫn Bot Chăm Cây')
                    .setColor(0x00FF7F)
                    .addFields(
                        { name: '🌤️ Thời Tiết', value: '`/weather <thành phố>` - Xem thời tiết Việt Nam', inline: false },
                        { name: '🌱 Chăm Cây', value: '`/plant` - Xem cây\n`/plant <tên cây>` - Trồng cây\n`/garden` - Xem vườn\n`/water <tên cây>` - Tưới nước\n`/sun <tên cây>` - Cho ánh sáng', inline: false },
                        { name: '🏪 Kinh Tế', value: '`/daily` - Nhận thưởng hàng ngày\n`/shop` - Xem cửa hàng\n`/buy <tên cây>` - Mua cây', inline: false },
                        { name: '📊 Xếp Hạng', value: '`/leaderboard` - Xem bảng xếp hạng', inline: false }
                    )
                    .setFooter({ text: 'FREE TOOL BY TW1SK' });
                await interaction.editReply({ embeds: [helpEmbed] });
                break;

            case 'weather':
                const city = interaction.options.getString('city');
                if (!city) return interaction.editReply({ content: 'Hãy nhập tên thành phố!', ephemeral: true });
                const weather = await getWeatherVietnam(city);
                if (!weather) return interaction.editReply({ content: '❌ Không tìm thấy thông tin thời tiết! Kiểm tra tên thành phố hoặc API key.', ephemeral: true });
                const weatherEmbed = new EmbedBuilder()
                    .setTitle(`🌤️ Thời Tiết ${weather.city}`)
                    .setColor(0x87CEEB)
                    .addFields(
                        { name: '🌡️ Nhiệt độ', value: `${weather.temp}°C`, inline: true },
                        { name: '💧 Độ ẩm', value: `${weather.humidity}%`, inline: true },
                        { name: '🌤️ Thời tiết', value: `${weather.emoji} ${weather.weather}`, inline: true },
                        { name: '💨 Gió', value: `${weather.windSpeed} m/s - ${weather.windDirection}`, inline: true },
                        { name: '🌱 Gợi ý', value: weather.isRainy ? 'Hôm nay có mưa, tưới ít nước thôi!' : 'Thời tiết đẹp, hãy tưới cây đều đặn!', inline: false }
                    )
                    .setFooter({ text: 'Dữ liệu từ OpenWeatherMap | FREE TOOL BY TW1SK' });
                await interaction.editReply({ embeds: [weatherEmbed] });
                break;

            case 'plant':
                const plantName = interaction.options.getString('name');
                if (!plantName) {
                    const plantsEmbed = new EmbedBuilder()
                        .setTitle('🌱 Danh Sách Cây Có Thể Trồng')
                        .setColor(0x90EE90)
                        .addFields(
                            { name: '🌿 Cây Cơ Bản', value: plantsDatabase.basic.map(p => `${p.emoji} ${p.name} (${p.cost} coins)`).join('\n') || 'Không có', inline: true },
                            { name: '⭐ Cây Hiếm', value: plantsDatabase.rare.map(p => `${p.emoji} ${p.name} (${p.cost} coins)`).join('\n') || 'Không có', inline: true },
                            { name: '🌟 Cây Huyền Thoại', value: plantsDatabase.legendary.map(p => `${p.emoji} ${p.name} (${p.cost} coins)`).join('\n') || 'Không có', inline: true }
                        )
                        .setFooter({ text: 'Sử dụng: /plant <tên cây> | FREE TOOL BY TW1SK' });
                    return interaction.editReply({ embeds: [plantsEmbed] });
                }
                const plantResult = plantSeed(userId, plantName);
                if (plantResult.success) {
                    const plantEmbed = new EmbedBuilder()
                        .setTitle('🌱 Trồng Cây Thành Công!')
                        .setDescription(`${plantResult.plant.emoji} **${plantResult.plant.name}**`)
                        .addFields(
                            { name: '📝 Mô tả', value: plantResult.plant.description, inline: false },
                            { name: '💧 Nhu cầu nước', value: `${plantResult.plant.waterNeed}/10`, inline: true },
                            { name: '☀️ Nhu cầu ánh sáng', value: `${plantResult.plant.sunNeed}/10`, inline: true },
                            { name: '⭐ Độ hiếm', value: plantResult.plant.rarity, inline: true }
                        )
                        .setColor(0x90EE90)
                        .setFooter({ text: 'FREE TOOL BY TW1SK' });
                    await interaction.editReply({ embeds: [plantEmbed] });
                } else {
                    await interaction.editReply({ content: plantResult.message, ephemeral: true });
                }
                break;

            case 'garden':
                initUser(userId);
                const userGarden = gardenData[userId];
                const plants = Object.values(userGarden.plants);
                if (plants.length === 0) return interaction.editReply({ content: '🌱 Vườn của bạn trống! Trồng cây bằng `/plant`', ephemeral: true });
                const gardenEmbed = new EmbedBuilder()
                    .setTitle(`🏡 Vườn của ${user.displayName}`)
                    .setColor(0x228B22)
                    .addFields(
                        { name: '👤 Thông tin', value: `**Level:** ${userGarden.level}\n**EXP:** ${userGarden.exp}/${userGarden.level * 100}\n**Coins:** ${userGarden.coins}`, inline: true },
                        { name: '🌱 Tổng số cây', value: `${plants.length} cây`, inline: true }
                    );
                plants.forEach((plant, index) => {
                    const healthBar = getHealthBar(plant.health);
                    const growthBar = getHealthBar(plant.growth);
                    gardenEmbed.addFields({
                        name: `${plant.emoji} ${plant.name} (${plant.stage})`,
                        value: `❤️ ${healthBar} ${plant.health}%\n🌱 ${growthBar} ${plant.growth}%`,
                        inline: true
                    });
                });
                await interaction.editReply({ embeds: [gardenEmbed] });
                break;

            case 'water':
                const waterPlantName = interaction.options.getString('name');
                const waterResult = waterPlant(userId, waterPlantName);
                await interaction.editReply({ content: waterResult.message, ephemeral: !waterResult.success });
                break;

            case 'sun':
                const sunPlantName = interaction.options.getString('name');
                const sunResult = giveSunlight(userId, sunPlantName);
                await interaction.editReply({ content: sunResult.message, ephemeral: !sunResult.success });
                break;

            case 'daily':
                const dailyResult = claimDaily(userId);
                await interaction.editReply({ content: dailyResult.message, ephemeral: !dailyResult.success });
                break;

            case 'shop':
                const shopEmbed = new EmbedBuilder()
                    .setTitle('🏪 Cửa Hàng Cây')
                    .setColor(0xFFD700)
                    .addFields({ name: '🌱 Cây Có Sẵn', value: viewShop().join('\n') || 'Cửa hàng trống!', inline: false })
                    .setFooter({ text: 'Sử dụng: /buy <tên cây> | FREE TOOL BY TW1SK' });
                await interaction.editReply({ embeds: [shopEmbed] });
                break;

            case 'buy':
                const buyPlantName = interaction.options.getString('name');
                const buyResult = buyPlant(userId, buyPlantName);
                await interaction.editReply({ content: buyResult.message, ephemeral: !buyResult.success });
                break;

            case 'leaderboard':
                console.log('📊 Processing /leaderboard for user:', userId);
                const leaderboard = getLeaderboard();
                console.log('📊 Leaderboard result:', leaderboard);
                const leaderboardEmbed = new EmbedBuilder()
                    .setTitle('🏆 Bảng Xếp Hạng Nhà Vườn')
                    .setColor(0xFFA500)
                    .setDescription(leaderboard.length ? 'Danh sách các nhà vườn xuất sắc!' : 'Chưa có ai trong bảng xếp hạng! Hãy dùng `/daily` hoặc `/plant` để bắt đầu.');
                if (leaderboard.length === 0) {
                    await interaction.editReply({ embeds: [leaderboardEmbed] });
                    console.log('📊 Sent empty leaderboard embed');
                    break;
                }
                for (let i = 0; i < leaderboard.length; i++) {
                    console.log('📊 Fetching user:', leaderboard[i].userId);
                    try {
                        const lbUser = await client.users.fetch(leaderboard[i].userId).catch(() => null);
                        leaderboardEmbed.addFields({
                            name: `${i + 1}. ${lbUser ? lbUser.tag : 'Người dùng không xác định'}`,
                            value: `Level: ${leaderboard[i].level} | EXP: ${leaderboard[i].exp}`,
                            inline: false
                        });
                    } catch (error) {
                        console.error('❌ Error fetching user:', leaderboard[i].userId, error.message);
                        leaderboardEmbed.addFields({
                            name: `${i + 1}. Người dùng không xác định`,
                            value: `Level: ${leaderboard[i].level} | EXP: ${leaderboard[i].exp}`,
                            inline: false
                        });
                    }
                }
                await interaction.editReply({ embeds: [leaderboardEmbed] });
                console.log('📊 Sent leaderboard embed');
                break;
        }
    } catch (error) {
        console.error(`❌ Error in command ${commandName}:`, error.message);
        await interaction.editReply({ content: '❌ Có lỗi xảy ra! Vui lòng thử lại sau.', ephemeral: true }).catch(console.error);
    }
});

// Support Functions
function getHealthBar(value) {
    const bars = Math.floor(value / 10);
    return '🟩'.repeat(bars) + '⬜'.repeat(10 - bars);
}

// Keep Alive Server
if (process.env.NODE_ENV !== 'development') {
    require('./keep_alive');
}

// Start Bot
client.login(config.token).catch((error) => {
    console.error('❌ Error logging in:', error.message);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});
