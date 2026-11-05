'use strict';
/**
 * 🎓 EDUCATION — command pack.
 * Handlers live in lib/extra/handlers/education.js
 */
const { createExtraPlugin } = require('../lib/extra/pluginFactory');
const { handlers } = require('../lib/extra/handlers/education');

module.exports = createExtraPlugin('extra_education', handlers);
