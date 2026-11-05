'use strict';
/**
 * 🪪 PROFILE & INTERACTIVE — command pack.
 * Handlers live in lib/extra/handlers/profile.js
 */
const { createExtraPlugin } = require('../lib/extra/pluginFactory');
const { handlers } = require('../lib/extra/handlers/profile');

module.exports = createExtraPlugin('extra_profile', handlers);
