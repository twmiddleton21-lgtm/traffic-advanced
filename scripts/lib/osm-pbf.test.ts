import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { afterAll, describe, expect, it } from "vitest";
import { ProtoReader, readPbf, zigzagDecode, type PbfNode, type PbfRelation, type PbfWay } from "./osm-pbf.ts";

/**
 * The PBF reader against a SYNTHETIC file encoded here, field by field, to the published format (wiki.openstreetmap.org/wiki/
 * PBF_Format). On real data it was checked against taginfo for the same extract date (docs/ROUTES-MAP.md): 3,142 highway=speed_camera
 * nodes and 622 enforcement relations in England, both exactly taginfo's counts.
 */

// A minimal protobuf writer.
const varint = (n: number): number[] => {
  const out: number[] = [];
  let v = n;
  while (v >= 128) {
    out.push((v % 128) | 128);
    v = Math.floor(v / 128);
  }
  out.push(v);
  return out;
};
const zz = (n: number) => (n >= 0 ? n * 2 : -n * 2 - 1);
const key = (field: number, wire: number) => varint(field * 8 + wire);
const bytesField = (field: number, data: number[] | Uint8Array) => [...key(field, 2), ...varint(data.length), ...data];
const str = (field: number, s: string) => bytesField(field, [...Buffer.from(s, "utf8")]);
const int = (field: number, n: number) => [...key(field, 0), ...varint(n)];
const packed = (field: number, values: number[], enc: (n: number) => number[]) => bytesField(field, values.flatMap(enc));
const deltas = (values: number[]) => values.map((v, i) => v - (i === 0 ? 0 : values[i - 1]!));

function blob(type: string, block: number[]): Buffer {
  const data = Buffer.from(bytesField(3, [...deflateSync(Buffer.from(block))]).concat(int(2, block.length)));
  const header = Buffer.from([...str(1, type), ...int(3, data.length)]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(header.length);
  return Buffer.concat([len, header, data]);
}

const strings = ["", "highway", "speed_camera", "maxspeed", "30 mph", "maxheight", "4.4", "type", "enforcement", "device", "from", "Ünïcode"];
const s = (x: string) => strings.indexOf(x);

const headerBlock = [
  // An unknown length-prefixed field first: the reader must skip it AND its length prefix (a past bug).
  ...bytesField(99, [1, 2, 3, 4, 5]),
  ...str(4, "OsmSchema-V0.6"),
  ...str(4, "DenseNodes"),
  ...str(5, "Sort.Type_then_ID"),
  ...str(16, "test-writer"),
  ...int(32, 1_760_214_066),
  ...int(33, 4930),
];

const ids = [10_000_000_001, 10_000_000_002, 10_000_000_009];
const lats = [520_000_000, 520_000_100, 519_999_000]; // × granularity 100 nanodegrees
const lons = [-15_000_000, -15_000_500, -14_999_000];
const dense = [
  ...packed(1, deltas(ids), (v) => varint(zz(v))),
  ...bytesField(5, [...packed(1, [3, 1, 7], varint), ...packed(2, deltas([1_700_000_000, 1_700_000_100, 1_700_000_200]), (v) => varint(zz(v)))]),
  ...packed(8, deltas(lats), (v) => varint(zz(v))),
  ...packed(9, deltas(lons), (v) => varint(zz(v))),
  // node 1: highway=speed_camera, maxspeed=30 mph; node 2: none; node 3: maxheight=4.4
  ...packed(10, [s("highway"), s("speed_camera"), s("maxspeed"), s("30 mph"), 0, 0, s("maxheight"), s("4.4"), 0], varint),
];
const way = [...int(1, 500), ...packed(2, [s("maxheight")], varint), ...packed(3, [s("4.4")], varint), ...bytesField(4, int(1, 2)), ...packed(8, deltas(ids), (v) => varint(zz(v)))];
const relation = [
  ...int(1, 77),
  ...packed(2, [s("type")], varint),
  ...packed(3, [s("enforcement")], varint),
  ...packed(8, [s("device"), s("from")], varint),
  ...packed(9, deltas([ids[0]!, 500]), (v) => varint(zz(v))),
  ...packed(10, [0, 1], varint),
];
const dataBlock = [
  ...bytesField(1, strings.flatMap((x) => bytesField(1, [...Buffer.from(x, "utf8")]))),
  ...bytesField(2, bytesField(2, dense)),
  ...bytesField(2, bytesField(3, way)),
  ...bytesField(2, bytesField(4, relation)),
  ...int(17, 100),
  ...int(18, 1000),
];

const dir = mkdtempSync(join(tmpdir(), "pbf-"));
const file = join(dir, "test.osm.pbf");
writeFileSync(file, Buffer.concat([blob("OSMHeader", headerBlock), blob("OSMData", dataBlock)]));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("OSM PBF reader (synthetic file)", () => {
  const nodes: PbfNode[] = [];
  const ways: PbfWay[] = [];
  const relations: PbfRelation[] = [];
  const header = readPbf(file, { node: (n) => nodes.push(n), way: (w) => ways.push(w), relation: (r) => relations.push(r) });

  it("reads the header, skipping unknown fields, with the replication timestamp as the data's date", () => {
    expect(header).toEqual({
      requiredFeatures: ["OsmSchema-V0.6", "DenseNodes"],
      optionalFeatures: ["Sort.Type_then_ID"],
      writingProgram: "test-writer",
      replicationTimestamp: new Date(1_760_214_066_000).toISOString(),
      replicationSequence: 4930,
    });
  });

  it("decodes dense nodes: delta ids above 2^32, coordinates, versions, timestamps and per-node tags", () => {
    expect(nodes.map((n) => n.id)).toEqual(ids);
    expect(nodes[0]).toEqual({ type: "node", id: ids[0], version: 3, timestamp: new Date(1_700_000_000_000).toISOString(), lat: 52, lon: -1.5, tags: { highway: "speed_camera", maxspeed: "30 mph" } });
    expect(nodes[1]!.tags).toEqual({});
    expect(nodes[1]!.lat).toBe(52.00001);
    expect(nodes[2]!.tags).toEqual({ maxheight: "4.4" });
    expect(nodes[2]!.lon).toBe(-1.4999);
  });

  it("decodes ways with delta-coded node refs, and relations with member types and roles", () => {
    expect(ways).toEqual([{ type: "way", id: 500, version: 2, timestamp: null, tags: { maxheight: "4.4" }, refs: ids }]);
    expect(relations).toEqual([
      {
        type: "relation",
        id: 77,
        version: 0,
        timestamp: null,
        tags: { type: "enforcement" },
        members: [
          { type: "node", ref: ids[0], role: "device" },
          { type: "way", ref: 500, role: "from" },
        ],
      },
    ]);
  });

  it("only decodes the element types a pass asks for", () => {
    let seen = 0;
    readPbf(file, { relation: () => seen++ });
    expect(seen).toBe(1);
  });

  it("refuses a file needing a feature it can't read, rather than skipping data silently", () => {
    const bad = join(dir, "bad.osm.pbf");
    writeFileSync(bad, Buffer.concat([blob("OSMHeader", [...str(4, "OsmSchema-V0.6"), ...str(4, "HistoricalInformation")]), blob("OSMData", dataBlock)]));
    expect(() => readPbf(bad, {})).toThrow(/HistoricalInformation/);
  });
});

describe("protobuf primitives", () => {
  it("zigzag and varints beyond 32 bits", () => {
    expect([0, 1, 2, 3, 4].map(zigzagDecode)).toEqual([0, -1, 1, -2, 2]);
    expect(new ProtoReader(new Uint8Array(varint(10_000_000_001))).varint()).toBe(10_000_000_001);
  });

  it("skips a length-delimited field including its length prefix", () => {
    const r = new ProtoReader(new Uint8Array([...bytesField(7, [9, 9, 9]), ...int(1, 42)]));
    const [, wire] = r.key();
    r.skip(wire);
    expect(r.key()).toEqual([1, 0]);
    expect(r.varint()).toBe(42);
  });
});
