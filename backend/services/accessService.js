const { SectorNode, User } = require("../models");

/**
 * Recursively gets all descendant sector node IDs for a given sector node.
 * @param {string} sectorNodeId - The ID of the sector node.
 * @param {string[]} ids - Initial accumulator for IDs.
 * @returns {Promise<string[]>} - A list of all descendant IDs.
 */
const getDescendantSectorNodeIds = async (sectorNodeId, ids = []) => {
  const children = await SectorNode.findAll({
    where: { parent_id: sectorNodeId },
    attributes: ["sector_node_id"],
  });

  for (const child of children) {
    ids.push(child.sector_node_id);
    await getDescendantSectorNodeIds(child.sector_node_id, ids);
  }

  return ids;
};

/**
 * Recursively gets all ancestor sector node IDs for a given sector node up to the root.
 * @param {string} sectorNodeId - The ID of the sector node.
 * @param {string[]} ids - Initial accumulator for IDs.
 * @returns {Promise<string[]>} - A list of all ancestor IDs.
 */
const getAncestorSectorNodeIds = async (sectorNodeId, ids = []) => {
  const node = await SectorNode.findByPk(sectorNodeId, {
    attributes: ["parent_id"],
  });

  if (node && node.parent_id) {
    ids.push(node.parent_id);
    await getAncestorSectorNodeIds(node.parent_id, ids);
  }

  return ids;
};

/**
 * Determines the administrative and sector-based access scope for a given user.
 * @param {string} user_id - The ID of the user.
 * @returns {Promise<{isAdmin: boolean, accessSectorIds: string[]}>}
 */
const getUserAccessSectors = async (user_id) => {
  if (!user_id) {
    return { isAdmin: false, accessSectorIds: [] };
  }

  const user = await User.findByPk(user_id);
  // If user has no sector_node_id, they are considered a "global admin" (no sector restriction)
  if (!user) return { isAdmin: false, accessSectorIds: [] };
  if (!user.sector_node_id) return { isAdmin: true, accessSectorIds: [] };

  // Find sectors where user is a HEAD
  const sectorsWhereHead = await SectorNode.findAll({
    where: { head_id: user_id },
    attributes: ["sector_node_id"],
  });

  const manageableBaseIds = sectorsWhereHead.map((s) => s.sector_node_id);

  // Collect all descendants for these sectors
  let accessSectorIds = [...manageableBaseIds];
  for (const baseId of manageableBaseIds) {
    const descendants = await getDescendantSectorNodeIds(baseId);
    accessSectorIds.push(...descendants);
  }

  return { isAdmin: false, accessSectorIds: [...new Set(accessSectorIds)] };
};

module.exports = {
  getDescendantSectorNodeIds,
  getAncestorSectorNodeIds,
  getUserAccessSectors,
};
