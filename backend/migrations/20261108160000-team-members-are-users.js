"use strict";

/**
 * Team members must be user accounts (they sign in and fill inspection forms),
 * and a person can be in only one team at a time.
 *
 *  - removes name-only members (the license list import re-creates them as users)
 *  - if anyone is active in two teams, keeps the most recent membership and
 *    closes the others as of today
 *  - user_id becomes required; the name-only column and its rules are dropped
 *  - new rule: one active team per user
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    try {
      await q(`DELETE FROM team_members WHERE user_id IS NULL`);
      await q(`
        UPDATE team_members tm SET left_on = GREATEST(CURRENT_DATE, tm.joined_on), updated_at = NOW()
        WHERE tm.left_on IS NULL AND EXISTS (
          SELECT 1 FROM team_members newer
          WHERE newer.user_id = tm.user_id AND newer.left_on IS NULL
            AND (newer.joined_on, newer.created_at) > (tm.joined_on, tm.created_at)
        )`);

      await q(`ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_who_check`);
      await q(`DROP INDEX IF EXISTS team_members_active_pending`);
      await q(`DROP INDEX IF EXISTS team_members_active_user`);
      await queryInterface.removeColumn("team_members", "pending_name", { transaction });
      await queryInterface.changeColumn(
        "team_members",
        "user_id",
        {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: "users", key: "user_id" },
          onUpdate: "CASCADE",
          onDelete: "RESTRICT",
        },
        { transaction },
      );
      await q(`CREATE UNIQUE INDEX team_members_one_active_team ON team_members (user_id) WHERE left_on IS NULL`);

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    try {
      await q(`DROP INDEX IF EXISTS team_members_one_active_team`);
      await queryInterface.changeColumn("team_members", "user_id", { type: Sequelize.UUID, allowNull: true }, { transaction });
      await queryInterface.addColumn("team_members", "pending_name", { type: Sequelize.STRING(150), allowNull: true }, { transaction });
      await q(`ALTER TABLE team_members ADD CONSTRAINT team_members_who_check CHECK (user_id IS NOT NULL OR pending_name IS NOT NULL)`);
      await q(`CREATE UNIQUE INDEX team_members_active_user ON team_members (team_id, user_id) WHERE left_on IS NULL AND user_id IS NOT NULL`);
      await q(`CREATE UNIQUE INDEX team_members_active_pending ON team_members (team_id, lower(pending_name)) WHERE left_on IS NULL AND user_id IS NULL`);
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
