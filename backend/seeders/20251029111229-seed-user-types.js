"use strict";
const { v4: uuidv4 } = require("uuid");

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();

    // Seeders are not tracked, so `npm run seed` re-runs this: skip types that already exist
    await queryInterface.bulkInsert("user_types", [
      {
        user_type_id: uuidv4(),
        name: "external",
        description: "External user type for development or testing purposes.",
        created_at: now,
        updated_at: now,
      },
      {
        user_type_id: uuidv4(),
        name: "internal",
        description: "Internal user type for development or testing purposes.",
        created_at: now,
        updated_at: now,
      },
    ], { ignoreDuplicates: true });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete("user_types", null, {});
  },
};
