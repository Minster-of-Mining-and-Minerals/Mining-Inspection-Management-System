const { Op, fn, col, literal } = require("sequelize");
const { validate: isUuid } = require("uuid");
const { AdminArea, AreaAlias, sequelize } = require("../../models");
const { normalizeAreaName } = require("../../utils/areaNames");
const { likeContains } = require("../../utils/search");
const { findWoredasAt } = require("../../services/geoService");

const PARENT_LEVEL = { region: null, zone: "region", woreda: "zone" };

const fail = (res, status, message) => res.status(status).json({ success: false, message });

/** Ancestors from the region down, e.g. [Benishangul-Gumuz, Assosa]. */
const ancestorsOf = async (area) => {
  const chain = [];
  let parentId = area.parent_id;
  while (parentId) {
    const parent = await AdminArea.findByPk(parentId, { attributes: ["area_id", "parent_id", "level", "name", "name_am", "pcode"] });
    if (!parent) break;
    chain.unshift(parent);
    parentId = parent.parent_id;
  }
  return chain;
};

/* =================== List (by level / parent, with search) =================== */
const getAdminAreas = async (req, res) => {
  try {
    const { level, parent_id, search, is_active } = req.query;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 500);

    const where = {};
    if (level) where.level = level;
    if (parent_id === "null") where.parent_id = null;
    else if (parent_id) {
      if (!isUuid(parent_id)) return fail(res, 400, "Invalid parent_id.");
      where.parent_id = parent_id;
    }
    if (is_active === "true" || is_active === "false") where.is_active = is_active === "true";

    if (search && search.trim()) {
      const term = likeContains(search);
      const norm = normalizeAreaName(search);
      // Name, Amharic name, P-code, or any alias spelling
      where[Op.or] = [
        { name: { [Op.iLike]: term } },
        { name_am: { [Op.iLike]: term } },
        { pcode: { [Op.iLike]: term } },
        ...(norm
          ? [{ area_id: { [Op.in]: literal(`(SELECT area_id FROM area_aliases WHERE alias_normalized LIKE ${sequelize.escape(likeContains(norm))})`) } }]
          : []),
      ];
    }

    const { count, rows } = await AdminArea.findAndCountAll({
      where,
      attributes: {
        include: [
          [literal(`(SELECT COUNT(*)::int FROM admin_areas c WHERE c.parent_id = "AdminArea"."area_id")`), "child_count"],
        ],
      },
      // Parent and grandparent, so search results can show "Assosa › Benishangul-Gumuz"
      include: [
        {
          model: AdminArea,
          as: "parent",
          attributes: ["area_id", "name", "name_am", "level", "parent_id"],
          include: [{ model: AdminArea, as: "parent", attributes: ["area_id", "name", "name_am", "level", "parent_id"] }],
        },
      ],
      order: [["name", "ASC"]],
      limit,
      offset: (page - 1) * limit,
    });

    return res.status(200).json({
      success: true,
      data: rows,
      meta: { totalItems: count, totalPages: Math.ceil(count / limit), currentPage: page, itemsPerPage: limit },
    });
  } catch (error) {
    console.error("Error fetching admin areas:", error);
    return fail(res, 500, "Failed to fetch areas.");
  }
};

/* =================== One area with its path, children count and aliases =================== */
const getAdminAreaById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return fail(res, 400, "Invalid area id.");

    const scope = req.query.include_boundary === "true" ? "withBoundary" : "defaultScope";
    const area = await AdminArea.scope(scope).findByPk(id, {
      include: [{ model: AreaAlias, as: "aliases", attributes: ["alias_id", "alias", "source", "created_at"] }],
      order: [[{ model: AreaAlias, as: "aliases" }, "alias", "ASC"]],
    });
    if (!area) return fail(res, 404, "Area not found.");

    const [ancestors, childCount] = await Promise.all([
      ancestorsOf(area),
      AdminArea.count({ where: { parent_id: id } }),
    ]);

    return res.status(200).json({ success: true, data: { ...area.toJSON(), ancestors, child_count: childCount } });
  } catch (error) {
    console.error("Error fetching admin area:", error);
    return fail(res, 500, "Failed to fetch area.");
  }
};

/* =================== Add an area by hand (missing woreda, new zone, …) =================== */
const createAdminArea = async (req, res) => {
  try {
    const { level, parent_id, name, name_am } = req.body;

    const parentLevel = PARENT_LEVEL[level];
    if (parentLevel) {
      const parent = await AdminArea.findByPk(parent_id);
      if (!parent) return fail(res, 400, `A ${level} needs a parent ${parentLevel}.`);
      if (parent.level !== parentLevel) return fail(res, 400, `The parent of a ${level} must be a ${parentLevel}.`);
    } else if (parent_id) {
      return fail(res, 400, "A region has no parent.");
    }

    const norm = normalizeAreaName(name);
    const siblings = await AdminArea.findAll({ where: { level, parent_id: parent_id || null }, attributes: ["name"] });
    if (siblings.some((s) => normalizeAreaName(s.name) === norm)) {
      return fail(res, 409, `A ${level} with this name already exists here.`);
    }

    const area = await AdminArea.create({
      level,
      parent_id: parent_id || null,
      name: name.trim(),
      name_am: name_am?.trim() || null,
      source: "manual",
    });
    return res.status(201).json({ success: true, message: "Area added.", data: area });
  } catch (error) {
    console.error("Error creating admin area:", error);
    return fail(res, 500, "Failed to add area.");
  }
};

/* =================== Edit name / Amharic name / active =================== */
const updateAdminArea = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return fail(res, 400, "Invalid area id.");
    const area = await AdminArea.findByPk(id);
    if (!area) return fail(res, 404, "Area not found.");

    const { name, name_am, is_active } = req.body;
    if (name !== undefined && normalizeAreaName(name) !== normalizeAreaName(area.name)) {
      const siblings = await AdminArea.findAll({
        where: { level: area.level, parent_id: area.parent_id, area_id: { [Op.ne]: id } },
        attributes: ["name"],
      });
      if (siblings.some((s) => normalizeAreaName(s.name) === normalizeAreaName(name))) {
        return fail(res, 409, `Another ${area.level} with this name already exists here.`);
      }
    }

    await area.update({
      ...(name !== undefined && { name: name.trim() }),
      ...(name_am !== undefined && { name_am: name_am?.trim() || null }),
      ...(is_active !== undefined && { is_active }),
    });
    return res.status(200).json({ success: true, message: "Area updated.", data: area });
  } catch (error) {
    console.error("Error updating admin area:", error);
    return fail(res, 500, "Failed to update area.");
  }
};

/* =================== Aliases (other spellings) =================== */
const addAreaAlias = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return fail(res, 400, "Invalid area id.");
    const area = await AdminArea.findByPk(id);
    if (!area) return fail(res, 404, "Area not found.");

    const alias = req.body.alias.trim();
    const norm = normalizeAreaName(alias);
    if (!norm) return fail(res, 400, "The spelling is empty after cleaning.");
    if (norm === normalizeAreaName(area.name)) return fail(res, 400, "This spelling already matches the area's name.");

    // Same spelling may not mean two different areas at the same level and parent
    const clash = await AreaAlias.findOne({
      where: { level: area.level, scope_parent_id: area.parent_id, alias_normalized: norm },
      include: [{ model: AdminArea, as: "area", attributes: ["area_id", "name"] }],
    });
    if (clash) {
      return clash.area_id === id
        ? fail(res, 409, "This spelling is already saved for this area.")
        : fail(res, 409, `This spelling already means "${clash.area?.name}".`);
    }
    const siblingWithName = (
      await AdminArea.findAll({ where: { level: area.level, parent_id: area.parent_id, area_id: { [Op.ne]: id } }, attributes: ["name"] })
    ).find((s) => normalizeAreaName(s.name) === norm);
    if (siblingWithName) return fail(res, 409, `"${alias}" is the name of another ${area.level} here (${siblingWithName.name}).`);

    const created = await AreaAlias.create({
      area_id: id,
      alias,
      alias_normalized: norm,
      level: area.level,
      scope_parent_id: area.parent_id,
      source: "confirmed",
      created_by: req.user?.user_id || null,
    });
    return res.status(201).json({ success: true, message: "Spelling saved.", data: created });
  } catch (error) {
    console.error("Error adding area alias:", error);
    return fail(res, 500, "Failed to save spelling.");
  }
};

const deleteAreaAlias = async (req, res) => {
  try {
    const { aliasId } = req.params;
    if (!isUuid(aliasId)) return fail(res, 400, "Invalid alias id.");
    const deleted = await AreaAlias.destroy({ where: { alias_id: aliasId } });
    if (!deleted) return fail(res, 404, "Spelling not found.");
    return res.status(200).json({ success: true, message: "Spelling removed." });
  } catch (error) {
    console.error("Error deleting area alias:", error);
    return fail(res, 500, "Failed to remove spelling.");
  }
};

/* =================== Which woreda is this GPS point in? =================== */
const locatePoint = async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return fail(res, 400, "Valid lat and lng are required.");
    }
    const woredas = await findWoredasAt(lat, lng);
    const data = [];
    for (const w of woredas) {
      const plain = w.toJSON();
      delete plain.boundary;
      data.push({ ...plain, ancestors: await ancestorsOf(w) });
    }
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Error locating point:", error);
    return fail(res, 500, "Failed to locate point.");
  }
};

/* =================== Counts per level (for the page header) =================== */
const getAdminAreaStats = async (req, res) => {
  try {
    const rows = await AdminArea.findAll({
      attributes: ["level", "is_active", [fn("COUNT", col("area_id")), "count"]],
      group: ["level", "is_active"],
      raw: true,
    });
    const stats = { region: 0, zone: 0, woreda: 0, inactive: 0 };
    for (const r of rows) {
      if (r.is_active) stats[r.level] = Number(r.count);
      else stats.inactive += Number(r.count);
    }
    const aliases = await AreaAlias.count();
    return res.status(200).json({ success: true, data: { ...stats, aliases } });
  } catch (error) {
    console.error("Error fetching admin area stats:", error);
    return fail(res, 500, "Failed to fetch counts.");
  }
};

module.exports = {
  getAdminAreas,
  getAdminAreaById,
  createAdminArea,
  updateAdminArea,
  addAreaAlias,
  deleteAreaAlias,
  locatePoint,
  getAdminAreaStats,
};
