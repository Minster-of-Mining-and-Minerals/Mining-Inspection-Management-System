const Joi = require("joi");


const loginSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().required().messages({
    "string.email": "Must be a valid email",
    "any.required": "Email is required",
  }),
  password: Joi.string().min(6).required().messages({
    "string.min": "Password must be at least 6 characters long",
    "any.required": "Password is required",
  }),
});


const logoutSchema = Joi.object({
  token: Joi.string().required().messages({
    "any.required": "Token is required for logout",
  }),
});


exports.validateLogin = (req, res, next) => {
  const { error } = loginSchema.validate(req.body);
  if (error) {
    return res.status(400).json({
      errors: error.details.map((err) => err.message),
    });
  }
  next();
};


exports.validateLogout = (req, res, next) => {
  const { error } = logoutSchema.validate(req.body);
  if (error) {
    return res.status(400).json({
      errors: error.details.map((err) => err.message),
    });
  }
  next();
};