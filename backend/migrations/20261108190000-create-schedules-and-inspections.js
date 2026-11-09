"use strict";

/**
 * Inspection schedules and the tasks (inspections) they create.
 *
 *   inspection_schedules   a form + which licenses + how often (once, daily, weekly …) + time allowed
 *   schedule_licenses      the licenses chosen one by one (target_type = 'licenses')
 *   inspections            one task per license per occurrence; the team fills it once and submits
 *   inspection_events      history of a task: started, submitted, returned, reassigned, due date changed
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    const ts = {
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    };
    const userRef = { type: Sequelize.UUID, allowNull: true, references: { model: "users", key: "user_id" }, onDelete: "SET NULL" };
    try {
      await queryInterface.createTable(
        "inspection_schedules",
        {
          schedule_id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
          form_id: { type: Sequelize.UUID, allowNull: false, references: { model: "forms", key: "form_id" }, onDelete: "RESTRICT" },
          name: { type: Sequelize.STRING(200), allowNull: false },
          // who: 'assigned' = licenses the form is assigned to, 'license_type', or 'licenses' (chosen)
          target_type: { type: Sequelize.STRING(20), allowNull: false, defaultValue: "assigned" },
          license_type: { type: Sequelize.STRING(20), allowNull: true },
          // how often
          frequency: { type: Sequelize.STRING(20), allowNull: false }, // once | daily | weekly | monthly | quarterly | yearly | every_n_days
          interval_days: { type: Sequelize.INTEGER, allowNull: true }, // every_n_days
          weekdays: { type: Sequelize.ARRAY(Sequelize.INTEGER), allowNull: true }, // daily: which days (0 = Sunday); weekly: the day it opens
          month_day: { type: Sequelize.INTEGER, allowNull: true }, // monthly / quarterly / yearly: day of the month it opens (1–28)
          start_date: { type: Sequelize.DATEONLY, allowNull: false },
          end_date: { type: Sequelize.DATEONLY, allowNull: true },
          due_days: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 }, // days allowed to submit each task
          status: { type: Sequelize.STRING(10), allowNull: false, defaultValue: "active" }, // active | paused | ended
          notes: { type: Sequelize.TEXT, allowNull: true },
          last_generated_on: { type: Sequelize.DATEONLY, allowNull: true },
          created_by: userRef,
          ...ts,
        },
        { transaction },
      );
      await queryInterface.addIndex("inspection_schedules", ["form_id"], { transaction });
      await queryInterface.sequelize.query(
        `ALTER TABLE inspection_schedules
           ADD CONSTRAINT inspection_schedules_frequency_check CHECK (frequency IN ('once','daily','weekly','monthly','quarterly','yearly','every_n_days')),
           ADD CONSTRAINT inspection_schedules_target_check CHECK (target_type IN ('assigned','license_type','licenses')),
           ADD CONSTRAINT inspection_schedules_status_check CHECK (status IN ('active','paused','ended')),
           ADD CONSTRAINT inspection_schedules_due_days_check CHECK (due_days BETWEEN 1 AND 366)`,
        { transaction },
      );

      await queryInterface.createTable(
        "schedule_licenses",
        {
          schedule_id: { type: Sequelize.UUID, primaryKey: true, references: { model: "inspection_schedules", key: "schedule_id" }, onDelete: "CASCADE" },
          license_id: { type: Sequelize.UUID, primaryKey: true, references: { model: "company_licenses", key: "license_id" }, onDelete: "CASCADE" },
        },
        { transaction },
      );

      await queryInterface.createTable(
        "inspections",
        {
          inspection_id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
          schedule_id: { type: Sequelize.UUID, allowNull: true, references: { model: "inspection_schedules", key: "schedule_id" }, onDelete: "SET NULL" },
          form_id: { type: Sequelize.UUID, allowNull: false, references: { model: "forms", key: "form_id" }, onDelete: "RESTRICT" },
          // set when the team starts filling it (the form's current version then); kept afterwards
          form_version_id: { type: Sequelize.UUID, allowNull: true, references: { model: "form_versions", key: "version_id" }, onDelete: "RESTRICT" },
          license_id: { type: Sequelize.UUID, allowNull: false, references: { model: "company_licenses", key: "license_id" }, onDelete: "RESTRICT" },
          company_id: { type: Sequelize.UUID, allowNull: false, references: { model: "companies", key: "company_id" }, onDelete: "RESTRICT" },
          team_id: { type: Sequelize.UUID, allowNull: true, references: { model: "teams", key: "team_id" }, onDelete: "SET NULL" },
          occurrence_date: { type: Sequelize.DATEONLY, allowNull: false }, // the day it opens
          due_at: { type: Sequelize.DATE, allowNull: false },
          status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: "todo" }, // todo | in_progress | submitted
          answers: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
          score: { type: Sequelize.DECIMAL(6, 4), allowNull: true }, // 0…1
          started_at: { type: Sequelize.DATE, allowNull: true },
          started_by: userRef,
          last_saved_at: { type: Sequelize.DATE, allowNull: true },
          last_saved_by: userRef,
          submitted_at: { type: Sequelize.DATE, allowNull: true },
          submitted_by: userRef,
          is_late: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
          // where and on what the inspection was submitted (checked in Step 5)
          submit_location: { type: Sequelize.JSONB, allowNull: true }, // { lat, lng, accuracy, captured_at } or { error }
          submit_device: { type: Sequelize.JSONB, allowNull: true }, // { user_agent, platform, language, screen }
          submit_ip: { type: Sequelize.STRING(64), allowNull: true },
          return_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
          ...ts,
        },
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE inspections ADD CONSTRAINT inspections_status_check CHECK (status IN ('todo','in_progress','submitted'))`,
        { transaction },
      );
      // One task per license per occurrence of a schedule
      await queryInterface.addIndex("inspections", ["schedule_id", "license_id", "occurrence_date"], {
        unique: true,
        name: "inspections_schedule_license_occurrence_unique",
        transaction,
      });
      await queryInterface.addIndex("inspections", ["team_id", "status"], { transaction });
      await queryInterface.addIndex("inspections", ["license_id", "occurrence_date"], { transaction });
      await queryInterface.addIndex("inspections", ["form_version_id"], { transaction });

      await queryInterface.createTable(
        "inspection_events",
        {
          event_id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
          inspection_id: { type: Sequelize.UUID, allowNull: false, references: { model: "inspections", key: "inspection_id" }, onDelete: "CASCADE" },
          type: { type: Sequelize.STRING(20), allowNull: false }, // started | submitted | returned | reassigned | due_changed
          user_id: userRef,
          details: { type: Sequelize.JSONB, allowNull: true },
          created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
        },
        { transaction },
      );
      await queryInterface.addIndex("inspection_events", ["inspection_id", "created_at"], { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable("inspection_events");
    await queryInterface.dropTable("inspections");
    await queryInterface.dropTable("schedule_licenses");
    await queryInterface.dropTable("inspection_schedules");
  },
};
