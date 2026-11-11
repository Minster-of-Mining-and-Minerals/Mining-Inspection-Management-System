const Joi = require("joi");

const createRoleSchema = Joi.object({
  name: Joi.string().trim().required().messages({
    "string.empty": "Role name is required",
  }),

  description: Joi.string().trim().required().messages({
    "string.empty": "Role description is required",
  }),
  role_type: Joi.string()
    .trim()
    .optional()
    .valid("internal", "external")
    .messages({
      "any.only": "role_type must be either 'internal' or 'external'",
    }),
  is_active: Joi.boolean().optional(),
  // Central users: the sector the role belongs to (empty = a global role). Sector users: ignored.
  sector_node_id: Joi.string().guid().allow(null, "").optional(),
  permission_ids: Joi.alternatives()
    .try(
      Joi.array().items(
        Joi.string().guid({ version: "uuidv4" }).messages({
          "string.guid": "Each permission_id must be a valid UUID",
        })
      ),
      Joi.string()
    )
    .optional()
    .messages({
      "array.includes": "permission_ids must be a list of UUIDs",
    }),

  sub_roles: Joi.array()
    .items(
      Joi.object({
        sub_role_id: Joi.string()
          .guid({ version: "uuidv4" })
          .optional()
          .allow("")
          .messages({
            "string.guid": "Each sub_role_id must be a valid UUID",
          }),

        name: Joi.string().trim().optional().messages({
          "string.empty": "Name cannot be empty if creating a new sub-role",
        }),

        description: Joi.string().trim().optional(),

        permission_ids: Joi.alternatives()
          .try(
            Joi.array().items(
              Joi.string().guid({ version: "uuidv4" }).messages({
                "string.guid": "Each permission_id must be a valid UUID",
              })
            ),
            Joi.string()
          )
          .optional()
          .messages({
            "array.includes": "permission_ids must be a list of UUIDs",
          }),
      })
        // Ensure at least sub_role_id or name exists
        .custom((value, helpers) => {
          if (!value.sub_role_id && !value.name) {
            return helpers.message(
              "Either sub_role_id (existing) or name (new) must be provided for sub-role"
            );
          }
          return value;
        })
    )
    .optional()
    .messages({
      "array.base": "sub_roles must be an array",
    }),
});

// Middleware wrappers
exports.validateCreateRole = (req, res, next) => {
  const { error } = createRoleSchema.validate(req.body, { abortEarly: false });
  if (error)
    return res.status(400).json({
      success: false,
      message: "Validation error",
      errors: error.details.map((e) => e.message),
    });
  next();
};

// Schema for updating a Role
const updateRoleSchema = Joi.object({
  name: Joi.string().trim().optional(),
  description: Joi.string().trim().optional(),
  is_active: Joi.boolean().optional(),
  role_type: Joi.string()
    .trim()
    .optional()
    .valid("internal", "external")
    .messages({
      "any.only": "role_type must be either 'internal' or 'external'",
    }),
  // Allow updating permissions at role level
  permission_ids: Joi.array()
    .items(
      Joi.string()
        .guid({ version: "uuidv4" })
        .messages({ "string.guid": "Each permission_id must be a valid UUID" })
    )
    .optional(),

  sub_roles: Joi.array()
    .items(
      Joi.object({
        sub_role_id: Joi.string()
          .guid({ version: "uuidv4" })
          .required()
          .messages({ "string.guid": "Each sub_role_id must be a valid UUID" }),

        permission_ids: Joi.array()
          .items(
            Joi.string().guid({ version: "uuidv4" }).messages({
              "string.guid": "Each permission_id must be a valid UUID",
            })
          )
          .optional(),
      })
    )
    .optional(),
});

// Middleware wrappers
exports.validateCreateRole = (req, res, next) => {
  const { error } = createRoleSchema.validate(req.body, { abortEarly: false });
  if (error)
    return res.status(400).json({
      success: false,
      message: "Validation error",
      errors: error.details.map((e) => e.message),
    });
  next();
};

// Copy a role into a sector, to change it there
const copyRoleSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).optional(),
  description: Joi.string().trim().allow("").optional(),
  // Central users: the sector to copy into. Sector users: ignored (their own sector).
  sector_node_id: Joi.string().guid().optional(),
});

exports.validateCopyRole = (req, res, next) => {
  const { error } = copyRoleSchema.validate(req.body ?? {}, { abortEarly: false });
  if (error)
    return res.status(400).json({
      success: false,
      message: "Validation error",
      errors: error.details.map((e) => e.message),
    });
  next();
};

exports.validateUpdateRole = (req, res, next) => {
  const { error } = updateRoleSchema.validate(req.body, { abortEarly: false });
  if (error)
    return res.status(400).json({
      success: false,
      message: "Validation error",
      errors: error.details.map((e) => e.message),
    });
  next();
};
