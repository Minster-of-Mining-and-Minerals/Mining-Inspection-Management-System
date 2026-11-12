"use strict";
/** In-app notices about a person's own account (new sign-in, password changed). Never throws. */
const { v4: uuidv4 } = require("uuid");
const db = require("../models");

const accountNotice = (userId, { type, title, message }) =>
  db.Notification.create({
    notification_id: uuidv4(),
    recipient_id: userId,
    recipient_type: "internal",
    type,
    title,
    message,
    related_entity_type: "account",
    related_entity_id: null,
    is_read: false,
  }).catch((e) => console.error(`Account notice (${type}) not sent:`, e.message));

module.exports = { accountNotice };
