'use strict';
/**
 * 📋 OFFICE & NETWORK — command pack.
 * Handlers live in lib/extra/handlers/office_network.js
 */
const { createExtraPlugin } = require('../lib/extra/pluginFactory');
const { handlers } = require('../lib/extra/handlers/office_network');

module.exports = createExtraPlugin('extra_office', handlers);
