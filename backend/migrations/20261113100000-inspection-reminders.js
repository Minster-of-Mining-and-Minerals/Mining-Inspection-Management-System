"use strict";
/**
 * When the team was reminded that a task is due soon / overdue (services/inspectionNotifications.js),
 * so each task is reminded once of each. Changing the due date clears them.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("inspections", "due_soon_notified_at", { type: Sequelize.DATE, allowNull: true });
    await queryInterface.addColumn("inspections", "overdue_notified_at", { type: Sequelize.DATE, allowNull: true });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn("inspections", "overdue_notified_at");
    await queryInterface.removeColumn("inspections", "due_soon_notified_at");
  },
};
