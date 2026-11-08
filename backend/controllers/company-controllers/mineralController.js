const { Op, literal } = require("sequelize");
const { validate: isUuid } = require("uuid");
const { Mineral, MineralCategory } = require("../../models");
const { normalizeMineralName } = require("../../utils/mineralNames");
const { likeContains } = require("../../utils/search");

const fail = (res, status, message) => res.status(status).json({ success: false, message });

const CATEGORY_ATTRS = ["category_id", "name", "name_am", "sort_order", "is_active"];

/** Any other mineral already using this name or alias? */
const clashFor = async (names, exceptId) => {
  const wanted = new Set(names.map(normalizeMineralName).filter(Boolean));
  const all = await Mineral.findAll({ where: exceptId ? { mineral_id: { [Op.ne]: exceptId } } : {} });
  for (const m of all) {
    for (const n of [m.name, ...(m.aliases || [])]) {
      if (wanted.has(normalizeMineralName(n))) return { mineral: m, name: n };
    }
  }
  return null;
};

const cleanAliases = (aliases, name) => {
  const seen = new Set([normalizeMineralName(name)]);
  const out = [];
  for (const a of aliases || []) {
    const n = normalizeMineralName(a);
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(a.trim());
    }
  }
  return out;
};

/** The category must exist; a new or re-categorised mineral needs an active one. */
const checkCategory = async (categoryId) => {
  const category = await MineralCategory.findByPk(categoryId);
  if (!category) throw Object.assign(new Error("Category not found."), { status: 400 });
  if (!category.is_active) throw Object.assign(new Error(`The category "${category.name}" is inactive.`), { status: 400 });
  return category;
};

const withCategory = (id) =>
  Mineral.findByPk(id, { include: [{ model: MineralCategory, as: "category", attributes: CATEGORY_ATTRS }] });

/* =================== Minerals =================== */
const getMinerals = async (req, res) => {
  try {
    const where = {};
    if (req.query.is_active === "true" || req.query.is_active === "false") where.is_active = req.query.is_active === "true";
    if (req.query.category_id) {
      if (!isUuid(req.query.category_id)) return fail(res, 400, "Invalid category_id.");
      where.category_id = req.query.category_id;
    }
    if (req.query.search?.trim()) {
      const term = likeContains(req.query.search);
      where[Op.or] = [
        { name: { [Op.iLike]: term } },
        { name_am: { [Op.iLike]: term } },
        literal(`array_to_string("Mineral"."aliases", ' ') ILIKE ${Mineral.sequelize.escape(term)}`),
      ];
    }
    const minerals = await Mineral.findAll({
      where,
      attributes: {
        include: [[literal(`(SELECT COUNT(*)::int FROM license_minerals lm WHERE lm.mineral_id = "Mineral"."mineral_id")`), "license_count"]],
      },
      include: [{ model: MineralCategory, as: "category", attributes: CATEGORY_ATTRS }],
      order: [["name", "ASC"]],
    });
    return res.status(200).json({ success: true, data: minerals });
  } catch (error) {
    console.error("Error fetching minerals:", error);
    return fail(res, 500, "Failed to fetch minerals.");
  }
};

const createMineral = async (req, res) => {
  try {
    const { name, name_am, category_id, aliases } = req.body;
    await checkCategory(category_id);
    const clash = await clashFor([name, ...(aliases || [])]);
    if (clash) return fail(res, 409, `"${clash.name}" is already used by ${clash.mineral.name}.`);
    const mineral = await Mineral.create({
      name: name.trim(),
      name_am: name_am?.trim() || null,
      category_id,
      aliases: cleanAliases(aliases, name),
    });
    return res.status(201).json({ success: true, message: "Mineral added.", data: await withCategory(mineral.mineral_id) });
  } catch (error) {
    if (error.status) return fail(res, error.status, error.message);
    console.error("Error creating mineral:", error);
    return fail(res, 500, "Failed to add mineral.");
  }
};

const updateMineral = async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return fail(res, 400, "Invalid mineral id.");
    const mineral = await Mineral.findByPk(req.params.id);
    if (!mineral) return fail(res, 404, "Mineral not found.");
    if (req.body.category_id && req.body.category_id !== mineral.category_id) await checkCategory(req.body.category_id);

    const name = req.body.name?.trim() ?? mineral.name;
    const aliases = req.body.aliases !== undefined ? req.body.aliases : mineral.aliases;
    const clash = await clashFor([name, ...(aliases || [])], mineral.mineral_id);
    if (clash) return fail(res, 409, `"${clash.name}" is already used by ${clash.mineral.name}.`);
    await mineral.update({
      name,
      ...(req.body.name_am !== undefined && { name_am: req.body.name_am?.trim() || null }),
      ...(req.body.category_id !== undefined && { category_id: req.body.category_id }),
      ...(req.body.is_active !== undefined && { is_active: req.body.is_active }),
      aliases: cleanAliases(aliases, name),
    });
    return res.status(200).json({ success: true, message: "Mineral updated.", data: await withCategory(mineral.mineral_id) });
  } catch (error) {
    if (error.status) return fail(res, error.status, error.message);
    console.error("Error updating mineral:", error);
    return fail(res, 500, "Failed to update mineral.");
  }
};

/* =================== Mineral categories =================== */
const getMineralCategories = async (req, res) => {
  try {
    const where = {};
    if (req.query.is_active === "true" || req.query.is_active === "false") where.is_active = req.query.is_active === "true";
    const categories = await MineralCategory.findAll({
      where,
      attributes: {
        include: [[literal(`(SELECT COUNT(*)::int FROM minerals m WHERE m.category_id = "MineralCategory"."category_id")`), "mineral_count"]],
      },
      order: [["sort_order", "ASC"], ["name", "ASC"]],
    });
    return res.status(200).json({ success: true, data: categories });
  } catch (error) {
    console.error("Error fetching mineral categories:", error);
    return fail(res, 500, "Failed to fetch categories.");
  }
};

const sameName = async (name, exceptId) => {
  const target = normalizeMineralName(name);
  const all = await MineralCategory.findAll({ where: exceptId ? { category_id: { [Op.ne]: exceptId } } : {} });
  return all.find((c) => normalizeMineralName(c.name) === target);
};

/** "Fertilizer minerals" -> "fertilizer_minerals" (unique) */
const codeFor = async (name) => {
  const base = normalizeMineralName(name).replace(/\s+/g, "_").slice(0, 40) || "category";
  let code = base;
  for (let i = 2; await MineralCategory.findOne({ where: { code } }); i++) code = `${base}_${i}`;
  return code;
};

const createMineralCategory = async (req, res) => {
  try {
    const { name, name_am, sort_order } = req.body;
    const clash = await sameName(name);
    if (clash) return fail(res, 409, `A category called "${clash.name}" already exists.`);
    const max = (await MineralCategory.max("sort_order")) || 0;
    const category = await MineralCategory.create({
      code: await codeFor(name),
      name: name.trim(),
      name_am: name_am?.trim() || null,
      sort_order: sort_order ?? max + 10,
    });
    return res.status(201).json({ success: true, message: "Category added.", data: category });
  } catch (error) {
    console.error("Error creating mineral category:", error);
    return fail(res, 500, "Failed to add category.");
  }
};

const updateMineralCategory = async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return fail(res, 400, "Invalid category id.");
    const category = await MineralCategory.findByPk(req.params.id);
    if (!category) return fail(res, 404, "Category not found.");
    if (req.body.name !== undefined) {
      const clash = await sameName(req.body.name, category.category_id);
      if (clash) return fail(res, 409, `A category called "${clash.name}" already exists.`);
    }
    if (req.body.is_active === false && category.code === "other") {
      return fail(res, 400, `"${category.name}" is the fallback category and can't be deactivated.`);
    }
    await category.update({
      ...(req.body.name !== undefined && { name: req.body.name.trim() }),
      ...(req.body.name_am !== undefined && { name_am: req.body.name_am?.trim() || null }),
      ...(req.body.sort_order !== undefined && { sort_order: req.body.sort_order }),
      ...(req.body.is_active !== undefined && { is_active: req.body.is_active }),
    });
    return res.status(200).json({ success: true, message: "Category updated.", data: category });
  } catch (error) {
    console.error("Error updating mineral category:", error);
    return fail(res, 500, "Failed to update category.");
  }
};

const deleteMineralCategory = async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return fail(res, 400, "Invalid category id.");
    const category = await MineralCategory.findByPk(req.params.id);
    if (!category) return fail(res, 404, "Category not found.");
    if (category.code === "other") return fail(res, 400, `"${category.name}" is the fallback category and can't be deleted.`);
    const used = await Mineral.count({ where: { category_id: category.category_id } });
    if (used) {
      return fail(res, 409, `${used} mineral${used === 1 ? " is" : "s are"} in this category. Move them first, or deactivate the category instead.`);
    }
    await category.destroy();
    return res.status(200).json({ success: true, message: "Category deleted." });
  } catch (error) {
    console.error("Error deleting mineral category:", error);
    return fail(res, 500, "Failed to delete category.");
  }
};

module.exports = {
  getMinerals,
  createMineral,
  updateMineral,
  getMineralCategories,
  createMineralCategory,
  updateMineralCategory,
  deleteMineralCategory,
};
