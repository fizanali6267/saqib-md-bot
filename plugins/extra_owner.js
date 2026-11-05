'use strict';
/**
 * 🔐 PRIVACY & SECURITY — command pack.
 * Handlers live in lib/extra/handlers/owner_security.js
 */
const { createExtraPlugin } = require('../lib/extra/pluginFactory');
const { handlers } = require('../lib/extra/handlers/owner_security');

module.exports = createExtraPlugin('extra_owner', handlers);
