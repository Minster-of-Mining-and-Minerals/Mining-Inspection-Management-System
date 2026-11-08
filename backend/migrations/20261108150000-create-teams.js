"use strict";

/**
 * Inspection teams, their members and the licenses each team is responsible for.
 *
 * A member is either a user account, or (until an account exists) just a name:
 * the license list names inspectors but has no emails, so members can be added
 * first and given an account later. Leaving a team sets left_on, so history is kept.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    const ts = {
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    };
    try {
      await queryInterface.createTable(
        "teams",
        {
          team_id: { type: Sequelize.UUID, primaryKey: true, allowNull: false, defaultValue: Sequelize.UUIDV4 },
          name: { type: Sequelize.STRING(120), allowNull: false, unique: true },
          // Short reference, e.g. "1" for "Team 1" in the license list
          code: { type: Sequelize.STRING(30), allowNull: true, unique: true },
          description: { type: Sequelize.TEXT, allowNull: true },
          is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
          created_by: { type: Sequelize.UUID, allowNull: true },
          ...ts,
        },
        { transaction },
      );

      await queryInterface.createTable(
        "team_members",
        {
          team_member_id: { type: Sequelize.UUID, primaryKey: true, allowNull: false, defaultValue: Sequelize.UUIDV4 },
          team_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "teams", key: "team_id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
          user_id: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: "users", key: "user_id" },
            onUpdate: "CASCADE",
            onDelete: "RESTRICT",
          },
          // Name of a member who has no account yet
          pending_name: { type: Sequelize.STRING(150), allowNull: true },
          // leader | member
          role: { type: Sequelize.STRING(10), allowNull: false, defaultValue: "member" },
          joined_on: { type: Sequelize.DATEONLY, allowNull: false },
          left_on: { type: Sequelize.DATEONLY, allowNull: true },
          created_by: { type: Sequelize.UUID, allowNull: true },
          ...ts,
        },
        { transaction },
      );
      await q(`ALTER TABLE team_members ADD CONSTRAINT team_members_who_check CHECK (user_id IS NOT NULL OR pending_name IS NOT NULL)`);
      await q(`ALTER TABLE team_members ADD CONSTRAINT team_members_role_check CHECK (role IN ('leader', 'member'))`);
      // While in the team: one row per person, and at most one leader
      await q(`CREATE UNIQUE INDEX team_members_active_user ON team_members (team_id, user_id) WHERE left_on IS NULL AND user_id IS NOT NULL`);
      await q(`CREATE UNIQUE INDEX team_members_active_pending ON team_members (team_id, lower(pending_name)) WHERE left_on IS NULL AND user_id IS NULL`);
      await q(`CREATE UNIQUE INDEX team_members_one_leader ON team_members (team_id) WHERE left_on IS NULL AND role = 'leader'`);
      await queryInterface.addIndex("team_members", ["user_id"], { transaction });

      // Licenses a team is responsible for (used when planning inspection rounds)
      await queryInterface.createTable(
        "team_licenses",
        {
          team_id: {
            type: Sequelize.UUID,
            allowNull: false,
            primaryKey: true,
            references: { model: "teams", key: "team_id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
          license_id: {
            type: Sequelize.UUID,
            allowNull: false,
            primaryKey: true,
            references: { model: "company_licenses", key: "license_id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
          created_by: { type: Sequelize.UUID, allowNull: true },
          created_at: { type: Sequelize.DATE, allowNull: false },
        },
        { transaction },
      );
      await queryInterface.addIndex("team_licenses", ["license_id"], { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable("team_licenses");
    await queryInterface.dropTable("team_members");
    await queryInterface.dropTable("teams");
  },
};
