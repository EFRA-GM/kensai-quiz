/**
 * A tiny, dependency-free ZIP writer.
 *
 * It emits a valid ZIP archive using only the **STORE** method (no compression),
 * which keeps the code short and needs nothing beyond `Uint8Array`, `DataView`
 * and `TextEncoder` — all built into the browser. That is plenty for bundling a
 * handful of small text quizzes so a learner can download a whole folder at once.
 *
 * The format is the classic PKZIP layout: for each entry a *local file header*
 * followed by its raw bytes, then a *central directory* listing every entry, and
 * finally the *end-of-central-directory* record.
 */

/** One file to place in the archive. `name` is the path inside the zip. */
export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/* -------------------------------------------------------------------- CRC-32 */

/** Precomputed CRC-32 lookup table (IEEE polynomial, reflected 0xEDB88320). */
const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 checksum of `bytes` as an unsigned 32-bit integer. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/* ---------------------------------------------------------------- ZIP writer */

// Fixed MS-DOS timestamp (1980-01-01 00:00:00) so the output is deterministic
// and we never need the (banned-in-some-contexts) `Date`.
const DOS_DATE = 0x0021; // year 1980, month 1, day 1
const DOS_TIME = 0x0000;

const LOCAL_HEADER_SIG = 0x04034b50;
const CENTRAL_HEADER_SIG = 0x02014b50;
const END_OF_CENTRAL_SIG = 0x06054b50;

/** Build a complete ZIP archive (STORE method) from `entries`. */
export function zipSync(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();

  const prepared = entries.map((entry) => {
    const nameBytes = encoder.encode(entry.name);
    return {
      nameBytes,
      data: entry.data,
      crc: crc32(entry.data),
      size: entry.data.length,
    };
  });

  const LOCAL_HEADER_SIZE = 30;
  const CENTRAL_HEADER_SIZE = 46;
  const END_SIZE = 22;

  let localSize = 0;
  let centralSize = 0;
  for (const p of prepared) {
    localSize += LOCAL_HEADER_SIZE + p.nameBytes.length + p.size;
    centralSize += CENTRAL_HEADER_SIZE + p.nameBytes.length;
  }

  const total = localSize + centralSize + END_SIZE;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  let offset = 0;

  // Local file headers + file data, remembering each entry's start offset.
  const localOffsets: number[] = [];
  for (const p of prepared) {
    localOffsets.push(offset);
    view.setUint32(offset, LOCAL_HEADER_SIG, true);
    view.setUint16(offset + 4, 20, true); // version needed to extract (2.0)
    view.setUint16(offset + 6, 0, true); // general purpose flags
    view.setUint16(offset + 8, 0, true); // compression method: 0 = store
    view.setUint16(offset + 10, DOS_TIME, true);
    view.setUint16(offset + 12, DOS_DATE, true);
    view.setUint32(offset + 14, p.crc, true);
    view.setUint32(offset + 18, p.size, true); // compressed size
    view.setUint32(offset + 22, p.size, true); // uncompressed size
    view.setUint16(offset + 26, p.nameBytes.length, true);
    view.setUint16(offset + 28, 0, true); // extra field length
    offset += LOCAL_HEADER_SIZE;
    out.set(p.nameBytes, offset);
    offset += p.nameBytes.length;
    out.set(p.data, offset);
    offset += p.size;
  }

  // Central directory.
  const centralStart = offset;
  for (let i = 0; i < prepared.length; i++) {
    const p = prepared[i]!;
    view.setUint32(offset, CENTRAL_HEADER_SIG, true);
    view.setUint16(offset + 4, 20, true); // version made by
    view.setUint16(offset + 6, 20, true); // version needed to extract
    view.setUint16(offset + 8, 0, true); // general purpose flags
    view.setUint16(offset + 10, 0, true); // compression method: 0 = store
    view.setUint16(offset + 12, DOS_TIME, true);
    view.setUint16(offset + 14, DOS_DATE, true);
    view.setUint32(offset + 16, p.crc, true);
    view.setUint32(offset + 20, p.size, true); // compressed size
    view.setUint32(offset + 24, p.size, true); // uncompressed size
    view.setUint16(offset + 28, p.nameBytes.length, true);
    view.setUint16(offset + 30, 0, true); // extra field length
    view.setUint16(offset + 32, 0, true); // file comment length
    view.setUint16(offset + 34, 0, true); // disk number start
    view.setUint16(offset + 36, 0, true); // internal file attributes
    view.setUint32(offset + 38, 0, true); // external file attributes
    view.setUint32(offset + 42, localOffsets[i]!, true); // local header offset
    offset += CENTRAL_HEADER_SIZE;
    out.set(p.nameBytes, offset);
    offset += p.nameBytes.length;
  }

  // End of central directory record.
  view.setUint32(offset, END_OF_CENTRAL_SIG, true);
  view.setUint16(offset + 4, 0, true); // this disk number
  view.setUint16(offset + 6, 0, true); // disk with central directory
  view.setUint16(offset + 8, prepared.length, true); // entries on this disk
  view.setUint16(offset + 10, prepared.length, true); // total entries
  view.setUint32(offset + 12, centralSize, true); // central directory size
  view.setUint32(offset + 16, centralStart, true); // central directory offset
  view.setUint16(offset + 20, 0, true); // comment length

  return out;
}
