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
