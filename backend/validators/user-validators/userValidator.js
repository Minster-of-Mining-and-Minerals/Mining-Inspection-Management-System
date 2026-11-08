const Joi = require("joi");
const ETHIOPIAN_PHONE_REGEX = /^(\+251|0)(9|7)\d{8}$/;
// =================== Create User Schema ===================
const createUserSchema = Joi.object({
  full_name: Joi.string().min(3).max(100).required().messages({
    "string.empty": "Full name is required.",
    "string.min": "Full name must be at least 3 characters long.",
  }),

  email: Joi.string().email().required().messages({
    "string.empty": "Email is required.",
    "string.email": "Please provide a valid email address.",
  }),

  // Optional: inspector accounts imported from the license list have no phone yet
  phone_number: Joi.string()
    .pattern(ETHIOPIAN_PHONE_REGEX)
    .allow(null, "")
    .optional()
    .messages({
      "string.pattern.base":
        "Phone number must be a valid Ethiopian format (e.g., +2519XXXXXXXX or 09XXXXXXXX).",
    }),

  user_type_id: Joi.string().guid({ version: "uuidv4" }).required().messages({
    "string.guid": "User type ID must be a valid UUID.",
    "any.required": "User type ID is required.",
  }),

  sector_node_id: Joi.string().guid({ version: "uuidv4" }).allow(null, "").optional().messages({
    "string.guid": "Sector node ID must be a valid UUID.",
  }),

  department_id: Joi.string().guid({ version: "uuidv4" }).allow(null, "").optional().messages({
    "string.guid": "Department ID must be a valid UUID.",
  }),

  role_ids: Joi.array()
    .items(
      Joi.string()
        .guid({ version: "uuidv4" })
        .messages({ "string.guid": "Each role ID must be a valid UUID." }),
    )
    .optional()
    .allow(null)
    .messages({
      "array.base": "Role ID must be an array of UUIDs.",
    }),

  // Optional: put the new user straight into an inspection team
  team_id: Joi.string().guid().allow(null, "").optional().messages({ "string.guid": "Team must be a valid id." }),
  team_role: Joi.string().valid("member", "leader").optional(),
});

// =================== Update User Schema ===================
const updateUserSchema = Joi.object({
  full_name: Joi.string().min(3).max(100).optional(),
  email: Joi.string().email().optional(),
  phone_number: Joi.string()
    .pattern(ETHIOPIAN_PHONE_REGEX)
    .optional()
    .messages({
      "string.pattern.base":
        "Phone number must be a valid Ethiopian format (e.g., +2519XXXXXXXX or 09XXXXXXXX).",
    }),
  user_type_id: Joi.string().guid({ version: "uuidv4" }).optional(),
  sector_node_id: Joi.string().guid({ version: "uuidv4" }).optional().messages({
    "string.guid": "Sector node ID must be a valid UUID.",
  }),
  department_id: Joi.string().guid({ version: "uuidv4" }).optional().messages({
    "string.guid": "Department ID must be a valid UUID.",
  }),
  // Allow updating assigned roles
  role_ids: Joi.array()
    .items(Joi.string().guid({ version: "uuidv4" }))
    .optional()
    .messages({
      "string.guid": "Each role ID must be a valid UUID.",
    }),
  is_active: Joi.boolean().optional(),
});

// =================== Validators ===================
exports.validateCreateUser = (req, res, next) => {
  const { error } = createUserSchema.validate(req.body, { abortEarly: true });
  if (error) {
    return res.status(400).json({
      success: false,
      message: error.details[0].message,
    });
  }
  next();
};

exports.validateUpdateUser = (req, res, next) => {
  // console.log("validate update user reached");
  const { error } = updateUserSchema.validate(req.body, { abortEarly: true });
  if (error) {
    return res.status(400).json({
      success: false,
      message: error.details[0].message,
    });
  }
  next();
};
