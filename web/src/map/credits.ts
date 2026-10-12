/**
 * The map's credits and licences, listed in full in Settings ("Sources and licences"). The map's own attribution control shows the
 * same credits: the National Highways line is MapView's customAttribution, and the base map's come from the OpenFreeMap style.
 */
export const NH_MAP_CREDIT = "Closures, diversions and junctions: National Highways, Open Government Licence v3.0";

export const MAP_CREDITS: { name: string; text: string; licence: string; licenceUrl: string }[] = [
  {
    name: "National Highways",
    text: `${NH_MAP_CREDIT}. Diversion routes: Data derived from Ordnance Survey Highway Network, Subject to Crown copyright and database rights 2024. Ordnance Survey Licence: AC0000827444.`,
    licence: "Open Government Licence v3.0",
    licenceUrl: "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
  },
  {
    name: "Base map",
    text: "OpenFreeMap © OpenMapTiles Data from OpenStreetMap.",
    licence: "OpenStreetMap copyright and licence",
    licenceUrl: "https://www.openstreetmap.org/copyright",
  },
];

/**
 * The ULEZ layer's boundary-comparison figures (its source note) come from the GLA's copy of the boundary, which is used for that
 * check only and not shipped. Listed in Settings with the ULEZ source. OGL v2.0's default attribution statement: the dataset page
 * specifies none (checked 2026-10-12).
 */
export const GLA_BOUNDARY_CHECK_CREDIT = {
  name: "Greater London Authority",
  text: "ULEZ boundary comparison figures: from the Greater London Authority's London Wide Ultra Low Emission Zone 2023 dataset. Contains public sector information licensed under the Open Government Licence v2.0.",
  licence: "Open Government Licence v2.0",
  licenceUrl: "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/2/",
};
