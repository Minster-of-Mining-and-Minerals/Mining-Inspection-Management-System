const { SectorNode } = require("../models");

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

// Sector access (who sees which sector) lives in services/sectorScope.js.

module.exports = {
  getDescendantSectorNodeIds,
  getAncestorSectorNodeIds,
};
