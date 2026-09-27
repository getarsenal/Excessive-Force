/**
 * Where the catalogued maps are: the geography half of `atlas.js`.
 *
 * Kept apart from the landmarks so the bake tools can read it without
 * building anything: `tools/atlas.mjs` turns these into terrain-bake entries.
 *
 * Fields: `id`, the landmark and its city, the coordinates of the landmark's
 * centre, the ISO code the campaign map pins it to, the officer's nation code,
 * the climate preset (`clime`), and what the ground is like:
 *   hill   a rock or a hill the landmark sits on: no ceiling on the DEM
 *   coast  sea or a big lake at hand (the fleet and the precinct's quay)
 *   river  a river through the map
 *   remote a site with little town round it (the street-furniture tests)
 *   pad    the bake's levelled pad, metres across (default 70), and
 *   padH   its height: land by declaration, for a building standing in water
 */
export const PLACES = [
  // Europe
  { id: 'milan', landmark: 'Milan Cathedral', city: 'Milan', lat: 45.46417, lon: 9.19039, iso: 'ITA', code: 'it', clime: 'mediterranean' },
  { id: 'stvitus', landmark: 'St. Vitus Cathedral', city: 'Prague', lat: 50.09088, lon: 14.40063, iso: 'CZE', code: 'cz', clime: 'temperate', hill: true },
  { id: 'ulm', landmark: 'Ulm Minster', city: 'Ulm', lat: 48.39852, lon: 9.99183, iso: 'DEU', code: 'de', clime: 'temperate', river: true },
  { id: 'brandenburg', landmark: 'Brandenburg Gate', city: 'Berlin', lat: 52.51628, lon: 13.37770, iso: 'DEU', code: 'de', clime: 'temperate' },
  { id: 'stephansdom', landmark: "St. Stephen's Cathedral", city: 'Vienna', lat: 48.20849, lon: 16.37321, iso: 'AUT', code: 'at', clime: 'temperate' },
  { id: 'hohensalzburg', landmark: 'Hohensalzburg Fortress', city: 'Salzburg', lat: 47.79494, lon: 13.04748, iso: 'AUT', code: 'at', clime: 'alpine', hill: true, river: true, remote: true },
  { id: 'versailles', landmark: 'Palace of Versailles', city: 'Versailles', lat: 48.80490, lon: 2.12037, iso: 'FRA', code: 'fr', clime: 'temperate' },
  { id: 'chambord', landmark: 'Château de Chambord', city: 'Chambord', lat: 47.61610, lon: 1.51704, iso: 'FRA', code: 'fr', clime: 'temperate', remote: true },
  { id: 'seville', landmark: 'Seville Cathedral', city: 'Seville', lat: 37.38583, lon: -5.99333, iso: 'ESP', code: 'es', clime: 'mediterranean' },
  { id: 'alhambra', landmark: 'Alhambra', city: 'Granada', lat: 37.17607, lon: -3.58811, iso: 'ESP', code: 'es', clime: 'mediterranean', hill: true },
  { id: 'malbork', landmark: 'Malbork Castle', city: 'Malbork', lat: 54.04003, lon: 19.02785, iso: 'POL', code: 'pl', clime: 'temperate', river: true },
  { id: 'warsaw', landmark: 'Palace of Culture and Science', city: 'Warsaw', lat: 52.23177, lon: 21.00597, iso: 'POL', code: 'pl', clime: 'temperate' },
  { id: 'bran', landmark: 'Bran Castle', city: 'Bran', lat: 45.51490, lon: 25.36725, iso: 'ROU', code: 'ro', clime: 'alpine', hill: true, remote: true },
  { id: 'bucharest', landmark: 'Palace of the Parliament', city: 'Bucharest', lat: 44.42749, lon: 26.08745, iso: 'ROU', code: 'ro', clime: 'temperate' },
  { id: 'kronborg', landmark: 'Kronborg Castle', city: 'Helsingør', lat: 56.03897, lon: 12.62165, iso: 'DNK', code: 'dk', clime: 'nordic', coast: true },
  { id: 'stockholm', landmark: 'Stockholm Palace', city: 'Stockholm', lat: 59.32683, lon: 18.07161, iso: 'SWE', code: 'se', clime: 'nordic', coast: true },
  { id: 'hallgrimskirkja', landmark: 'Hallgrímskirkja', city: 'Reykjavík', lat: 64.14200, lon: -21.92667, iso: 'ISL', code: 'is', clime: 'nordic' },
  { id: 'trakai', landmark: 'Trakai Island Castle', city: 'Trakai', lat: 54.65222, lon: 24.93361, iso: 'LTU', code: 'lt', clime: 'nordic', coast: true, remote: true },
  { id: 'winterpalace', landmark: 'Winter Palace', city: 'Saint Petersburg', lat: 59.94056, lon: 30.31389, iso: 'RUS', code: 'ru', clime: 'nordic', river: true },
  { id: 'belem', landmark: 'Belém Tower', city: 'Lisbon', lat: 38.69158, lon: -9.21599, iso: 'PRT', code: 'pt', clime: 'mediterranean', coast: true, pad: 112, padH: 1.0 },
  { id: 'salisbury', landmark: 'Salisbury Cathedral', city: 'Salisbury', lat: 51.06508, lon: -1.79745, iso: 'GBR', code: 'uk', clime: 'temperate' },
  { id: 'windsor', landmark: 'Windsor Castle', city: 'Windsor', lat: 51.48389, lon: -0.60444, iso: 'GBR', code: 'uk', clime: 'temperate', river: true },
  { id: 'nidaros', landmark: 'Nidaros Cathedral', city: 'Trondheim', lat: 63.42694, lon: 10.39694, iso: 'NOR', code: 'no', clime: 'nordic', river: true },
  { id: 'helsinki', landmark: 'Helsinki Cathedral', city: 'Helsinki', lat: 60.17028, lon: 24.95222, iso: 'FIN', code: 'fi', clime: 'nordic', coast: true },
  { id: 'chillon', landmark: 'Château de Chillon', city: 'Montreux', lat: 46.41417, lon: 6.92750, iso: 'CHE', code: 'ch', clime: 'alpine', coast: true },
  { id: 'saintsava', landmark: 'Church of Saint Sava', city: 'Belgrade', lat: 44.79806, lon: 20.46889, iso: 'SRB', code: 'rs', clime: 'temperate' },
  // Asia
  { id: 'taipei101', landmark: 'Taipei 101', city: 'Taipei', lat: 25.03361, lon: 121.56500, iso: 'TWN', code: 'tw', clime: 'subtropical' },
  { id: 'shanghaitower', landmark: 'Shanghai Tower', city: 'Shanghai', lat: 31.23556, lon: 121.50111, iso: 'CHN', code: 'cn', clime: 'subtropical', river: true },
  { id: 'wildgoose', landmark: 'Giant Wild Goose Pagoda', city: "Xi'an", lat: 34.21944, lon: 108.95917, iso: 'CHN', code: 'cn', clime: 'temperate' },
  { id: 'landmark81', landmark: 'Landmark 81', city: 'Ho Chi Minh City', lat: 10.79500, lon: 106.72194, iso: 'VNM', code: 'vn', clime: 'tropical', river: true },
  { id: 'boudhanath', landmark: 'Boudhanath Stupa', city: 'Kathmandu', lat: 27.72150, lon: 85.36200, iso: 'NPL', code: 'np', clime: 'highland' },
  { id: 'victoriamemorial', landmark: 'Victoria Memorial', city: 'Kolkata', lat: 22.54484, lon: 88.34257, iso: 'IND', code: 'in', clime: 'tropical' },
  { id: 'hawamahal', landmark: 'Hawa Mahal', city: 'Jaipur', lat: 26.92389, lon: 75.82667, iso: 'IND', code: 'in', clime: 'desert' },
  { id: 'redfort', landmark: 'Red Fort', city: 'Delhi', lat: 28.65611, lon: 77.24111, iso: 'IND', code: 'in', clime: 'desert' },
  { id: 'gatewayindia', landmark: 'Gateway of India', city: 'Mumbai', lat: 18.92197, lon: 72.83408, iso: 'IND', code: 'in', clime: 'tropical', coast: true, pad: 130, padH: 2.0 },
  { id: 'osaka', landmark: 'Osaka Castle', city: 'Osaka', lat: 34.68725, lon: 135.52586, iso: 'JPN', code: 'jp', clime: 'subtropical', hill: true },
  { id: 'kinkakuji', landmark: 'Kinkaku-ji', city: 'Kyoto', lat: 35.03937, lon: 135.72924, iso: 'JPN', code: 'jp', clime: 'subtropical', remote: true },
  { id: 'juche', landmark: 'Juche Tower', city: 'Pyongyang', lat: 39.01722, lon: 125.76361, iso: 'PRK', code: 'kp', clime: 'temperate', river: true },
  { id: 'monas', landmark: 'National Monument', city: 'Jakarta', lat: -6.17539, lon: 106.82718, iso: 'IDN', code: 'id', clime: 'tropical' },
  { id: 'prambanan', landmark: 'Prambanan', city: 'Yogyakarta', lat: -7.75202, lon: 110.49147, iso: 'IDN', code: 'id', clime: 'tropical', remote: true },
  { id: 'minarpakistan', landmark: 'Minar-e-Pakistan', city: 'Lahore', lat: 31.59250, lon: 74.30944, iso: 'PAK', code: 'pk', clime: 'desert' },
  { id: 'lotustower', landmark: 'Lotus Tower', city: 'Colombo', lat: 6.92722, lon: 79.85833, iso: 'LKA', code: 'lk', clime: 'tropical', coast: true },
  { id: 'bayterek', landmark: 'Bayterek Tower', city: 'Astana', lat: 51.12833, lon: 71.43056, iso: 'KAZ', code: 'kz', clime: 'steppe' },
  { id: 'registan', landmark: 'Registan', city: 'Samarkand', lat: 39.65472, lon: 66.97583, iso: 'UZB', code: 'uz', clime: 'desert' },
  { id: 'flametowers', landmark: 'Flame Towers', city: 'Baku', lat: 40.35944, lon: 49.82611, iso: 'AZE', code: 'az', clime: 'steppe', coast: true },
  { id: 'azadi', landmark: 'Azadi Tower', city: 'Tehran', lat: 35.69972, lon: 51.33806, iso: 'IRN', code: 'ir', clime: 'desert' },
  { id: 'kingdomcentre', landmark: 'Kingdom Centre', city: 'Riyadh', lat: 24.71139, lon: 46.67444, iso: 'SAU', code: 'sa', clime: 'desert' },
  { id: 'baalbek', landmark: 'Temple of Bacchus', city: 'Baalbek', lat: 34.00694, lon: 36.20389, iso: 'LBN', code: 'lb', clime: 'mediterranean', remote: true },
  { id: 'ur', landmark: 'Ziggurat of Ur', city: 'Nasiriyah', lat: 30.96250, lon: 46.10306, iso: 'IRQ', code: 'iq', clime: 'desert', remote: true },
  // Africa
  { id: 'djoser', landmark: 'Pyramid of Djoser', city: 'Saqqara', lat: 29.87139, lon: 31.21639, iso: 'EGY', code: 'eg', clime: 'desert', remote: true },
  { id: 'yamoussoukro', landmark: 'Basilica of Our Lady of Peace', city: 'Yamoussoukro', lat: 6.81194, lon: -5.29667, iso: 'CIV', code: 'ci', clime: 'tropical', remote: true },
  // The Americas and Oceania
  { id: 'cntower', landmark: 'CN Tower', city: 'Toronto', lat: 43.64256, lon: -79.38706, iso: 'CAN', code: 'ca', clime: 'temperate', coast: true },
  { id: 'frontenac', landmark: 'Château Frontenac', city: 'Quebec City', lat: 46.81194, lon: -71.20528, iso: 'CAN', code: 'ca', clime: 'nordic', hill: true, river: true },
  { id: 'capitolio', landmark: 'El Capitolio', city: 'Havana', lat: 23.13528, lon: -82.35944, iso: 'CUB', code: 'cu', clime: 'tropical' },
  { id: 'bellasartes', landmark: 'Palacio de Bellas Artes', city: 'Mexico City', lat: 19.43528, lon: -99.14111, iso: 'MEX', code: 'mx', clime: 'highland' },
  { id: 'teatroamazonas', landmark: 'Teatro Amazonas', city: 'Manaus', lat: -3.13028, lon: -60.02333, iso: 'BRA', code: 'br', clime: 'tropical' },
  { id: 'obelisco', landmark: 'Obelisco', city: 'Buenos Aires', lat: -34.60372, lon: -58.38159, iso: 'ARG', code: 'ar', clime: 'temperate' },
  { id: 'cartagena', landmark: 'Castillo San Felipe de Barajas', city: 'Cartagena', lat: 10.42278, lon: -75.53972, iso: 'COL', code: 'co', clime: 'tropical', hill: true },
  { id: 'skytower', landmark: 'Sky Tower', city: 'Auckland', lat: -36.84846, lon: 174.76218, iso: 'NZL', code: 'nz', clime: 'temperate', coast: true },
];
