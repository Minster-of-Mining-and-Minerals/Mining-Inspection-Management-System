"use strict";
/**
 * Audit log (services/auditService.js): one row per change request of any account (and every sign-in),
 * with what changed. Append-only: the app never edits or deletes rows (old rows are removed after the
 * retention time, AUDIT_RETENTION_DAYS, default 730).
 * Adds the permission audit:read and gives it to central_admin and sector_admin.
 */
const { v4: uuidv4 } = require("uuid");

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("audit_logs", {
      audit_id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      occurred_at: { type: Sequelize.DATE, allowNull: false },
      // Who (copied, so the row stays readable when the account changes)
      actor_id: { type: Sequelize.UUID, allowNull: true },
      actor_name: { type: Sequelize.STRING(200), allowNull: true },
      actor_email: { type: Sequelize.STRING(255), allowNull: true },
      actor_sector_id: { type: Sequelize.UUID, allowNull: true },
      session_id: { type: Sequelize.UUID, allowNull: true },
      // What: e.g. auth.login, users.update, inspections.submit
      action: { type: Sequelize.STRING(80), allowNull: false },
      entity_type: { type: Sequelize.STRING(60), allowNull: true },
      entity_id: { type: Sequelize.UUID, allowNull: true },
      entity_label: { type: Sequelize.STRING(300), allowNull: true },
      entity_sector_id: { type: Sequelize.UUID, allowNull: true },
      // [{ model, id, op, label?, before?, after? }] — never passwords or codes
      changes: { type: Sequelize.JSONB, allowNull: true },
      outcome: { type: Sequelize.STRING(10), allowNull: false },
      status_code: { type: Sequelize.INTEGER, allowNull: true },
      message: { type: Sequelize.STRING(500), allowNull: true },
      method: { type: Sequelize.STRING(10), allowNull: true },
      path: { type: Sequelize.STRING(300), allowNull: true },
      ip: { type: Sequelize.STRING(64), allowNull: true },
      user_agent: { type: Sequelize.STRING(500), allowNull: true },
    });
    await queryInterface.addIndex("audit_logs", ["occurred_at"], { name: "audit_logs_time" });
    await queryInterface.addIndex("audit_logs", ["actor_id", "occurred_at"], { name: "audit_logs_actor" });
    await queryInterface.addIndex("audit_logs", ["entity_id"], { name: "audit_logs_entity" });
    await queryInterface.addIndex("audit_logs", ["actor_sector_id"], { name: "audit_logs_actor_sector" });
    await queryInterface.addIndex("audit_logs", ["entity_sector_id"], { name: "audit_logs_entity_sector" });

    // Permission audit:read for the administrators
    const now = new Date();
    const [existing] = await queryInterface.sequelize.query(`SELECT permission_id FROM permissions WHERE resource = 'audit' AND action = 'read'`);
    let permissionId = existing[0]?.permission_id;
    if (!permissionId) {
      permissionId = uuidv4();
      await queryInterface.bulkInsert("permissions", [{ permission_id: permissionId, resource: "audit", action: "read", is_active: true, created_at: now, updated_at: now }]);
    }
    const [roles] = await queryInterface.sequelize.query(`SELECT role_id FROM roles WHERE name IN ('central_admin', 'sector_admin')`);
    for (const { role_id } of roles) {
      const [link] = await queryInterface.sequelize.query(`SELECT 1 FROM role_permissions WHERE role_id = :role_id AND permission_id = :permissionId`, { replacements: { role_id, permissionId } });
      if (!link.length) await queryInterface.bulkInsert("role_permissions", [{ role_permission_id: uuidv4(), role_id, permission_id: permissionId, is_active: true, created_at: now, updated_at: now }]);
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable("audit_logs");
  },
};
