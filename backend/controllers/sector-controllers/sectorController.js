"use strict";

const { SectorNode, User, sequelize } = require("../../models");
const { v4: uuidv4, validate: isUuid } = require("uuid");
const { Op } = require("sequelize");

/**
 * =================== Create Sector Node ===================
 */
const createSectorNode = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { name, description, name_am, description_am, parent_id, level, head_id } = req.body;

    // ===== Check duplicate name under the same parent =====
    const existingNode = await SectorNode.findOne({
      where: { name, parent_id: parent_id || null },
      transaction: t,
    });

    if (existingNode) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "A node with this name already exists under the same parent.",
      });
    }

    // ===== If head_id provided, verify user exists =====
    if (head_id) {
      const head = await User.findByPk(head_id, { transaction: t });
      if (!head) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: "Provided head user does not exist.",
        });
      }
    }

    // ===== Create Node =====
    const node = await SectorNode.create(
      {
        sector_node_id: uuidv4(),
        name,
        description,
        name_am: name_am?.trim() || null,
        description_am: description_am || null,
        parent_id: parent_id || null,
        head_id: head_id || null,
        level: level || 1,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
      { transaction: t },
    );

    await t.commit();

    return res.status(201).json({
      success: true,
      message: "Sector node created successfully",
      data: node,
    });
  } catch (error) {
    await t.rollback();
    console.error("Error creating sector node:", error);
    return res.status(500).json({
      success: false,
      message: "Error creating sector node",
      error: error.message,
    });
  }
};

/**
 * =================== Get All Sector Nodes ===================
 */
const getSectorNodes = async (req, res) => {
  try {
    const { is_active, search, page = 1, limit = 10, hierarchy } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const limitInt = parseInt(limit);
    const whereClause = {};

    if (is_active !== undefined) {
      whereClause.is_active = is_active === "true";
    }

    let finalWhere = whereClause;
    if (search) {
      const searchWhere = {
        [Op.or]: [
          { name: { [Op.iLike]: `%${search}%` } },
          { name_am: { [Op.iLike]: `%${search}%` } },
          { description: { [Op.iLike]: `%${search}%` } },
        ],
      };
      
      if (hierarchy === "true") {
        const AccessService = require("../../services/accessService");
        // Find all matching nodes first
        const matchingNodes = await SectorNode.findAll({
          where: { ...whereClause, ...searchWhere },
          attributes: ["sector_node_id", "parent_id"],
        });

        // Collect all ancestors for matches to preserve hierarchy context
        const allIds = new Set();
        for (const node of matchingNodes) {
          allIds.add(node.sector_node_id);
          const ancestors = await AccessService.getAncestorSectorNodeIds(node.sector_node_id);
          ancestors.forEach(id => allIds.add(id));
        }

        finalWhere = {
          sector_node_id: { [Op.in]: Array.from(allIds) }
        };
      } else {
        finalWhere = { ...whereClause, ...searchWhere };
      }
    }

    const { count, rows: nodes } = await SectorNode.findAndCountAll({
      where: finalWhere,
      distinct: true,
      include: [
        {
          model: SectorNode,
          as: "children",
        },
        {
          model: SectorNode,
          as: "parent",
        },
        {
          model: User,
          as: "head",
          attributes: { exclude: ["password"] },
        },
      ],
      order: [["created_at", "ASC"]],
      limit: limitInt,
      offset: offset,
    });

    return res.status(200).json({
      success: true,
      message: "Sector nodes fetched successfully",
      data: nodes.map(n => n.get({ plain: true })),
      meta: {
        totalItems: count,
        totalPages: Math.ceil(count / limitInt),
        currentPage: parseInt(page),
        itemsPerPage: limitInt,
      },
    });
  } catch (error) {
    console.error("Error fetching sector nodes:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch sector nodes",
      error: error.message,
    });
  }
};

/**
 * =================== Get Sectors With Flat Descendants ===================
 */

const getSectorsWithFlatChildren = async (req, res) => {
  try {
    const { is_active, search } = req.query;

    const whereClause = {};

    if (is_active !== undefined) {
      whereClause.is_active = is_active === "true";
    }

    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { name_am: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } },
      ];
    }

    // 1️⃣ Fetch ALL nodes
    const allNodes = await SectorNode.findAll({
      where: whereClause,
      order: [["created_at", "ASC"]],
      raw: true,
    });

    // 2️⃣ Group by parent_id
    const nodesByParent = {};

    allNodes.forEach((node) => {
      const parentId = node.parent_id || "ROOT";

      if (!nodesByParent[parentId]) {
        nodesByParent[parentId] = [];
      }

      nodesByParent[parentId].push(node);
    });

    // 3️⃣ Recursive function to collect ALL descendants (flattened)
    const collectDescendants = (parentId, result = []) => {
      const children = nodesByParent[parentId] || [];

      for (const child of children) {
        result.push(child);
        collectDescendants(child.sector_node_id, result);
      }

      return result;
    };

    // 4️⃣ Get root nodes (parent_id = null)
    const rootNodes = nodesByParent["ROOT"] || [];

    // 5️⃣ Get ONLY root children (ignore root itself)
    let firstLevelSectors = [];

    rootNodes.forEach((root) => {
      const children = nodesByParent[root.sector_node_id] || [];
      firstLevelSectors.push(...children);
    });

    // 6️⃣ Build final response
    const response = firstLevelSectors.map((sector) => ({
      sector,
      children: collectDescendants(sector.sector_node_id, []),
    }));

    return res.status(200).json({
      success: true,
      message:
        "Root children sectors with flattened descendants fetched successfully",
      data: response,
    });
  } catch (error) {
    console.error("Error fetching sector tree:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch sectors",
      error: error.message,
    });
  }
};

/**
 * =================== Get Sector Node By ID ===================
 */
const getSectorNodeById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isUuid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid sector node ID format.",
      });
    }

    const node = await SectorNode.findByPk(id, {
      include: [
        { model: SectorNode, as: "children" },
        { model: SectorNode, as: "parent" },
        {
          model: User,
          as: "head",
          attributes: { exclude: ["password"] },
        },
      ],
    });

    if (!node) {
      return res.status(404).json({
        success: false,
        message: "Sector node not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Sector node fetched successfully",
      data: node.get({ plain: true }),
    });
  } catch (error) {
    console.error("Error fetching sector node:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching sector node",
      error: error.message,
    });
  }
};

/**
 * =================== Update Sector Node ===================
 */
const updateSectorNode = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;

    if (!isUuid(id)) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "Invalid sector node ID format.",
      });
    }

    const node = await SectorNode.findByPk(id, { transaction: t });

    if (!node) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        message: "Sector node not found.",
      });
    }

    // If updating head_id, verify user exists
    if (req.body.head_id) {
      const head = await User.findByPk(req.body.head_id, { transaction: t });
      if (!head) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: "Provided head user does not exist.",
        });
      }
    }

    await node.update(
      {
        ...req.body,
        updated_at: new Date(),
      },
      { transaction: t },
    );

    await t.commit();

    return res.status(200).json({
      success: true,
      message: "Sector node updated successfully",
      data: node,
    });
  } catch (error) {
    await t.rollback();
    console.error("Error updating sector node:", error);
    return res.status(500).json({
      success: false,
      message: "Error updating sector node",
      error: error.message,
    });
  }
};

/**
 * =================== Delete Sector Node (Soft Delete) ===================
 */
const deleteSectorNode = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;

    if (!isUuid(id)) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "Invalid sector node ID format.",
      });
    }

    const node = await SectorNode.findByPk(id, { transaction: t });

    if (!node) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        message: "Sector node not found.",
      });
    }

    await node.update(
      { is_active: false, updated_at: new Date() },
      { transaction: t },
    );

    await t.commit();

    return res.status(200).json({
      success: true,
      message: "Sector node deactivated successfully",
    });
  } catch (error) {
    await t.rollback();
    console.error("Error deleting sector node:", error);
    return res.status(500).json({
      success: false,
      message: "Error deleting sector node",
      error: error.message,
    });
  }
};

/**
 * =================== Toggle Sector Node Active Status ===================
 */
const toggleSectorNodeActiveStatus = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;

    if (!isUuid(id)) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "Invalid sector node ID format.",
      });
    }

    const node = await SectorNode.findByPk(id, { transaction: t });

    if (!node) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        message: "Sector node not found.",
      });
    }



    await node.update(
      { is_active: !node.is_active, updated_at: new Date() },
      { transaction: t },
    );

    await t.commit();

    return res.status(200).json({
      success: true,
      message: `Sector node ${node.is_active ? "activated" : "deactivated"
        } successfully`,
    });
  } catch (error) {
    await t.rollback();
    console.error("Error toggling sector node status:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update sector node status",
      error: error.message,
    });
  }
};

/**
 * =================== Get Sector Node Users ===================
 */
const getSectorNodeUsers = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isUuid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid sector node ID format.",
      });
    }

    const node = await SectorNode.findByPk(id, {
      include: [
        {
          model: User,
          as: "users",
          attributes: { exclude: ["password"] },
        },
        { model: SectorNode, as: "parent" },
        { model: SectorNode, as: "children" },
      ],
    });

    if (!node) {
      return res.status(404).json({
        success: false,
        message: "Sector node not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Sector node users fetched successfully",
      data: {
        sector_node: node.get({ plain: true }),
        users: node.users ? node.users.map(u => u.get({ plain: true })) : [],
      },
    });
  } catch (error) {
    console.error("Error fetching sector node users:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching sector node users",
      error: error.message,
    });
  }
};

/**
 * =================== Get Sector Node's Children Users ===================
 */
const getSectorNodeChildrenUsers = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isUuid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid sector node ID format.",
        data: [],
      });
    }

    const node = await SectorNode.findByPk(id);

    if (!node) {
      return res.status(404).json({
        success: false,
        message: "Sector node not found.",
        data: [],
      });
    }

    // Get all descendant node IDs
    const childNodeIds = await collectChildNodeIds(id);

    if (childNodeIds.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No child sector nodes found",
        data: [],
      });
    }

    const users = await User.findAll({
      where: {
        sector_node_id: childNodeIds,
      },
      attributes: { exclude: ["password"] },
      include: [
        {
          model: SectorNode,
          as: "sectorNode",
          attributes: ["sector_node_id", "name"],
        },
      ],
    });

    return res.status(200).json({
      success: true,
      message: "Children sector node users fetched successfully",
      data: users.map(u => u.get({ plain: true })),
    });
  } catch (error) {
    console.error("Error fetching children sector node users:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching children sector node users",
      error: error.message,
    });
  }
};

module.exports = {
  createSectorNode,
  getSectorNodes,
  getSectorNodeById,
  updateSectorNode,
  deleteSectorNode,
  toggleSectorNodeActiveStatus,
  getSectorNodeChildrenUsers,
  getSectorNodeUsers,
  getSectorsWithFlatChildren,
};

const collectChildNodeIds = async (nodeId, collected = []) => {
  const children = await SectorNode.findAll({
    where: { parent_id: nodeId },
    attributes: ["sector_node_id"],
  });

  for (const child of children) {
    collected.push(child.sector_node_id);
    await collectChildNodeIds(child.sector_node_id, collected);
  }

  return collected;
};
