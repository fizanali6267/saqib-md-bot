'use strict';
/**
 * 🌍 GEOLOCATION — command pack.
 * Handlers live in lib/extra/handlers/geo.js
 */
const { createExtraPlugin } = require('../lib/extra/pluginFactory');
const { handlers } = require('../lib/extra/handlers/geo');

module.exports = createExtraPlugin('extra_geo', handlers);
