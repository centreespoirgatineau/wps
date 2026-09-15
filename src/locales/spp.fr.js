// Système de Prévention de Pertes — the food-bank instance (BRAND=spp).
//
// Only the strings that differ from fr.js; everything else falls through to it,
// so a wording fix made once is made for both platforms.
//
// Nothing here may name Jesus Christ, the gospel, churches, ministries or
// pastors: this audience is not the church network. `test/brand.test.js`
// enforces it, and also refuses a key that does not exist in fr.js — otherwise
// a typo would silently change nothing.
export default {
  // ---- link preview ----
  'meta.og_title': 'Les surplus alimentaires, redistribués le jour même',
  'meta.og_desc': 'Les surplus alimentaires du Centre Espoir de Gatineau, redistribués le jour même aux banques alimentaires de l’Outaouais.',
  'meta.title_suffix': 'Système de Prévention de Pertes, Centre Espoir',
  'meta.og_image_alt': 'Le phare du Centre Espoir de Gatineau, et les mots « Les surplus alimentaires, redistribués le jour même ».',

  // ---- about ----
  'about.what_body': 'À l’occasion, le Centre Espoir de Gatineau reçoit des surplus alimentaires à distribuer le jour même. Ils sont ensuite offerts aux banques alimentaires et aux organismes communautaires de la région, pour que rien ne se perde et que tout serve à nourrir des gens.',
  'about.rule_1': 'Ces lots doivent servir à nourrir des personnes dans le besoin. Ils ne peuvent être ni revendus ni utilisés à des fins commerciales.',

  // ---- join ----
  'join.organization': 'Organisme',
};
