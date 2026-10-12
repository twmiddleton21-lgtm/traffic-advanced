/**
 * A minimal reader for OpenStreetMap PBF files (the format Geofabrik's extracts use), written to the published specification
 * (wiki.openstreetmap.org/wiki/PBF_Format) with Node's own zlib, so the build needs no new dependency.
 *
 * It reads plain nodes, dense nodes, ways and relations with their tags, version and timestamp. User names, user ids and changesets
 * are never read (Geofabrik's public extracts omit them anyway). Blobs must be raw or zlib-compressed, the two the specification
 * requires readers to support; any other compression, or a required feature this reader doesn't know, is an error rather than a
 * silent skip.
 *
 * Numbers: OSM ids and coordinates fit in a JavaScript number (below 2^53), so varints are decoded with arithmetic, not 32-bit
 * bitwise operations.
 */
import { closeSync, openSync, readSync } from "node:fs";
import { inflateSync } from "node:zlib";

export interface PbfHeader {
  requiredFeatures: string[];
  optionalFeatures: string[];
  writingProgram: string | null;
  /** The moment the extract's data runs to (osmosis_replication_timestamp), as an ISO date-time; null when absent. */
  replicationTimestamp: string | null;
  replicationSequence: number | null;
}
export type Tags = Record<string, string>;
export interface PbfNode {
  type: "node";
  id: number;
  version: number;
  timestamp: string | null;
  lat: number;
  lon: number;
  tags: Tags;
}
export interface PbfWay {
  type: "way";
  id: number;
  version: number;
  timestamp: string | null;
  tags: Tags;
  refs: number[];
}
export interface PbfMember {
  type: "node" | "way" | "relation";
  ref: number;
  role: string;
}
export interface PbfRelation {
  type: "relation";
  id: number;
  version: number;
  timestamp: string | null;
  tags: Tags;
  members: PbfMember[];
}

/** Which element types a pass wants. Groups of other types are skipped without being decoded. */
export interface PassHandlers {
  node?: (n: PbfNode) => void;
  way?: (w: PbfWay) => void;
  relation?: (r: PbfRelation) => void;
}

const SUPPORTED_REQUIRED = new Set(["OsmSchema-V0.6", "DenseNodes"]);

// ---------------------------------------------------------------------------------------------------------------------------------
// Protocol buffer primitives.

export class ProtoReader {
  readonly buf: Uint8Array;
  readonly end: number;
  pos: number;
  // Plain fields, not parameter properties: Node runs these scripts by stripping types only.
  constructor(buf: Uint8Array, start = 0, end = buf.length) {
    this.buf = buf;
    this.end = end;
    this.pos = start;
  }
  get done() {
    return this.pos >= this.end;
  }
  varint(): number {
    let result = 0;
    let mul = 1;
    for (let i = 0; i < 10; i++) {
      const b = this.buf[this.pos++]!;
      result += (b & 0x7f) * mul;
      if (b < 0x80) return result;
      mul *= 128;
    }
    throw new Error("varint too long");
  }
  /** A varint that encodes a signed 64-bit integer in two's complement (int32/int64 fields). */
  signedVarint(): number {
    const v = this.varint();
    return v >= 2 ** 63 ? v - 2 ** 64 : v;
  }
  zigzag(): number {
    return zigzagDecode(this.varint());
  }
  bytes(): Uint8Array {
    const len = this.varint();
    const out = this.buf.subarray(this.pos, this.pos + len);
    this.pos += len;
    return out;
  }
  string(): string {
    return DECODER.decode(this.bytes());
  }
  /** Key of the next field: [field number, wire type]. */
  key(): [number, number] {
    const k = this.varint();
    return [Math.floor(k / 8), k % 8];
  }
  skip(wire: number): void {
    if (wire === 0) this.varint();
    else if (wire === 1) this.pos += 8;
    else if (wire === 2) {
      // Read the length first: `this.pos += this.varint()` would add it to the position from before the length was read.
      const len = this.varint();
      this.pos += len;
    }
    else if (wire === 5) this.pos += 4;
    else throw new Error(`unsupported wire type ${wire}`);
  }
  /** A packed repeated field's values, read with `read` until the field ends. */
  packed(read: (r: ProtoReader) => number): number[] {
    const len = this.varint();
    const sub = new ProtoReader(this.buf, this.pos, this.pos + len);
    this.pos += len;
    const out: number[] = [];
    while (!sub.done) out.push(read(sub));
    return out;
  }
}

const DECODER = new TextDecoder("utf-8", { fatal: true });
export const zigzagDecode = (v: number): number => (v % 2 === 0 ? v / 2 : -(v + 1) / 2);
const uvarint = (r: ProtoReader) => r.varint();
const svarint = (r: ProtoReader) => r.zigzag();
const ivarint = (r: ProtoReader) => r.signedVarint();

// ---------------------------------------------------------------------------------------------------------------------------------
// File framing: [4-byte length][BlobHeader][Blob] repeated.

function* blobs(path: string): Generator<{ type: string; data: Uint8Array }> {
  const fd = openSync(path, "r");
  try {
    let offset = 0;
    const lenBuf = Buffer.alloc(4);
    for (;;) {
      if (readSync(fd, lenBuf, 0, 4, offset) < 4) return;
      const headerLen = lenBuf.readUInt32BE(0);
      const header = Buffer.alloc(headerLen);
      readSync(fd, header, 0, headerLen, offset + 4);
      let type = "";
      let dataSize = 0;
      const h = new ProtoReader(header);
      while (!h.done) {
        const [field, wire] = h.key();
        if (field === 1) type = h.string();
        else if (field === 3) dataSize = h.varint();
        else h.skip(wire);
      }
      const blob = Buffer.alloc(dataSize);
      readSync(fd, blob, 0, dataSize, offset + 4 + headerLen);
      offset += 4 + headerLen + dataSize;
      yield { type, data: decodeBlob(blob) };
    }
  } finally {
    closeSync(fd);
  }
}

export function decodeBlob(blob: Uint8Array): Uint8Array {
  const r = new ProtoReader(blob);
  let raw: Uint8Array | null = null;
  let zlib: Uint8Array | null = null;
  let other: number | null = null;
  while (!r.done) {
    const [field, wire] = r.key();
    if (field === 1) raw = r.bytes();
    else if (field === 3) zlib = r.bytes();
    else if (field >= 4 && field <= 7) {
      other = field;
      r.skip(wire);
    } else r.skip(wire);
  }
  if (raw) return raw;
  if (zlib) return inflateSync(zlib);
  throw new Error(other === null ? "empty blob" : `unsupported blob compression (field ${other})`);
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Blocks.

export function readHeaderBlock(data: Uint8Array): PbfHeader {
  const r = new ProtoReader(data);
  const out: PbfHeader = { requiredFeatures: [], optionalFeatures: [], writingProgram: null, replicationTimestamp: null, replicationSequence: null };
  while (!r.done) {
    const [field, wire] = r.key();
    if (field === 4) out.requiredFeatures.push(r.string());
    else if (field === 5) out.optionalFeatures.push(r.string());
    else if (field === 16) out.writingProgram = r.string();
    else if (field === 32) out.replicationTimestamp = new Date(r.signedVarint() * 1000).toISOString();
    else if (field === 33) out.replicationSequence = r.signedVarint();
    else r.skip(wire);
  }
  const unknown = out.requiredFeatures.filter((f) => !SUPPORTED_REQUIRED.has(f));
  if (unknown.length > 0) throw new Error(`PBF requires features this reader doesn't support: ${unknown.join(", ")}`);
  return out;
}

interface BlockContext {
  strings: string[];
  granularity: number;
  latOffset: number;
  lonOffset: number;
  dateGranularity: number;
}

const coord = (offset: number, granularity: number, value: number) => Math.round((offset + granularity * value) / 100) / 1e7;
const time = (ctx: BlockContext, value: number | null) => (value === null || value === 0 ? null : new Date(value * ctx.dateGranularity).toISOString());

/** Reads one data block, calling the handlers for the element types they ask for. */
export function readPrimitiveBlock(data: Uint8Array, handlers: PassHandlers): void {
  const r = new ProtoReader(data);
  const ctx: BlockContext = { strings: [], granularity: 100, latOffset: 0, lonOffset: 0, dateGranularity: 1000 };
  const groups: [number, number][] = [];
  while (!r.done) {
    const [field, wire] = r.key();
    if (field === 1) {
      const st = new ProtoReader(r.bytes());
      while (!st.done) {
        const [f, w] = st.key();
        if (f === 1) ctx.strings.push(DECODER.decode(st.bytes()));
        else st.skip(w);
      }
    } else if (field === 2) {
      const len = r.varint();
      groups.push([r.pos, r.pos + len]);
      r.pos += len;
    } else if (field === 17) ctx.granularity = r.signedVarint();
    else if (field === 18) ctx.dateGranularity = r.signedVarint();
    else if (field === 19) ctx.latOffset = r.signedVarint();
    else if (field === 20) ctx.lonOffset = r.signedVarint();
    else r.skip(wire);
  }
  for (const [start, end] of groups) readGroup(new ProtoReader(data, start, end), ctx, handlers);
}

function readGroup(g: ProtoReader, ctx: BlockContext, h: PassHandlers): void {
  while (!g.done) {
    const [field, wire] = g.key();
    if (field === 1 && h.node) h.node(readNode(new ProtoReader(g.bytes()), ctx));
    else if (field === 2 && h.node) readDense(new ProtoReader(g.bytes()), ctx, h.node);
    else if (field === 3 && h.way) h.way(readWay(new ProtoReader(g.bytes()), ctx));
    else if (field === 4 && h.relation) h.relation(readRelation(new ProtoReader(g.bytes()), ctx));
    else g.skip(wire);
  }
}

function tagsOf(ctx: BlockContext, keys: number[], vals: number[]): Tags {
  const tags: Tags = {};
  for (let i = 0; i < keys.length; i++) tags[ctx.strings[keys[i]!]!] = ctx.strings[vals[i]!]!;
  return tags;
}

function readInfo(r: ProtoReader): { version: number; timestamp: number | null } {
  let version = 0;
  let timestamp: number | null = null;
  while (!r.done) {
    const [field, wire] = r.key();
    if (field === 1) version = r.signedVarint();
    else if (field === 2) timestamp = r.signedVarint();
    else r.skip(wire);
  }
  return { version, timestamp };
}

function readNode(r: ProtoReader, ctx: BlockContext): PbfNode {
  let id = 0;
  let keys: number[] = [];
  let vals: number[] = [];
  let info = { version: 0, timestamp: null as number | null };
  let lat = 0;
  let lon = 0;
  while (!r.done) {
    const [field, wire] = r.key();
    if (field === 1) id = r.zigzag();
    else if (field === 2) keys = r.packed(uvarint);
    else if (field === 3) vals = r.packed(uvarint);
    else if (field === 4) info = readInfo(new ProtoReader(r.bytes()));
    else if (field === 8) lat = r.zigzag();
    else if (field === 9) lon = r.zigzag();
    else r.skip(wire);
  }
  return { type: "node", id, version: info.version, timestamp: time(ctx, info.timestamp), lat: coord(ctx.latOffset, ctx.granularity, lat), lon: coord(ctx.lonOffset, ctx.granularity, lon), tags: tagsOf(ctx, keys, vals) };
}

function readDense(r: ProtoReader, ctx: BlockContext, emit: (n: PbfNode) => void): void {
  let ids: number[] = [];
  let lats: number[] = [];
  let lons: number[] = [];
  let keysVals: number[] = [];
  let versions: number[] = [];
  let timestamps: number[] = [];
  while (!r.done) {
    const [field, wire] = r.key();
    if (field === 1) ids = r.packed(svarint);
    else if (field === 5) {
      const info = new ProtoReader(r.bytes());
      while (!info.done) {
        const [f, w] = info.key();
        if (f === 1) versions = info.packed(ivarint);
        else if (f === 2) timestamps = info.packed(svarint);
        else info.skip(w);
      }
    } else if (field === 8) lats = r.packed(svarint);
    else if (field === 9) lons = r.packed(svarint);
    else if (field === 10) keysVals = r.packed(ivarint);
    else r.skip(wire);
  }
  if (lats.length !== ids.length || lons.length !== ids.length) throw new Error("dense nodes: ids and coordinates differ in length");
  let id = 0;
  let lat = 0;
  let lon = 0;
  let ts = 0;
  let kv = 0;
  for (let i = 0; i < ids.length; i++) {
    id += ids[i]!;
    lat += lats[i]!;
    lon += lons[i]!;
    if (timestamps.length > 0) ts += timestamps[i]!;
    const tags: Tags = {};
    // keys_vals: key, value, key, value, …, 0 for each node (absent entirely when no node in the block has tags).
    while (kv < keysVals.length && keysVals[kv] !== 0) {
      tags[ctx.strings[keysVals[kv]!]!] = ctx.strings[keysVals[kv + 1]!]!;
      kv += 2;
    }
    kv++;
    emit({ type: "node", id, version: versions[i] ?? 0, timestamp: time(ctx, timestamps.length > 0 ? ts : null), lat: coord(ctx.latOffset, ctx.granularity, lat), lon: coord(ctx.lonOffset, ctx.granularity, lon), tags });
  }
}

function readWay(r: ProtoReader, ctx: BlockContext): PbfWay {
  let id = 0;
  let keys: number[] = [];
  let vals: number[] = [];
  let info = { version: 0, timestamp: null as number | null };
  let deltas: number[] = [];
  while (!r.done) {
    const [field, wire] = r.key();
    if (field === 1) id = r.signedVarint();
    else if (field === 2) keys = r.packed(uvarint);
    else if (field === 3) vals = r.packed(uvarint);
    else if (field === 4) info = readInfo(new ProtoReader(r.bytes()));
    else if (field === 8) deltas = r.packed(svarint);
    else r.skip(wire);
  }
  const refs: number[] = [];
  let ref = 0;
  for (const d of deltas) refs.push((ref += d));
  return { type: "way", id, version: info.version, timestamp: time(ctx, info.timestamp), tags: tagsOf(ctx, keys, vals), refs };
}

const MEMBER_TYPES = ["node", "way", "relation"] as const;

function readRelation(r: ProtoReader, ctx: BlockContext): PbfRelation {
  let id = 0;
  let keys: number[] = [];
  let vals: number[] = [];
  let info = { version: 0, timestamp: null as number | null };
  let roles: number[] = [];
  let memids: number[] = [];
  let types: number[] = [];
  while (!r.done) {
    const [field, wire] = r.key();
    if (field === 1) id = r.signedVarint();
    else if (field === 2) keys = r.packed(uvarint);
    else if (field === 3) vals = r.packed(uvarint);
    else if (field === 4) info = readInfo(new ProtoReader(r.bytes()));
    else if (field === 8) roles = r.packed(ivarint);
    else if (field === 9) memids = r.packed(svarint);
    else if (field === 10) types = r.packed(uvarint);
    else r.skip(wire);
  }
  const members: PbfMember[] = [];
  let ref = 0;
  for (let i = 0; i < memids.length; i++) {
    ref += memids[i]!;
    const type = MEMBER_TYPES[types[i]!];
    if (!type) throw new Error(`relation ${id}: unknown member type ${types[i]}`);
    members.push({ type, ref, role: ctx.strings[roles[i]!] ?? "" });
  }
  return { type: "relation", id, version: info.version, timestamp: time(ctx, info.timestamp), tags: tagsOf(ctx, keys, vals), members };
}

/** One pass over a PBF file: returns its header and calls the handlers for every element of the types they ask for. */
export function readPbf(path: string, handlers: PassHandlers): PbfHeader {
  let header: PbfHeader | null = null;
  for (const { type, data } of blobs(path)) {
    if (type === "OSMHeader") header = readHeaderBlock(data);
    else if (type === "OSMData") {
      if (!header) throw new Error("data block before the header block");
      readPrimitiveBlock(data, handlers);
    }
  }
  if (!header) throw new Error("no header block");
  return header;
}
