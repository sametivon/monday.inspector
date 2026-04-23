import { describe, expect, it } from "vitest";
import { patchZip64Headers } from "./zip64Patcher";

describe("patchZip64Headers", () => {
  it("returns the buffer unchanged for too-short input", () => {
    const tiny = new Uint8Array(10);
    const out = patchZip64Headers(tiny);
    // Identical contents expected (not necessarily same reference).
    expect(Array.from(out)).toEqual(Array.from(tiny));
  });

  it("returns unchanged buffer for a standard (non-ZIP64) ZIP header", () => {
    // Craft a 30-byte local file header with real sizes (not 0xFFFFFFFF).
    const data = new Uint8Array(30);
    const dv = new DataView(data.buffer);
    dv.setUint32(0, 0x04034b50, true); // PK\x03\x04
    dv.setUint32(18, 0x00000064, true); // compressedSize = 100
    dv.setUint32(22, 0x000000c8, true); // uncompressedSize = 200

    const out = patchZip64Headers(data);
    // Standard ZIP: function should bail immediately and return the original.
    expect(out).toBe(data);
  });

  it("patches ZIP64 sentinel sizes in a local file header", () => {
    // Build a minimal ZIP64 local file header with a single ZIP64 extra field.
    //
    // Layout (little-endian):
    //  0   PK\x03\x04 signature
    //  18  compressed size   = 0xFFFFFFFF (sentinel)
    //  22  uncompressed size = 0xFFFFFFFF (sentinel)
    //  26  name length = 0
    //  28  extra length = 20 (4-byte header + 16-byte ZIP64 payload)
    //  30  (extra field starts here, since name length is 0)
    //  30  tag = 0x0001, size = 16
    //  34  real uncompressed size (8 bytes, only low 32 bits used)
    //  42  real compressed size   (8 bytes, only low 32 bits used)
    //
    // After extra: we need compressedSize bytes of file data, then central
    // dir starts. We'll just stop reading by placing no central-dir sig.

    const FILE_DATA_LEN = 0; // pretend the actual file payload is 0 bytes
    const totalLen = 30 + 20 + FILE_DATA_LEN;
    const data = new Uint8Array(totalLen);
    const dv = new DataView(data.buffer);

    dv.setUint32(0, 0x04034b50, true);        // local file header signature
    dv.setUint32(18, 0xffffffff, true);       // compressed size sentinel
    dv.setUint32(22, 0xffffffff, true);       // uncompressed size sentinel
    dv.setUint16(26, 0, true);                // name length
    dv.setUint16(28, 20, true);               // extra length

    // ZIP64 extra field
    dv.setUint16(30, 0x0001, true);           // tag
    dv.setUint16(32, 16, true);               // payload size (uncomp8 + comp8)
    dv.setUint32(34, 0xabcd, true);           // real uncompressed (low 32 bits)
    dv.setUint32(38, 0, true);                // uncompressed (high 32 bits)
    dv.setUint32(42, 0x1234, true);           // real compressed (low 32 bits)
    dv.setUint32(46, 0, true);                // compressed (high 32 bits)

    const out = patchZip64Headers(data);
    const outDv = new DataView(out.buffer, out.byteOffset, out.byteLength);

    // The sentinel slots should now hold the real sizes from the extra field.
    expect(outDv.getUint32(18, true)).toBe(0x1234);
    expect(outDv.getUint32(22, true)).toBe(0xabcd);

    // Original buffer should be untouched (function copies before mutating).
    expect(new DataView(data.buffer).getUint32(18, true)).toBe(0xffffffff);
    expect(new DataView(data.buffer).getUint32(22, true)).toBe(0xffffffff);
  });

  it("does not loop forever on a malformed local header chain", () => {
    // Build a valid ZIP64 header whose declared compressed size is huge,
    // so the computed next-offset lies beyond the buffer. The patcher should
    // detect this and stop instead of going into an infinite loop.
    const totalLen = 30 + 20;
    const data = new Uint8Array(totalLen);
    const dv = new DataView(data.buffer);

    dv.setUint32(0, 0x04034b50, true);
    dv.setUint32(18, 0xffffffff, true);
    dv.setUint32(22, 0xffffffff, true);
    dv.setUint16(26, 0, true);
    dv.setUint16(28, 20, true);

    dv.setUint16(30, 0x0001, true);
    dv.setUint16(32, 16, true);
    // Huge "real" sizes would push nextOffset way past the buffer.
    dv.setUint32(34, 0x7fffffff, true);
    dv.setUint32(38, 0, true);
    dv.setUint32(42, 0x7fffffff, true);
    dv.setUint32(46, 0, true);

    // Call must return without throwing or hanging.
    const out = patchZip64Headers(data);
    expect(out.length).toBe(totalLen);
  });
});
