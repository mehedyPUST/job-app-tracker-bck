// backend/scripts/addAvatarField.js
const { connectDB, getDB, closeDB } = require('../src/config/db');

(async () => {
    try {
        await connectDB();
        const db = getDB();
        const result = await db.collection('users').updateMany(
            { avatar: { $exists: false } },
            { $set: { avatar: '' } }
        );
        console.log(`✅ Added avatar field to ${result.modifiedCount} users.`);
        await closeDB();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
})();