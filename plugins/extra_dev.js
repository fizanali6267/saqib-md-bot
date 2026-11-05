'use strict';
/**
 * 🧑‍💻 DEVELOPER & UTILITIES — command pack.
 * Handlers live in lib/extra/handlers/dev.js
 */
const { createExtraPlugin } = require('../lib/extra/pluginFactory');
const { handlers } = require('../lib/extra/handlers/dev');

module.exports = createExtraPlugin('extra_dev', handlers);
