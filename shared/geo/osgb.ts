import type { LonLat } from "./distance.ts";

/**
 * British National Grid (EPSG:27700, OSGB36 datum) to WGS84 longitude/latitude, by Ordnance Survey's published method: inverse
 * Transverse Mercator on the Airy 1830 ellipsoid, then a 7-parameter Helmert transformation to WGS84 ("A guide to coordinate
 * systems in Great Britain", OS, sections 6.2 and 6.6 and Annex C). The Helmert step is accurate to about 5 m; OS's grid-based OSTN15
 * is more precise but needs its 15 MB grid. Used to check source coordinates (restriction locations and zone boundaries are shown
 * at map scale, and every source record keeps its original values).
 */
const AIRY = { a: 6377563.396, b: 6356256.909 };
const GRS80 = { a: 6378137, b: 6356752.3141 };
const F0 = 0.9996012717;
const LAT0 = (49 * Math.PI) / 180;
const LON0 = (-2 * Math.PI) / 180;
const E0 = 400000;
const N0 = -100000;

/** OSGB36 → WGS84 (OS guide, Annex C, the reverse of the WGS84 → OSGB36 parameters). */
const HELMERT = { tx: 446.448, ty: -125.157, tz: 542.06, s: -20.4894e-6, rx: 0.1502, ry: 0.247, rz: 0.8421 };
const SEC = Math.PI / (180 * 3600);

function meridionalArc(phi: number): number {
  const { a, b } = AIRY;
  const n = (a - b) / (a + b);
  const n2 = n * n;
  const n3 = n2 * n;
  const d = phi - LAT0;
  const s = phi + LAT0;
  return (
    b *
    F0 *
    ((1 + n + (5 / 4) * n2 + (5 / 4) * n3) * d -
      (3 * n + 3 * n2 + (21 / 8) * n3) * Math.sin(d) * Math.cos(s) +
      ((15 / 8) * n2 + (15 / 8) * n3) * Math.sin(2 * d) * Math.cos(2 * s) -
      (35 / 24) * n3 * Math.sin(3 * d) * Math.cos(3 * s))
  );
}

/** Easting/northing (metres) → OSGB36 latitude/longitude (radians). OS guide C.2. */
export function gridToOsgb36(easting: number, northing: number): { lat: number; lon: number } {
  const { a, b } = AIRY;
  const e2 = 1 - (b * b) / (a * a);
  let phi = LAT0;
  let m = 0;
  do {
    phi = (northing - N0 - m) / (a * F0) + phi;
    m = meridionalArc(phi);
  } while (Math.abs(northing - N0 - m) >= 0.00001);
  const sin = Math.sin(phi);
  const cos = Math.cos(phi);
  const tan = Math.tan(phi);
  const nu = (a * F0) / Math.sqrt(1 - e2 * sin * sin);
  const rho = (a * F0 * (1 - e2)) / Math.pow(1 - e2 * sin * sin, 1.5);
  const eta2 = nu / rho - 1;
  const VII = tan / (2 * rho * nu);
  const VIII = (tan / (24 * rho * nu ** 3)) * (5 + 3 * tan ** 2 + eta2 - 9 * tan ** 2 * eta2);
  const IX = (tan / (720 * rho * nu ** 5)) * (61 + 90 * tan ** 2 + 45 * tan ** 4);
  const X = 1 / (cos * nu);
  const XI = (1 / (6 * cos * nu ** 3)) * (nu / rho + 2 * tan ** 2);
  const XII = (1 / (120 * cos * nu ** 5)) * (5 + 28 * tan ** 2 + 24 * tan ** 4);
  const XIIA = (1 / (5040 * cos * nu ** 7)) * (61 + 662 * tan ** 2 + 1320 * tan ** 4 + 720 * tan ** 6);
  const dE = easting - E0;
  return {
    lat: phi - VII * dE ** 2 + VIII * dE ** 4 - IX * dE ** 6,
    lon: LON0 + X * dE - XI * dE ** 3 + XII * dE ** 5 - XIIA * dE ** 7,
  };
}

function toCartesian(lat: number, lon: number, { a, b }: { a: number; b: number }) {
  const e2 = 1 - (b * b) / (a * a);
  const nu = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
  return { x: nu * Math.cos(lat) * Math.cos(lon), y: nu * Math.cos(lat) * Math.sin(lon), z: (1 - e2) * nu * Math.sin(lat) };
}

function fromCartesian(x: number, y: number, z: number, { a, b }: { a: number; b: number }) {
  const e2 = 1 - (b * b) / (a * a);
  const p = Math.sqrt(x * x + y * y);
  let lat = Math.atan2(z, p * (1 - e2));
  for (let i = 0; i < 10; i++) {
    const nu = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
    lat = Math.atan2(z + e2 * nu * Math.sin(lat), p);
  }
  return { lat, lon: Math.atan2(y, x) };
}

/** British National Grid easting/northing → WGS84 [longitude, latitude] in degrees. */
export function gridToWgs84(easting: number, northing: number): LonLat {
  const osgb = gridToOsgb36(easting, northing);
  const c = toCartesian(osgb.lat, osgb.lon, AIRY);
  const { tx, ty, tz, s } = HELMERT;
  const rx = HELMERT.rx * SEC;
  const ry = HELMERT.ry * SEC;
  const rz = HELMERT.rz * SEC;
  const x = tx + (1 + s) * c.x - rz * c.y + ry * c.z;
  const y = ty + rz * c.x + (1 + s) * c.y - rx * c.z;
  const z = tz - ry * c.x + rx * c.y + (1 + s) * c.z;
  const w = fromCartesian(x, y, z, GRS80);
  return [(w.lon * 180) / Math.PI, (w.lat * 180) / Math.PI];
}
