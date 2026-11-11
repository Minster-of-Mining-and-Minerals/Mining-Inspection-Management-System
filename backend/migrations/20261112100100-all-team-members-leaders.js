"use strict";
/**
 * Every current team member becomes a team leader (all members can submit for their team), and
 * gets the global team_leader role, as the app gives it when someone is made leader
 * (services/teamMembershipService.js ensureRole). People who left a team keep their history as is.
 * New members are leaders by default from now on (the importers, Add member, Create user).
 *
 * down: not undone; make someone a member again on the team's page.
 */
const { v4: uuidv4 } = require("uuid");

module.exports = {
  async up(queryInterface) {
    const seq = queryInterface.sequelize;
    const select = (sql, replacements = {}) => seq.query(sql, { replacements, type: seq.QueryTypes.SELECT });
    const transaction = await seq.transaction();
    try {
      const [, made] = await seq.query(`UPDATE team_members SET role = 'leader', updated_at = NOW() WHERE left_on IS NULL AND role <> 'leader'`, { transaction });
      const [role] = await select(`SELECT role_id FROM roles WHERE name = 'team_leader' AND sector_node_id IS NULL AND is_active = true LIMIT 1`);
      let granted = 0;
      if (role) {
        await seq.query(
          `UPDATE user_roles SET is_active = true, updated_at = NOW()
            WHERE role_id = :role AND is_active = false AND user_id IN (SELECT user_id FROM team_members WHERE left_on IS NULL)`,
          { replacements: { role: role.role_id }, transaction },
        );
        const missing = await seq.query(
          `SELECT DISTINCT m.user_id FROM team_members m
            WHERE m.left_on IS NULL AND NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = m.user_id AND ur.role_id = :role)`,
          { replacements: { role: role.role_id }, type: seq.QueryTypes.SELECT, transaction },
        );
        const now = new Date();
        if (missing.length)
          await queryInterface.bulkInsert(
            "user_roles",
            missing.map((m) => ({ user_role_id: uuidv4(), user_id: m.user_id, role_id: role.role_id, is_active: true, assigned_at: now, created_at: now, updated_at: now })),
            { transaction },
          );
        granted = missing.length;
      }
      await transaction.commit();
      const count = made?.rowCount ?? 0;
      if (count || granted) console.log(`Team members made leaders: ${count}; team_leader role given to ${granted}.`);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down() {},
};
