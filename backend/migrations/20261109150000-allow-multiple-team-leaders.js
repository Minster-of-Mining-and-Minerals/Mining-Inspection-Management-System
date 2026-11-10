"use strict";

/**
 * Allows multiple leaders per inspection team.
 * Drops the partial unique index `team_members_one_leader`.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      "DROP INDEX IF EXISTS team_members_one_leader;"
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      "CREATE UNIQUE INDEX IF NOT EXISTS team_members_one_leader ON team_members (team_id) WHERE left_on IS NULL AND role = 'leader';"
    );
  },
};

