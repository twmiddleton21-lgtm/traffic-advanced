import { inflateRawSync } from "node:zlib";

/**
 * A minimal reader for the first worksheet of an .xlsx file (TfL publishes its height restrictions only as .xlsx), so the
 * restrictions build needs no spreadsheet dependency. It reads the ZIP central directory, inflates the two XML parts it needs
 * (shared strings and sheet 1) and returns rows of cell text keyed by column letter. Formulas, styles and dates aren't
 * interpreted: cells come back as the text or number Excel stored. Throws on anything it doesn't understand.
 */
export type Row = Record<string, string>;

function unzip(buffer: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  // End of central directory record: signature 0x06054b50, within the last 64 KiB + 22 bytes.
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65_557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a ZIP file (no end of central directory)");
  const count = buffer.readUInt16LE(eocd + 10);
  let p = buffer.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buffer.readUInt32LE(p) !== 0x02014b50) throw new Error("Damaged ZIP central directory");
    const method = buffer.readUInt16LE(p + 10);
    const compressedSize = buffer.readUInt32LE(p + 20);
    const nameLength = buffer.readUInt16LE(p + 28);
    const extraLength = buffer.readUInt16LE(p + 30);
    const commentLength = buffer.readUInt16LE(p + 32);
    const localOffset = buffer.readUInt32LE(p + 42);
    const name = buffer.toString("utf8", p + 46, p + 46 + nameLength);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const data = buffer.subarray(start, start + compressedSize);
    if (method === 0) files.set(name, Buffer.from(data));
    else if (method === 8) files.set(name, inflateRawSync(data));
    else throw new Error(`Unsupported ZIP compression method ${method} for ${name}`);
    p += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

const decode = (s: string) =>
  s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, e: string) => {
    const named: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
    if (named[e]) return named[e];
    return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  });

/** The text of every <t> in an element (rich text runs are joined). */
const textOf = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1]!)).join("");

export function readFirstSheet(buffer: Buffer): Row[] {
  const files = unzip(buffer);
  const sharedXml = files.get("xl/sharedStrings.xml")?.toString("utf8") ?? "";
  const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]!));
  const sheet = files.get("xl/worksheets/sheet1.xml")?.toString("utf8");
  if (!sheet) throw new Error("No first worksheet (xl/worksheets/sheet1.xml)");
  const rows: Row[] = [];
  for (const row of sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: Row = {};
    for (const cell of row[1]!.matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cell[1]!;
      const ref = /r="([A-Z]+)\d+"/.exec(attrs)?.[1];
      if (!ref) throw new Error("Cell without a reference");
      const type = /t="(\w+)"/.exec(attrs)?.[1];
      const body = cell[2] ?? "";
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      if (type === "s") cells[ref] = shared[Number(v)] ?? "";
      else if (type === "inlineStr") cells[ref] = textOf(body);
      else if (v !== undefined) cells[ref] = decode(v);
    }
    rows.push(cells);
  }
  return rows;
}
