"use strict";
/**
 * Sign-in sessions (services/sessionService.js): one row per sign-in, so a session can be ended at
 * once (sign out a device, sign out everywhere, inactivity, deactivated account, new password).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("user_sessions", {
      session_id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      user_id: { type: Sequelize.UUID, allowNull: false, references: { model: "users", key: "user_id" }, onDelete: "CASCADE" },
      ip: { type: Sequelize.STRING(64), allowNull: true },
      user_agent: { type: Sequelize.STRING(500), allowNull: true },
      // "Chrome on Android" …
      device: { type: Sequelize.STRING(120), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      last_seen_at: { type: Sequelize.DATE, allowNull: false },
      expires_at: { type: Sequelize.DATE, allowNull: false },
      ended_at: { type: Sequelize.DATE, allowNull: true },
      // signed_out | signed_out_by_user | signed_out_by_admin | inactive | password_changed | deactivated | expired
      end_reason: { type: Sequelize.STRING(30), allowNull: true },
      ended_by: { type: Sequelize.UUID, allowNull: true },
    });
    await queryInterface.addIndex("user_sessions", ["user_id", "ended_at"], { name: "user_sessions_user_open" });
  },
  async down(queryInterface) {
    await queryInterface.dropTable("user_sessions");
  },
};
