'use strict';
/**
 * 👥 GROUP AUTOMATION — command pack.
 * Handlers live in lib/extra/handlers/group_mod.js
 */
const { createExtraPlugin } = require('../lib/extra/pluginFactory');
const { handlers } = require('../lib/extra/handlers/group_mod');

module.exports = createExtraPlugin('extra_group', handlers);
