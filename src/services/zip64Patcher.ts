// ZIP64 local/central-directory header patcher.
//
// Monday.com XLSX exports use ZIP64 even for small files: the standard header
// fields for compressed/uncompressed size are set to the 0xFFFFFFFF sentinel
// and the real 64-bit values live in a ZIP64 extra field (tag 0x0001).
//
// The xlsx library (0.18.5) doesn't understand ZIP64 and tries to allocate
// ~4GB buffers ("Array buffer allocation failed") when it reads the sentinel.
// This module copies the real sizes from the ZIP64 extra field back into the
// standard header fields so any legacy ZIP reader can parse the file — no
// re-compression, no dependency on a full ZIP64 implementation.

const ZIP64_EXTRA_TAG = 0x0001;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50; // "PK\x03\x04"
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50; // "PK\x01\x02"
const ZIP64_SENTINEL_32 = 0xffffffff;

/**
 * Patch ZIP64 local file headers and central directory entries in-place on a
 * copy of the buffer. Safe no-op on standard (non-ZIP64) archives.
 */
export function patchZip64Headers(data: Uint8Array): Uint8Array {
  if (data.length < 30) return data;

  // Quick bail-out: if the very first entry isn't ZIP64, assume the archive
  // is a normal ZIP and skip the whole pass.
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (view.getUint32(18, true) !== ZIP64_SENTINEL_32) return data;

  const patched = new Uint8Array(data);
  const dv = new DataView(patched.buffer, patched.byteOffset, patched.byteLength);

  const localEndOffset = patchLocalHeaders(dv, patched.length);
  patchCentralDirectory(dv, patched.length, localEndOffset);

  return patched;
}

/**
 * Walk the local-file-header section. Returns the offset immediately after
 * the last local header so the central-directory pass knows where to pick up.
 */
function patchLocalHeaders(dv: DataView, total: number): number {
  let offset = 0;
  while (offset + 30 <= total) {
    if (dv.getUint32(offset, true) !== LOCAL_FILE_HEADER_SIGNATURE) break;

    const compSize = dv.getUint32(offset + 18, true);
    const uncompSize = dv.getUint32(offset + 22, true);
    const nameLen = dv.getUint16(offset + 26, true);
    const extraLen = dv.getUint16(offset + 28, true);
    const extraStart = offset + 30 + nameLen;

    if (compSize === ZIP64_SENTINEL_32 || uncompSize === ZIP64_SENTINEL_32) {
      copySizesFromZip64Extra(
        dv,
        offset + 18,
        offset + 22,
        extraStart,
        extraLen,
      );
    }

    const actualComp = dv.getUint32(offset + 18, true);
    const nextOffset = extraStart + extraLen + actualComp;
    // Bounds safety: if something looks wrong, stop rather than loop forever.
    if (nextOffset <= offset || nextOffset > total) break;
    offset = nextOffset;
  }
  return offset;
}

function patchCentralDirectory(dv: DataView, total: number, startOffset: number): void {
  let offset = startOffset;
  while (offset + 46 <= total) {
    if (dv.getUint32(offset, true) !== CENTRAL_DIRECTORY_SIGNATURE) break;

    const compSize = dv.getUint32(offset + 20, true);
    const uncompSize = dv.getUint32(offset + 24, true);
    const nameLen = dv.getUint16(offset + 28, true);
    const extraLen = dv.getUint16(offset + 30, true);
    const commentLen = dv.getUint16(offset + 32, true);
    const extraStart = offset + 46 + nameLen;

    if (compSize === ZIP64_SENTINEL_32 || uncompSize === ZIP64_SENTINEL_32) {
      copySizesFromZip64Extra(
        dv,
        offset + 20,
        offset + 24,
        extraStart,
        extraLen,
      );
    }

    // Patch the local-header offset too if it's sentinel'd.
    const localHeaderOffset = dv.getUint32(offset + 42, true);
    if (localHeaderOffset === ZIP64_SENTINEL_32) {
      copyOffsetFromZip64Extra(dv, offset + 42, extraStart, extraLen);
    }

    offset += 46 + nameLen + extraLen + commentLen;
  }
}

/**
 * Read real 64-bit uncompressed + compressed sizes from the ZIP64 extra
 * field and write their low-32-bits back into the standard header slots.
 * (We only care about the low 32 bits because the whole reason to patch is
 * that the consumer library can't handle > 4GB files anyway.)
 */
function copySizesFromZip64Extra(
  dv: DataView,
  compSizeOffset: number,
  uncompSizeOffset: number,
  extraStart: number,
  extraLen: number,
): void {
  let eOff = extraStart;
  const eEnd = extraStart + extraLen;
  while (eOff + 4 <= eEnd) {
    const tag = dv.getUint16(eOff, true);
    const size = dv.getUint16(eOff + 2, true);
    if (tag === ZIP64_EXTRA_TAG && size >= 16) {
      const realUncomp = dv.getUint32(eOff + 4, true);
      const realComp = dv.getUint32(eOff + 12, true);
      dv.setUint32(compSizeOffset, realComp, true);
      dv.setUint32(uncompSizeOffset, realUncomp, true);
      return;
    }
    eOff += 4 + size;
  }
}

function copyOffsetFromZip64Extra(
  dv: DataView,
  offsetSlot: number,
  extraStart: number,
  extraLen: number,
): void {
  let eOff = extraStart;
  const eEnd = extraStart + extraLen;
  while (eOff + 4 <= eEnd) {
    const tag = dv.getUint16(eOff, true);
    const size = dv.getUint16(eOff + 2, true);
    // ZIP64 extra field layout: uncomp(8) | comp(8) | localHeaderOffset(8) ...
    if (tag === ZIP64_EXTRA_TAG && size >= 24) {
      const realOffset = dv.getUint32(eOff + 20, true);
      dv.setUint32(offsetSlot, realOffset, true);
      return;
    }
    eOff += 4 + size;
  }
}
