"use strict";

/**
 * "Once" schedules used to be marked ended on their start date, so licenses added during their
 * round never got a task. They now end when the round's due time passes (services/scheduleService.js).
 * This reopens the ones that ended that way while their round is still open; the hourly run then
 * gives the licenses without a task theirs. Schedules an admin ended (they have an end date) and
 * rounds already due are left alone. No task, answer or submission is changed.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE inspection_schedules s
         SET status = 'active', updated_at = NOW()
       WHERE s.status = 'ended'
         AND s.frequency = 'once'
         AND s.end_date IS NULL
         AND EXISTS (SELECT 1 FROM inspections i WHERE i.schedule_id = s.schedule_id AND i.due_at > NOW())`);
  },

  async down() {
    // Nothing to undo: the schedules end again by themselves when their round is due.
  },
};
