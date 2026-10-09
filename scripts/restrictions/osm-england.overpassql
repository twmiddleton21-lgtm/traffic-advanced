/*
  OpenStreetMap height and weight restrictions in England, for the community restrictions layer (docs/RESTRICTIONS.md).
  Run once per tile of England's bounding box ({{BBOX}} = south,west,north,east; tiles in fetch-sources.ts) to keep each query
  short; two dozen short queries per refresh is well inside the public Overpass usage policy. Tiles also cover parts of Wales,
  Scotland, the Isle of Man and France: the build keeps only elements inside England (ONS boundary, fetch-sources.ts), which is
  far cheaper than clipping on the shared server. Elements on a tile edge appear in two tiles: the build de-duplicates them.
  Roads that motor vehicles use, plus restriction nodes (height barriers, bridges mapped as points). `out meta` is needed for each
  element's version and last-edit time; the build keeps only id, version and timestamp and never stores user names or ids.
*/
[out:json][timeout:600][maxsize:536870912];
(
  way({{BBOX}})["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|living_street|road|busway|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"]["maxheight"];
  way({{BBOX}})["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|living_street|road|busway|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"]["maxheight:physical"];
  way({{BBOX}})["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|living_street|road|busway|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"]["maxheight:conditional"];
  way({{BBOX}})["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|living_street|road|busway|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"]["maxweight"];
  way({{BBOX}})["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|living_street|road|busway|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"]["maxweight:conditional"];
  way({{BBOX}})["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|living_street|road|busway|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"]["maxweightrating"];
  way({{BBOX}})["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|living_street|road|busway|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"]["maxweightrating:hgv"];
  way({{BBOX}})["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|living_street|road|busway|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"]["maxweightrating:hgv:conditional"];
  way({{BBOX}})["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|living_street|road|busway|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"]["maxweight:hgv"];
  way({{BBOX}})["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|living_street|road|busway|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"]["maxweight:hgv:conditional"];
  node({{BBOX}})["maxheight"];
  node({{BBOX}})["maxheight:physical"];
  node({{BBOX}})["maxweight"];
  node({{BBOX}})["maxweightrating:hgv"];
);
out meta geom qt;
