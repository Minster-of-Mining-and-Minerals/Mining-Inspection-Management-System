/**
 * Roles.
 *
 *   Global roles (sector_node_id NULL) are templates every sector can use. Only central users
 *   change them. A sector admin copies a global role into their sector (POST /:id/copy) and
 *   changes the copy; sector roles are seen and used only inside their sector.
 *
 *   Nobody but central users can put a permission into a role that they don't hold themselves.
 */
const { Op } = require("sequelize");
const { v4: uuidv4, validate: isUuid } = require("uuid");
const { sequelize, Role, Permission, RolePermission, UserRoles, SectorNode } = require("../../models");
const { isDataSector, httpError } = require("../../services/sectorScope");
const { missingPermissions, permissionsOfRoles } = require("../../services/userAccessService");
const { escapeLike } = require("../../utils/search");

const fail = (res, status, message, extra) => res.status(status).json({ success: false, message, ...extra });

const handleError = (res, error, fallback) => {
  if (error.status) return fail(res, error.status, error.message);
  if (error.name === "SequelizeUniqueConstraintError") return fail(res, 400, "Role name already exists");
  console.error(fallback, error);
  return fail(res, 500, fallback, { error: error.message });
};

const ROLE_INCLUDE = [
  {
    model: RolePermission,
    as: "rolePermissions",
    where: { is_active: true },
    required: false,
    include: [{ model: Permission, as: "permission", attributes: ["permission_id", "resource", "action"] }],
  },
  { model: SectorNode, as: "sector", attributes: ["sector_node_id", "name", "name_am"] },
  { model: Role, as: "copiedFrom", attributes: ["role_id", "name"] },
];

/** Roles the request can see: global ones plus its sector's (central with no sector chosen: all). */
const visibleWhere = (req) => {
  const { isCentral, sectorId } = req.scope;
  if (isCentral && !sectorId) return {};
  return { [Op.or]: [{ sector_node_id: null }, { sector_node_id: sectorId }] };
};

/** Can this request change the role? Global: central only. Sector role: its sector (or central). */
const canEdit = (req, role) => req.scope.isCentral || (role.sector_node_id && role.sector_node_id === req.scope.userSectorId);

/** The role with flags for the UI: is_global, can_edit, can_assign. */
const present = (req, role) => {
  const plain = role.toJSON();
  const keys = (plain.rolePermissions || []).filter((rp) => rp.permission).map((rp) => `${rp.permission.resource}:${rp.permission.action}`);
  return {
    ...plain,
    is_global: !plain.sector_node_id,
    can_edit: canEdit(req, plain),
    can_assign: req.scope.isCentral || !missingPermissions(req, keys).length,
  };
};

const findVisibleRole = async (req, id, transaction) => {
  if (!isUuid(id)) throw httpError(400, "Invalid role id.");
  const role = await Role.findOne({ where: { role_id: id, is_active: true, ...visibleWhere(req) }, transaction });
  if (!role) throw httpError(404, "Role not found");
  return role;
};

/** permission_ids as an array (the create form may send a JSON string or "a,b,c"). */
const parseIds = (value) => {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return [...new Set(value)];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return [...new Set(parsed)];
  } catch {
    /* comma separated */
  }
  return [...new Set(String(value).split(",").map((i) => i.trim()).filter(Boolean))];
};

/** Check the permissions exist and (for sector users) are all held by the user. */
const checkPermissions = async (req, ids, transaction) => {
  const perms = await Permission.findAll({ where: { permission_id: ids, is_active: true }, transaction });
  if (perms.length !== ids.length) throw httpError(400, "Some permissions are invalid for role");
  if (!req.scope.isCentral) {
    const missing = missingPermissions(req, perms.map((p) => `${p.resource}:${p.action}`));
    if (missing.length) throw httpError(403, `You can only use permissions you have yourself. Missing: ${missing.join(", ")}.`);
  }
};

const setPermissions = async (roleId, ids, transaction) => {
  await RolePermission.destroy({ where: { role_id: roleId }, transaction });
  if (!ids.length) return;
  await RolePermission.bulkCreate(
    ids.map((permission_id) => ({ role_permission_id: uuidv4(), role_id: roleId, permission_id, is_active: true })),
    { transaction },
  );
};

/**
 * A role name must be free in its sector, and must not repeat a global role's name
 * (two roles called "supervisor" in one list would be confusing).
 */
const assertNameFree = async (name, sectorId, exceptId, transaction) => {
  const clash = await Role.findOne({
    where: {
      name: { [Op.iLike]: escapeLike(name.trim()) },
      is_active: true,
      [Op.or]: [{ sector_node_id: null }, ...(sectorId ? [{ sector_node_id: sectorId }] : [])],
      ...(exceptId && { role_id: { [Op.ne]: exceptId } }),
    },
    transaction,
  });
  if (clash) throw httpError(400, "Role name already exists");
};

/**
 * The sector a new role belongs to.
 * Sector users: their sector. Central users: the sector sent, else the switcher's sector,
 * else none (a global role).
 */
const roleSectorFor = async (req, requested, transaction) => {
  if (!req.scope.isCentral) return req.scope.userSectorId;
  const id = requested || req.scope.sectorId || null;
  if (id && !(await isDataSector(id, transaction))) throw httpError(400, "The selected sector does not exist.");
  return id;
};

const loadRole = async (req, id) => present(req, await Role.findByPk(id, { include: ROLE_INCLUDE }));

/* =================== list / one =================== */
const getRoles = async (req, res) => {
  try {
    const where = { ...visibleWhere(req) };
    if (req.query.is_active !== undefined) where.is_active = req.query.is_active === "true";
    const roles = await Role.findAll({
      where,
      include: ROLE_INCLUDE,
      // global roles first, then sector roles
      order: [[sequelize.literal(`"Role"."sector_node_id" IS NOT NULL`), "ASC"], ["name", "ASC"]],
    });
    return res.status(200).json({ success: true, count: roles.length, data: roles.map((r) => present(req, r)) });
  } catch (error) {
    return handleError(res, error, "Internal server error");
  }
};

const getRoleById = async (req, res) => {
  try {
    const role = await findVisibleRole(req, req.params.id);
    return res.status(200).json({ success: true, data: await loadRole(req, role.role_id) });
  } catch (error) {
    return handleError(res, error, "Internal server error");
  }
};

/* =================== create / copy =================== */
const createRole = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { name, description } = req.body;
    const sectorId = await roleSectorFor(req, req.body.sector_node_id, t);
    await assertNameFree(name, sectorId, null, t);
    const permissionIds = parseIds(req.body.permission_ids) || [];
    await checkPermissions(req, permissionIds, t);

    const role = await Role.create(
      { role_id: uuidv4(), name: name.trim(), description, sector_node_id: sectorId, is_active: true },
      { transaction: t },
    );
    await setPermissions(role.role_id, permissionIds, t);
    await t.commit();
    return res.status(201).json({ success: true, message: "Role created successfully", data: await loadRole(req, role.role_id) });
  } catch (error) {
    if (!t.finished) await t.rollback();
    return handleError(res, error, "Error creating role");
  }
};

/** Copy a role (usually a global one) into a sector, with the same permissions. */
const copyRole = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const source = await findVisibleRole(req, req.params.id, t);
    const sectorId = await roleSectorFor(req, req.body?.sector_node_id, t);
    if (!sectorId) throw httpError(400, "Choose the sector to copy the role into.");

    const permissions = [...((await permissionsOfRoles([source.role_id], t)).get(source.role_id) || [])];
    if (!req.scope.isCentral) {
      const missing = missingPermissions(req, permissions);
      if (missing.length) throw httpError(403, `This role has permissions you don't have, so you can't copy it. Missing: ${missing.join(", ")}.`);
    }

    const name = (req.body?.name || `${source.name} (copy)`).trim();
    await assertNameFree(name, sectorId, null, t);
    const role = await Role.create(
      {
        role_id: uuidv4(),
        name,
        description: req.body?.description ?? source.description,
        sector_node_id: sectorId,
        copied_from_role_id: source.role_id,
        is_active: true,
      },
      { transaction: t },
    );
    const links = await RolePermission.findAll({ where: { role_id: source.role_id, is_active: true }, attributes: ["permission_id"], transaction: t });
    await setPermissions(role.role_id, links.map((l) => l.permission_id), t);
    await t.commit();
    return res.status(201).json({ success: true, message: `Copied "${source.name}". Change the copy as you need.`, data: await loadRole(req, role.role_id) });
  } catch (error) {
    if (!t.finished) await t.rollback();
    return handleError(res, error, "Error copying role");
  }
};

/* =================== update / delete =================== */
const updateRole = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const role = await findVisibleRole(req, req.params.id, t);
    if (!canEdit(req, role)) throw httpError(403, "Global roles can only be changed by the central administrator. Copy the role to change it for your sector.");

    const { name, description } = req.body;
    if (name && name.trim() !== role.name) await assertNameFree(name, role.sector_node_id, role.role_id, t);
    await role.update(
      { name: name?.trim() || role.name, description: description ?? role.description, updated_at: new Date() },
      { transaction: t },
    );

    const permissionIds = parseIds(req.body.permission_ids);
    if (permissionIds) {
      await checkPermissions(req, permissionIds, t);
      await setPermissions(role.role_id, permissionIds, t);
    }
    await t.commit();
    return res.status(200).json({ success: true, message: "Role updated successfully", data: await loadRole(req, role.role_id) });
  } catch (error) {
    if (!t.finished) await t.rollback();
    return handleError(res, error, "Error updating role");
  }
};

/** Soft delete; refused while users have the role. */
const deleteRole = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const role = await findVisibleRole(req, req.params.id, t);
    if (!canEdit(req, role)) throw httpError(403, "Global roles can only be deleted by the central administrator.");
    const inUse = await UserRoles.count({ where: { role_id: role.role_id, is_active: true }, transaction: t });
    if (inUse) throw httpError(400, "Cannot delete role. It is currently assigned to users.");
    await role.update({ is_active: false, deleted_at: new Date(), updated_at: new Date() }, { transaction: t });
    await t.commit();
    return res.status(200).json({ success: true, message: "Role deleted successfully" });
  } catch (error) {
    if (!t.finished) await t.rollback();
    return handleError(res, error, "Error deleting role");
  }
};

module.exports = {
  createRole,
  copyRole,
  getRoles,
  getRoleById,
  updateRole,
  deleteRole,
};
