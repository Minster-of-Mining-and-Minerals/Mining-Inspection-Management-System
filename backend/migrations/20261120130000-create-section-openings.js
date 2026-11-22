"use strict";
/**
 * "Open sections for update": a reviewer opens chosen sections of submitted inspections so the
 * team can fill in or correct them until a deadline. Only adds two new tables; nothing existing changes.
 *
 *   section_openings       one opening: which sections, until when, why, who opened / closed it
 *   section_opening_items  the submitted inspections it covers: waiting → done ("Done updating")
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    const userRef = { type: Sequelize.UUID, allowNull: true, references: { model: "users", key: "user_id" }, onDelete: "SET NULL" };
    const ts = {
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    };
    try {
      await queryInterface.createTable(
        "section_openings",
        {
          opening_id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
          sector_node_id: { type: Sequelize.UUID, allowNull: false, references: { model: "sector_nodes", key: "sector_node_id" }, onDelete: "CASCADE" },
          // inspection | licenses | round | team | region
          scope: { type: Sequelize.STRING(20), allowNull: false },
          // the choices behind the scope: schedule_id, occurrence_date, team_id, region_id, license_ids
          scope_details: { type: Sequelize.JSONB, allowNull: true },
          schedule_id: { type: Sequelize.UUID, allowNull: true, references: { model: "inspection_schedules", key: "schedule_id" }, onDelete: "SET NULL" },
          section_keys: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
          // section titles at the time it was opened (for history and notifications)
          section_labels: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
          reason: { type: Sequelize.TEXT, allowNull: false },
          until: { type: Sequelize.DATE, allowNull: false },
          opened_by: userRef,
          closed_at: { type: Sequelize.DATE, allowNull: true },
          closed_by: userRef,
          // manual | deadline | all_done
          close_reason: { type: Sequelize.STRING(20), allowNull: true },
          ...ts,
        },
        { transaction },
      );
      await queryInterface.addIndex("section_openings", ["sector_node_id", "closed_at"], { transaction });
      await queryInterface.addIndex("section_openings", ["schedule_id"], { transaction });

      await queryInterface.createTable(
        "section_opening_items",
        {
          item_id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
          opening_id: { type: Sequelize.UUID, allowNull: false, references: { model: "section_openings", key: "opening_id" }, onDelete: "CASCADE" },
          inspection_id: { type: Sequelize.UUID, allowNull: false, references: { model: "inspections", key: "inspection_id" }, onDelete: "CASCADE" },
          // waiting | done
          status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: "waiting" },
          done_at: { type: Sequelize.DATE, allowNull: true },
          done_by: userRef,
          // questions changed while open: { question_key: { at, by } }
          changed_answers: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
          ...ts,
        },
        { transaction },
      );
      await queryInterface.addIndex("section_opening_items", ["opening_id", "inspection_id"], { unique: true, transaction });
      await queryInterface.addIndex("section_opening_items", ["inspection_id"], { transaction });
      await transaction.commit();
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable("section_opening_items");
    await queryInterface.dropTable("section_openings");
  },
};
