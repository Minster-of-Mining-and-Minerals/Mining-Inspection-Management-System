const { Op, literal } = require("sequelize");
const { validate: isUuid } = require("uuid");
const { sequelize, Form, FormVersion, FormAssignment, FormVersionEdit, Company, CompanyLicense, User } = require("../../models");
const { diffDefinitions } = require("../../utils/formDiff");
const { countInspectionsForVersion } = require("../../services/formUsageService");
const { validateDefinition, summarizeDefinition, emptyDefinition } = require("../../utils/formDefinition");
const { likeContains, escapeLike } = require("../../utils/search");

const fail = (res, status, message, extra) => res.status(status).json({ success: false, message, ...extra });
const err = (status, message, extra) => Object.assign(new Error(message), { status, extra });

const handleError = (res, error, fallback) => {
  if (error.status) return fail(res, error.status, error.message, error.extra);
  if (error.name === "SequelizeUniqueConstraintError") {
    const c = error.parent?.constraint || "";
    if (c.includes("assignments_unique")) return fail(res, 409, "This checklist already applies to that.");
    if (c.includes("one_draft")) return fail(res, 409, "This checklist already has a draft.");
    if (c.includes("code")) return fail(res, 409, "Another checklist already uses this code.");
    return fail(res, 409, "This already exists.");
  }
  console.error(fallback, error);
  return fail(res, 500, fallback);
};

const VERSION_META = ["version_id", "form_id", "version_number", "status", "change_note", "published_at", "published_by", "created_at", "updated_at"];
const versionMeta = (v) => ({ ...Object.fromEntries(VERSION_META.map((k) => [k, v[k]])), edit_count: v.get ? v.get("edit_count") ?? 0 : 0 });

const findForm = async (id, transaction) => {
  if (!isUuid(id)) throw err(400, "Invalid checklist id.");
  const form = await Form.findByPk(id, { transaction });
  if (!form) throw err(404, "Checklist not found.");
  return form;
};

/** Form with its version list (no definitions) plus the current published and draft definitions. */
const loadForm = async (id, transaction) => {
  const form = await findForm(id, transaction);
  const versions = await FormVersion.findAll({
    where: { form_id: id },
    attributes: { include: [[literal(`(SELECT COUNT(*)::int FROM form_version_edits e WHERE e.version_id = "FormVersion"."version_id")`), "edit_count"]] },
    order: [["version_number", "DESC"]],
    transaction,
  });
  const published = versions.find((v) => v.status === "published") || null;
  const draft = versions.find((v) => v.status === "draft") || null;
  const assignment_count = await FormAssignment.count({ where: { form_id: id }, transaction });
  const pick = (v) => (v ? { ...versionMeta(v), definition: v.definition, summary: summarizeDefinition(v.definition) } : null);
  const inspections = published ? await countInspectionsForVersion(published.version_id, transaction) : 0;
  return {
    ...form.toJSON(),
    assignment_count,
    published: published ? { ...pick(published), inspection_count: inspections } : null,
    draft: pick(draft),
    versions: versions.map((v) => ({ ...versionMeta(v), summary: summarizeDefinition(v.definition) })),
  };
};

/* =================== Forms =================== */
const getForms = async (req, res) => {
  try {
    const where = {};
    if (req.query.is_active === "true" || req.query.is_active === "false") where.is_active = req.query.is_active === "true";
    if (req.query.search?.trim()) {
      const term = likeContains(req.query.search);
      where[Op.or] = [{ name: { [Op.iLike]: term } }, { name_am: { [Op.iLike]: term } }, { code: { [Op.iLike]: term } }];
    }
    const forms = await Form.findAll({
      where,
      attributes: {
        include: [
          [literal(`(SELECT COUNT(*)::int FROM form_assignments a WHERE a.form_id = "Form"."form_id")`), "assignment_count"],
          [literal(`(SELECT COUNT(*)::int FROM form_versions v WHERE v.form_id = "Form"."form_id")`), "version_count"],
        ],
      },
      order: [["name", "ASC"]],
    });
    const ids = forms.map((f) => f.form_id);
    const current = ids.length
      ? await FormVersion.findAll({ where: { form_id: ids, status: ["published", "draft"] } })
      : [];
    const data = forms.map((f) => {
      const mine = current.filter((v) => v.form_id === f.form_id);
      const pub = mine.find((v) => v.status === "published");
      const draft = mine.find((v) => v.status === "draft");
      return {
        ...f.toJSON(),
        published: pub ? { version_id: pub.version_id, version_number: pub.version_number, published_at: pub.published_at, summary: summarizeDefinition(pub.definition) } : null,
        draft: draft ? { version_id: draft.version_id, version_number: draft.version_number, updated_at: draft.updated_at, summary: summarizeDefinition(draft.definition) } : null,
      };
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return handleError(res, error, "Failed to fetch checklists.");
  }
};

const getFormById = async (req, res) => {
  try {
    return res.status(200).json({ success: true, data: await loadForm(req.params.id) });
  } catch (error) {
    return handleError(res, error, "Failed to fetch the checklist.");
  }
};

const getFormVersion = async (req, res) => {
  try {
    if (!isUuid(req.params.versionId)) return fail(res, 400, "Invalid version id.");
    const version = await FormVersion.findOne({ where: { version_id: req.params.versionId, form_id: req.params.id } });
    if (!version) return fail(res, 404, "Version not found.");
    return res.status(200).json({ success: true, data: { ...version.toJSON(), summary: summarizeDefinition(version.definition) } });
  } catch (error) {
    return handleError(res, error, "Failed to fetch version.");
  }
};

const nameClash = async ({ name, code }, exceptId) => {
  const tidy = (s) => String(s || "").replace(/\s+/g, " ").trim();
  const conds = [];
  if (name && tidy(name)) conds.push({ name: { [Op.iLike]: escapeLike(tidy(name)) } });
  if (code && tidy(code)) conds.push({ code: { [Op.iLike]: escapeLike(tidy(code)) } });
  if (!conds.length) return null;
  const other = await Form.findOne({ where: { [Op.or]: conds, ...(exceptId && { form_id: { [Op.ne]: exceptId } }) } });
  if (!other) return null;
  return tidy(other.name).toLowerCase() === tidy(name).toLowerCase() ? `A checklist called "${other.name}" already exists.` : `Code "${other.code}" is already used by ${other.name}.`;
};

/** New form with an empty draft (version 1). */
const createForm = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const clash = await nameClash(req.body);
    if (clash) throw err(409, clash);
    const form = await Form.create(
      {
        name: req.body.name.trim().replace(/\s+/g, " "),
        name_am: req.body.name_am?.trim() || null,
        code: req.body.code?.trim().toUpperCase() || null,
        description: req.body.description?.trim() || null,
        created_by: req.user.user_id,
      },
      { transaction: t },
    );
    await FormVersion.create(
      { form_id: form.form_id, version_number: 1, status: "draft", definition: emptyDefinition(), created_by: req.user.user_id },
      { transaction: t },
    );
    await t.commit();
    return res.status(201).json({ success: true, message: "Checklist created.", data: await loadForm(form.form_id) });
  } catch (error) {
    if (!t.finished) await t.rollback();
    return handleError(res, error, "Failed to create the checklist.");
  }
};

const updateForm = async (req, res) => {
  try {
    const form = await findForm(req.params.id);
    const clash = await nameClash(req.body, form.form_id);
    if (clash) return fail(res, 409, clash);
    await form.update({
      ...(req.body.name !== undefined && { name: req.body.name.trim().replace(/\s+/g, " ") }),
      ...(req.body.name_am !== undefined && { name_am: req.body.name_am?.trim() || null }),
      ...(req.body.code !== undefined && { code: req.body.code?.trim().toUpperCase() || null }),
      ...(req.body.description !== undefined && { description: req.body.description?.trim() || null }),
      ...(req.body.is_active !== undefined && { is_active: req.body.is_active }),
    });
    return res.status(200).json({ success: true, message: "Checklist updated.", data: await loadForm(form.form_id) });
  } catch (error) {
    return handleError(res, error, "Failed to update the checklist.");
  }
};

/* =================== Draft & publishing =================== */
/** Start editing: a draft copied from the current published version (or empty). */
const createDraft = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const form = await findForm(req.params.id, t);
    const existing = await FormVersion.findOne({ where: { form_id: form.form_id, status: "draft" }, transaction: t });
    if (existing) throw err(409, "This checklist already has a draft. Continue editing it, or discard it first.");
    const published = await FormVersion.findOne({ where: { form_id: form.form_id, status: "published" }, transaction: t });
    const last = (await FormVersion.max("version_number", { where: { form_id: form.form_id }, transaction: t })) || 0;
    await FormVersion.create(
      {
        form_id: form.form_id,
        version_number: last + 1,
        status: "draft",
        definition: published ? published.definition : emptyDefinition(),
        created_by: req.user.user_id,
      },
      { transaction: t },
    );
    await t.commit();
    return res.status(201).json({ success: true, message: `Draft version ${last + 1} started.`, data: await loadForm(form.form_id) });
  } catch (error) {
    if (!t.finished) await t.rollback();
    return handleError(res, error, "Failed to start a draft.");
  }
};

/** Save the draft's questions (checked, but it may still be incomplete). */
const saveDraft = async (req, res) => {
  try {
    const form = await findForm(req.params.id);
    const draft = await FormVersion.findOne({ where: { form_id: form.form_id, status: "draft" } });
    if (!draft) return fail(res, 409, "There is no draft to save. Start a new draft first.");
    const { value, errors } = validateDefinition(req.body.definition);
    if (errors.length) return fail(res, 400, "The checklist has problems that need fixing before it can be saved.", { errors });
    await draft.update({ definition: value, ...(req.body.change_note !== undefined && { change_note: req.body.change_note?.trim() || null }) });
    return res.status(200).json({ success: true, message: "Draft saved.", data: await loadForm(form.form_id) });
  } catch (error) {
    return handleError(res, error, "Failed to save the draft.");
  }
};

const discardDraft = async (req, res) => {
  try {
    const form = await findForm(req.params.id);
    const draft = await FormVersion.findOne({ where: { form_id: form.form_id, status: "draft" } });
    if (!draft) return fail(res, 404, "There is no draft.");
    const others = await FormVersion.count({ where: { form_id: form.form_id, status: { [Op.ne]: "draft" } } });
    if (!others) return fail(res, 400, "This is the checklist's only version. Edit it instead, or deactivate the checklist.");
    await draft.destroy();
    return res.status(200).json({ success: true, message: "Draft discarded.", data: await loadForm(form.form_id) });
  } catch (error) {
    return handleError(res, error, "Failed to discard the draft.");
  }
};

/** The draft becomes the current version; the previous current version is retired. */
const publishDraft = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const form = await findForm(req.params.id, t);
    const draft = await FormVersion.findOne({ where: { form_id: form.form_id, status: "draft" }, transaction: t });
    if (!draft) throw err(409, "There is no draft to publish.");
    const { value, errors } = validateDefinition(draft.definition, { forPublish: true });
    if (errors.length) throw err(400, "The draft can't be published yet.", { errors });

    await FormVersion.update({ status: "retired" }, { where: { form_id: form.form_id, status: "published" }, transaction: t });
    await draft.update(
      {
        status: "published",
        definition: value,
        published_at: new Date(),
        published_by: req.user.user_id,
        ...(req.body?.change_note !== undefined && { change_note: req.body.change_note?.trim() || null }),
      },
      { transaction: t },
    );
    await t.commit();
    return res.status(200).json({ success: true, message: `Version ${draft.version_number} published.`, data: await loadForm(form.form_id) });
  } catch (error) {
    if (!t.finished) await t.rollback();
    return handleError(res, error, "Failed to publish.");
  }
};

/* =================== Edit the current version directly (admin) =================== */
/**
 * Saves changes straight into the published version, without a new version.
 * Once inspections were submitted with it, only safe changes are allowed
 * (see utils/formDiff.js); others must go into a new draft.
 */
const editLive = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const form = await findForm(req.params.id, t);
    const current = await FormVersion.findOne({ where: { form_id: form.form_id, status: "published" }, transaction: t, lock: t.LOCK.UPDATE });
    if (!current) throw err(409, "This checklist has no published version to edit. Edit its draft instead.");

    const { value, errors } = validateDefinition(req.body.definition, { forPublish: true });
    if (errors.length) throw err(400, "The checklist has problems that need fixing first.", { errors });

    const diff = diffDefinitions(current.definition, value);
    if (!diff.hasChanges) throw err(400, "Nothing was changed.");

    const inspections = await countInspectionsForVersion(current.version_id, t);
    if (inspections > 0 && diff.unsafe.length) {
      throw err(409, `Version ${current.version_number} has ${inspections} submitted inspection${inspections === 1 ? "" : "s"}, so these changes can't be made to it. Save them as a new version instead.`, {
        unsafe: diff.unsafe,
        inspections,
      });
    }

    await FormVersionEdit.create(
      {
        version_id: current.version_id,
        edited_by: req.user.user_id,
        summary: diff.summary.slice(0, 500),
        details: diff,
        note: req.body.note?.trim() || null,
        previous_definition: current.definition,
      },
      { transaction: t },
    );
    await current.update({ definition: value }, { transaction: t });
    await t.commit();
    return res.status(200).json({ success: true, message: `Version ${current.version_number} updated: ${diff.summary}.`, data: await loadForm(form.form_id) });
  } catch (error) {
    if (!t.finished) await t.rollback();
    return handleError(res, error, "Failed to save the changes.");
  }
};

/**
 * What would change compared with the current version: summary, unsafe changes and
 * how many inspections use the current version. Body: { definition } (default: the draft).
 */
const compareWithCurrent = async (req, res) => {
  try {
    const form = await findForm(req.params.id);
    const current = await FormVersion.findOne({ where: { form_id: form.form_id, status: "published" } });
    let candidate = req.body?.definition;
    if (!candidate) {
      const draft = await FormVersion.findOne({ where: { form_id: form.form_id, status: "draft" } });
      if (!draft) return fail(res, 400, "Nothing to compare.");
      candidate = draft.definition;
    }
    if (!current) {
      return res.status(200).json({ success: true, data: { first_version: true, diff: diffDefinitions({ sections: [], status_options: candidate.status_options || [] }, candidate), inspections: 0 } });
    }
    const diff = diffDefinitions(current.definition, candidate);
    const inspections = await countInspectionsForVersion(current.version_id);
    return res.status(200).json({ success: true, data: { first_version: false, current_version: current.version_number, diff, inspections } });
  } catch (error) {
    return handleError(res, error, "Failed to compare.");
  }
};

/** Direct edits made to one version, newest first. */
const getVersionEdits = async (req, res) => {
  try {
    if (!isUuid(req.params.versionId)) return fail(res, 400, "Invalid version id.");
    const edits = await FormVersionEdit.findAll({
      where: { version_id: req.params.versionId },
      attributes: ["edit_id", "version_id", "summary", "note", "created_at", "edited_by"],
      include: [{ model: User, as: "editor", attributes: ["user_id", "full_name"] }],
      order: [["created_at", "DESC"]],
    });
    return res.status(200).json({ success: true, data: edits });
  } catch (error) {
    return handleError(res, error, "Failed to fetch the edit history.");
  }
};

/* =================== Assignments =================== */
const describeAssignment = (a) => {
  switch (a.target_type) {
    case "all":
      return "All licenses";
    case "license_type":
      return `All ${a.license_type} licenses`;
    case "company":
      return a.company ? `All licenses of ${a.company.name}` : "A company (removed)";
    case "license":
      return a.license ? `${a.license.license_number}${a.license.company ? ` — ${a.license.company.name}` : ""}` : "A license (removed)";
    default:
      return a.target_type;
  }
};

const ASSIGNMENT_INCLUDE = [
  { model: Company, as: "company", attributes: ["company_id", "name"] },
  { model: CompanyLicense, as: "license", attributes: ["license_id", "license_number"], include: [{ model: Company, as: "company", attributes: ["company_id", "name"] }] },
];

const getAssignments = async (req, res) => {
  try {
    const form = await findForm(req.params.id);
    const rows = await FormAssignment.findAll({ where: { form_id: form.form_id }, include: ASSIGNMENT_INCLUDE, order: [["created_at", "ASC"]] });
    const data = rows.map((a) => ({ ...a.toJSON(), description: describeAssignment(a) }));
    // How many licenses that adds up to
    const licenseCount = (await licensesForForm(form.form_id)).length;
    return res.status(200).json({ success: true, data, meta: { license_count: licenseCount } });
  } catch (error) {
    return handleError(res, error, "Failed to fetch assignments.");
  }
};

const addAssignment = async (req, res) => {
  try {
    const form = await findForm(req.params.id);
    const { target_type, license_type, company_id, license_id } = req.body;
    if (target_type === "company" && !(await Company.findByPk(company_id))) return fail(res, 400, "Company not found.");
    if (target_type === "license" && !(await CompanyLicense.findByPk(license_id))) return fail(res, 400, "License not found.");
    const a = await FormAssignment.create({
      form_id: form.form_id,
      target_type,
      license_type: target_type === "license_type" ? license_type : null,
      company_id: target_type === "company" ? company_id : null,
      license_id: target_type === "license" ? license_id : null,
      created_by: req.user.user_id,
    });
    const full = await FormAssignment.findByPk(a.assignment_id, { include: ASSIGNMENT_INCLUDE });
    return res.status(201).json({ success: true, message: `Assigned: ${describeAssignment(full)}.`, data: { ...full.toJSON(), description: describeAssignment(full) } });
  } catch (error) {
    return handleError(res, error, "Failed to add assignment.");
  }
};

const removeAssignment = async (req, res) => {
  try {
    if (!isUuid(req.params.assignmentId)) return fail(res, 400, "Invalid assignment id.");
    const removed = await FormAssignment.destroy({ where: { assignment_id: req.params.assignmentId } });
    if (!removed) return fail(res, 404, "Assignment not found.");
    return res.status(200).json({ success: true, message: "Assignment removed." });
  } catch (error) {
    return handleError(res, error, "Failed to remove assignment.");
  }
};

/** License ids a form applies to, through any of its assignments. */
const licensesForForm = async (formId) => {
  const [rows] = await sequelize.query(
    `SELECT DISTINCT l.license_id
       FROM company_licenses l
       JOIN form_assignments a ON a.form_id = :formId AND (
            a.target_type = 'all'
         OR (a.target_type = 'license_type' AND a.license_type = l.license_type)
         OR (a.target_type = 'company'      AND a.company_id   = l.company_id)
         OR (a.target_type = 'license'      AND a.license_id   = l.license_id))`,
    { replacements: { formId } },
  );
  return rows.map((r) => r.license_id);
};

/** Active forms (with their current version) that apply to one license — used when planning inspections. */
const getFormsForLicense = async (req, res) => {
  try {
    if (!isUuid(req.params.licenseId)) return fail(res, 400, "Invalid license id.");
    const license = await CompanyLicense.findByPk(req.params.licenseId);
    if (!license) return fail(res, 404, "License not found.");
    const [rows] = await sequelize.query(
      `SELECT DISTINCT f.form_id, f.code, f.name, f.name_am, v.version_id, v.version_number
         FROM forms f
         JOIN form_assignments a ON a.form_id = f.form_id
         JOIN form_versions v ON v.form_id = f.form_id AND v.status = 'published'
        WHERE f.is_active AND (
              a.target_type = 'all'
           OR (a.target_type = 'license_type' AND a.license_type = :type)
           OR (a.target_type = 'company'      AND a.company_id   = :company)
           OR (a.target_type = 'license'      AND a.license_id   = :license))
        ORDER BY f.name`,
      { replacements: { type: license.license_type, company: license.company_id, license: license.license_id } },
    );
    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    return handleError(res, error, "Failed to fetch checklists for the license.");
  }
};

module.exports = {
  getForms,
  getFormById,
  getFormVersion,
  createForm,
  updateForm,
  createDraft,
  saveDraft,
  discardDraft,
  publishDraft,
  editLive,
  compareWithCurrent,
  getVersionEdits,
  getAssignments,
  addAssignment,
  removeAssignment,
  getFormsForLicense,
};
