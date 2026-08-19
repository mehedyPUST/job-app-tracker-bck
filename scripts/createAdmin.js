// scripts/createAdmin.js
const { connectDB, getDB, closeDB } = require('../src/config/db');
const User = require('../src/models/User');
require('dotenv').config();

const createAdmin = async () => {
    try {
        await connectDB();

        const adminEmail = 'admin@jobtracker.com';
        const existingAdmin = await User.findByEmail(adminEmail);

        if (existingAdmin) {
            console.log('✅ Admin already exists');
            await closeDB();
            process.exit(0);
        }

        const admin = await User.create({
            name: 'Admin User',
            email: adminEmail,
            password: 'Admin123456!',
            role: 'admin'
        });

        console.log('✅ Admin user created successfully');
        console.log(`📧 Email: ${adminEmail}`);
        console.log(`🔑 Password: Admin123456!`);
        console.log(`🆔 User ID: ${admin._id}`);

        await closeDB();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error creating admin:', error);
        await closeDB();
        process.exit(1);
    }
};

createAdmin();