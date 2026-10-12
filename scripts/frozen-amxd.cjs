"use strict";

const zlib = require("zlib");

const AMPF_HEADER_LENGTH = 32;
const FROZEN_METADATA_HEADER = Buffer.from("mx@c", "ascii");
const FROZEN_METADATA_HEADER_LENGTH = 16;
const PATCH_CHUNK = Buffer.from("ptch", "ascii");
const AUDIO_EFFECT_TYPE = Buffer.from("aaaa", "ascii");
const METADATA_CHUNK = Buffer.from("meta", "ascii");
const ZIP_LOCAL_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const ZIP_CENTRAL_HEADER = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
const ZIP_END_HEADER = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
const MAX_AMXD_BYTES = 32 * 1024 * 1024;
const MAX_JSON_DOCUMENTS = 512;
const MAX_ZIP_ARCHIVES = 16;
const MAX_ZIP_ENTRIES = 512;
const MAX_ZIP_ENTRY_BYTES = 16 * 1024 * 1024;
const MAX_ZIP_TOTAL_BYTES = 32 * 1024 * 1024;

function assertAmpfContainer(buffer, { frozen = false } = {}) {
  if (!Buffer.isBuffer(buffer)) throw new Error("AMXD data must be a Buffer");
  if (buffer.length < AMPF_HEADER_LENGTH) throw new Error("AMXD is truncated");
  if (buffer.length > MAX_AMXD_BYTES) throw new Error("AMXD exceeds the release size limit");
  if (buffer.subarray(0, 4).toString("ascii") !== "ampf") {
    throw new Error("AMXD is not an AMPF container");
  }
  if (!buffer.subarray(24, 28).equals(PATCH_CHUNK)) {
    throw new Error("AMXD does not contain the expected patch chunk");
  }
  if (buffer.readUInt32LE(28) !== buffer.length - AMPF_HEADER_LENGTH) {
    throw new Error("AMXD patch chunk length is invalid");
  }
  if (frozen && !buffer.subarray(AMPF_HEADER_LENGTH, 36).equals(FROZEN_METADATA_HEADER)) {
    throw new Error("AMXD does not contain frozen Max metadata");
  }
  if (
    frozen &&
    (buffer.readUInt32LE(4) !== 4 ||
      !buffer.subarray(8, 12).equals(AUDIO_EFFECT_TYPE) ||
      !buffer.subarray(12, 16).equals(METADATA_CHUNK) ||
      buffer.readUInt32LE(16) !== 4 ||
      buffer.readUInt32LE(20) !== 7)
  ) {
    throw new Error("Frozen AMXD has unexpected Max container metadata");
  }
}

function findJsonDocumentEnd(buffer, start, limit) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < limit; index += 1) {
    const byte = buffer[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (byte === 0x5c) escaped = true;
      else if (byte === 0x22) inString = false;
      continue;
    }
    if (byte === 0x22) {
      inString = true;
      continue;
    }
    if (byte === 0x7b || byte === 0x5b) depth += 1;
    else if (byte === 0x7d || byte === 0x5d) {
      depth -= 1;
      if (depth === 0) return index + 1;
      if (depth < 0) break;
    }
  }
  throw new Error("Frozen AMXD contains malformed JSON metadata");
}

function parseFrozenJsonDocuments(buffer, zipOffset) {
  const documents = [];
  const ranges = [];
  // Skip the whole binary header, not just its four-byte magic. The encoded
  // directory offset can contain 0x7b ("{") and is not JSON metadata.
  let offset = AMPF_HEADER_LENGTH + FROZEN_METADATA_HEADER_LENGTH;

  while (offset < zipOffset) {
    while (offset < zipOffset && buffer[offset] !== 0x7b) offset += 1;
    if (offset >= zipOffset) break;
    const end = findJsonDocumentEnd(buffer, offset, zipOffset);
    try {
      documents.push(JSON.parse(buffer.subarray(offset, end).toString("utf8")));
    } catch {
      throw new Error("Frozen AMXD contains invalid JSON metadata");
    }
    ranges.push({ start: offset, end });
    if (documents.length > MAX_JSON_DOCUMENTS) {
      throw new Error("Frozen AMXD contains too many JSON metadata documents");
    }
    offset = end;
  }

  if (documents.length === 0) throw new Error("Frozen AMXD has no JSON metadata");
  return { documents, ranges };
}

function assertFrozenMetadataDirectory(buffer, tailOffset) {
  if (
    buffer.readUInt32BE(AMPF_HEADER_LENGTH + 4) !== 16 ||
    buffer.readUInt32BE(AMPF_HEADER_LENGTH + 8) !== 0 ||
    buffer.readUInt32BE(AMPF_HEADER_LENGTH + 12) + AMPF_HEADER_LENGTH !==
      tailOffset
  ) {
    throw new Error("Frozen AMXD has an invalid Max metadata directory header");
  }
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function assertSupportedZipExtra(extra) {
  if (extra.length === 0) return;
  // Max's current archives use the Info-ZIP extended timestamp field with
  // exactly one four-byte modification time. No opaque extra payload is kept.
  if (
    extra.length !== 9 ||
    extra.readUInt16LE(0) !== 0x5455 ||
    extra.readUInt16LE(2) !== 5 ||
    extra[4] !== 1
  ) {
    throw new Error("Frozen AMXD ZIP entry has unsupported extra metadata");
  }
}

function parseEmbeddedZipEntries(
  buffer,
  firstZipOffset,
  { maxTotalUncompressedBytes = MAX_ZIP_TOTAL_BYTES } = {},
) {
  if (
    !Number.isSafeInteger(maxTotalUncompressedBytes) ||
    maxTotalUncompressedBytes < 0 ||
    maxTotalUncompressedBytes > MAX_ZIP_TOTAL_BYTES
  ) {
    throw new Error("Invalid frozen AMXD ZIP payload limit");
  }
  const entries = [];
  const archives = [];
  let offset = firstZipOffset;
  let archiveEnds = 0;
  let archiveStart = firstZipOffset;
  let localEntries = [];
  let centralEntries = [];
  let centralStart = null;
  let tailOffset = buffer.length;
  let totalUncompressedSize = 0;

  function finishArchive(endOffset, commentLength) {
    const footerEnd = endOffset + 22 + commentLength;
    if (commentLength !== 0) {
      throw new Error("Frozen AMXD ZIP footer comments are unsupported");
    }
    if (footerEnd > buffer.length) {
      throw new Error("Frozen AMXD has a truncated ZIP footer comment");
    }

    const diskNumber = buffer.readUInt16LE(endOffset + 4);
    const centralDisk = buffer.readUInt16LE(endOffset + 6);
    const entriesOnDisk = buffer.readUInt16LE(endOffset + 8);
    const totalEntries = buffer.readUInt16LE(endOffset + 10);
    const centralSize = buffer.readUInt32LE(endOffset + 12);
    const centralOffset = buffer.readUInt32LE(endOffset + 16);
    if (diskNumber !== 0 || centralDisk !== 0) {
      throw new Error("Frozen AMXD contains a multi-disk ZIP archive");
    }
    if (
      centralStart === null ||
      entriesOnDisk !== totalEntries ||
      totalEntries !== localEntries.length ||
      totalEntries !== centralEntries.length ||
      archiveStart + centralOffset !== centralStart ||
      centralSize !== endOffset - centralStart
    ) {
      throw new Error("Frozen AMXD ZIP index does not match its local entries");
    }

    const localsByOffset = new Map(
      localEntries.map((entry) => [entry.offset - archiveStart, entry]),
    );
    const referencedOffsets = new Set();
    for (const central of centralEntries) {
      const local = localsByOffset.get(central.localOffset);
      if (
        !local ||
        referencedOffsets.has(central.localOffset) ||
        central.versionNeeded !== local.versionNeeded ||
        central.flags !== local.flags ||
        central.method !== local.method ||
        central.crc !== local.crc ||
        central.compressedSize !== local.compressedSize ||
        central.uncompressedSize !== local.uncompressedSize ||
        !central.encodedName.equals(local.encodedName) ||
        !central.extra.equals(local.extra)
      ) {
        throw new Error("Frozen AMXD ZIP index contains an inconsistent entry");
      }
      referencedOffsets.add(central.localOffset);
    }

    archives.push({
      start: archiveStart,
      end: footerEnd,
      entries: [...localEntries],
    });
    archiveEnds += 1;
    if (archiveEnds > MAX_ZIP_ARCHIVES) {
      throw new Error("Frozen AMXD contains too many embedded ZIP archives");
    }
    offset = footerEnd;
    localEntries = [];
    centralEntries = [];
    centralStart = null;
  }

  while (offset < buffer.length) {
    if (buffer.subarray(offset, offset + 4).equals(ZIP_LOCAL_HEADER)) {
      if (centralStart !== null) {
        throw new Error("Frozen AMXD ZIP entry appears after its central index");
      }
      if (localEntries.length === 0) archiveStart = offset;
      if (offset + 30 > buffer.length) throw new Error("Frozen AMXD has a truncated ZIP entry");
      const versionNeeded = buffer.readUInt16LE(offset + 4);
      const flags = buffer.readUInt16LE(offset + 6);
      const method = buffer.readUInt16LE(offset + 8);
      const expectedCrc = buffer.readUInt32LE(offset + 14);
      const compressedSize = buffer.readUInt32LE(offset + 18);
      const uncompressedSize = buffer.readUInt32LE(offset + 22);
      const nameLength = buffer.readUInt16LE(offset + 26);
      const extraLength = buffer.readUInt16LE(offset + 28);
      if (entries.length >= MAX_ZIP_ENTRIES) {
        throw new Error("Frozen AMXD contains too many embedded ZIP entries");
      }
      if (versionNeeded !== 20 || flags !== 0) {
        throw new Error("Frozen AMXD ZIP entries use unsupported flags");
      }
      if (method !== 0 && method !== 8) {
        throw new Error(`Frozen AMXD ZIP entry uses unsupported method ${method}`);
      }
      if (uncompressedSize > MAX_ZIP_ENTRY_BYTES) {
        throw new Error("Frozen AMXD ZIP entry exceeds the uncompressed size limit");
      }
      totalUncompressedSize += uncompressedSize;
      if (totalUncompressedSize > maxTotalUncompressedBytes) {
        throw new Error("Frozen AMXD ZIP payload exceeds the uncompressed size limit");
      }
      const nameStart = offset + 30;
      const dataStart = nameStart + nameLength + extraLength;
      const dataEnd = dataStart + compressedSize;
      if (!nameLength || dataEnd > buffer.length) {
        throw new Error("Frozen AMXD has an invalid ZIP entry length");
      }
      const encodedName = buffer.subarray(nameStart, nameStart + nameLength);
      const extra = buffer.subarray(nameStart + nameLength, dataStart);
      assertSupportedZipExtra(extra);
      const name = encodedName.toString("utf8");
      if (!Buffer.from(name, "utf8").equals(encodedName)) {
        throw new Error("Frozen AMXD ZIP entry has an invalid UTF-8 name");
      }
      const compressed = buffer.subarray(dataStart, dataEnd);
      let decoded;
      try {
        decoded = method === 8
          ? zlib.inflateRawSync(compressed, {
              maxOutputLength: Math.min(MAX_ZIP_ENTRY_BYTES, uncompressedSize + 1),
            })
          : compressed;
      } catch {
        throw new Error(`Frozen AMXD ZIP entry cannot be decoded: ${name}`);
      }
      if (decoded.length !== uncompressedSize || crc32(decoded) !== expectedCrc) {
        throw new Error(`Frozen AMXD ZIP entry failed integrity validation: ${name}`);
      }
      entries.push({
        name,
        offset,
        flags,
        versionNeeded,
        crc: expectedCrc,
        method,
        compressedSize,
        uncompressedSize,
        encodedName,
        extra,
        dataStart,
        dataEnd,
        data: decoded,
      });
      localEntries.push(entries.at(-1));
      offset = dataEnd;
      continue;
    }
    if (buffer.subarray(offset, offset + 4).equals(ZIP_CENTRAL_HEADER)) {
      if (offset + 46 > buffer.length) throw new Error("Frozen AMXD has a truncated ZIP index");
      if (localEntries.length === 0) {
        throw new Error("Frozen AMXD ZIP index has no local entries");
      }
      if (centralStart === null) centralStart = offset;
      const versionMadeBy = buffer.readUInt16LE(offset + 4);
      const versionNeeded = buffer.readUInt16LE(offset + 6);
      const flags = buffer.readUInt16LE(offset + 8);
      const method = buffer.readUInt16LE(offset + 10);
      const crc = buffer.readUInt32LE(offset + 16);
      const compressedSize = buffer.readUInt32LE(offset + 20);
      const uncompressedSize = buffer.readUInt32LE(offset + 24);
      const nameLength = buffer.readUInt16LE(offset + 28);
      const extraLength = buffer.readUInt16LE(offset + 30);
      const commentLength = buffer.readUInt16LE(offset + 32);
      const diskStart = buffer.readUInt16LE(offset + 34);
      const internalAttributes = buffer.readUInt16LE(offset + 36);
      const externalAttributes = buffer.readUInt32LE(offset + 38);
      const localOffset = buffer.readUInt32LE(offset + 42);
      const nameStart = offset + 46;
      const centralEnd = nameStart + nameLength + extraLength + commentLength;
      if (!nameLength || centralEnd > buffer.length) {
        throw new Error("Frozen AMXD has an invalid ZIP index entry length");
      }
      const encodedName = buffer.subarray(nameStart, nameStart + nameLength);
      const extra = buffer.subarray(nameStart + nameLength, nameStart + nameLength + extraLength);
      if (commentLength !== 0) {
        throw new Error("Frozen AMXD ZIP entries must not have file comments");
      }
      assertSupportedZipExtra(extra);
      const name = encodedName.toString("utf8");
      if (!Buffer.from(name, "utf8").equals(encodedName)) {
        throw new Error("Frozen AMXD ZIP index has an invalid UTF-8 name");
      }
      if (diskStart !== 0) {
        throw new Error("Frozen AMXD ZIP index references another disk");
      }
      const creatorSystem = versionMadeBy >>> 8;
      const unixType = (externalAttributes >>> 16) & 0xf000;
      const expectedUnixType = name.endsWith("/") ? 0x4000 : 0x8000;
      if (
        versionNeeded !== 20 ||
        ![0, 1].includes(internalAttributes) ||
        (creatorSystem === 3
          ? unixType !== expectedUnixType
          : externalAttributes !== 0)
      ) {
        throw new Error("Frozen AMXD ZIP index has unsupported file attributes");
      }
      centralEntries.push({
        flags,
        versionNeeded,
        method,
        crc,
        compressedSize,
        uncompressedSize,
        encodedName,
        extra,
        localOffset,
      });
      offset = centralEnd;
      continue;
    }
    if (buffer.subarray(offset, offset + 4).equals(ZIP_END_HEADER)) {
      if (offset + 22 > buffer.length) throw new Error("Frozen AMXD has a truncated ZIP footer");
      const commentLength = buffer.readUInt16LE(offset + 20);
      finishArchive(offset, commentLength);
      continue;
    }
    // Max appends its own binary dependency directory after one or more ZIP
    // archives. It is not part of the ZIP payload and is preserved byte-for-byte.
    if (archiveEnds > 0 && localEntries.length === 0) {
      tailOffset = offset;
      break;
    }
    throw new Error("Frozen AMXD contains unrecognized data in its embedded ZIP payload");
  }

  if (
    entries.length === 0 ||
    archiveEnds === 0 ||
    localEntries.length !== 0 ||
    centralEntries.length !== 0 ||
    centralStart !== null
  ) {
    throw new Error("Frozen AMXD has no valid embedded ZIP payload");
  }
  return { archiveCount: archiveEnds, archives, entries, tailOffset };
}

function decodePaddedName(payload) {
  const terminator = payload.indexOf(0);
  if (terminator <= 0 || payload.subarray(terminator).some((byte) => byte !== 0)) {
    throw new Error("Frozen AMXD native dependency directory has an invalid name");
  }
  const encoded = payload.subarray(0, terminator);
  const name = encoded.toString("utf8");
  if (!Buffer.from(name, "utf8").equals(encoded)) {
    throw new Error("Frozen AMXD native dependency directory has an invalid UTF-8 name");
  }
  return name;
}

function parseNativeDirectoryRecord(buffer, offset, limit) {
  if (offset + 8 > limit || buffer.subarray(offset, offset + 4).toString("ascii") !== "dire") {
    throw new Error("Frozen AMXD native dependency directory has an invalid record");
  }
  const length = buffer.readUInt32BE(offset + 4);
  const end = offset + length;
  if (length < 8 || length % 4 !== 0 || end > limit) {
    throw new Error("Frozen AMXD native dependency directory has an invalid record length");
  }

  const fields = {};
  const expectedTags = ["type", "fnam", "sz32", "of32", "vers", "flag", "mdat"];
  let childOffset = offset + 8;
  for (const expectedTag of expectedTags) {
    if (childOffset + 8 > end) {
      throw new Error("Frozen AMXD native dependency directory has a truncated record");
    }
    const tag = buffer.subarray(childOffset, childOffset + 4).toString("ascii");
    const childLength = buffer.readUInt32BE(childOffset + 4);
    const childEnd = childOffset + childLength;
    if (
      tag !== expectedTag ||
      childLength < 12 ||
      childLength % 4 !== 0 ||
      childEnd > end
    ) {
      throw new Error("Frozen AMXD native dependency directory has an invalid field");
    }
    const payload = buffer.subarray(childOffset + 8, childEnd);
    if (tag === "type") {
      if (childLength !== 12) {
        throw new Error("Frozen AMXD native dependency directory has an invalid type field");
      }
      fields.type = payload.toString("ascii");
    } else if (tag === "fnam") {
      fields.name = decodePaddedName(payload);
    } else {
      if (childLength !== 12) {
        throw new Error("Frozen AMXD native dependency directory has an invalid numeric field");
      }
      fields[tag] = payload.readUInt32BE(0);
    }
    childOffset = childEnd;
  }
  if (childOffset !== end || !["JSON", "TEXT", "PNG ", "fold", "iLaX", "\0\0\0\0"].includes(fields.type)) {
    throw new Error("Frozen AMXD native dependency directory has unexpected record data");
  }
  return { ...fields, end };
}

function archiveFolderName(archive) {
  const prefixes = new Set();
  for (const entry of archive.entries) {
    let name = entry.name;
    if (name.startsWith("__MACOSX/")) name = name.slice("__MACOSX/".length);
    if (!name || name.endsWith("/")) continue;
    const [prefix] = name.split("/");
    if (prefix) prefixes.add(prefix);
  }
  if (prefixes.size !== 1) {
    throw new Error("Frozen AMXD embedded ZIP archive does not map to one dependency folder");
  }
  return `${[...prefixes][0]}/zipfolder`;
}

function parseNativeDependencyDirectory(
  buffer,
  tailOffset,
  documentRanges,
  zipOffset,
  archives,
) {
  if (tailOffset >= buffer.length) {
    throw new Error("Frozen AMXD has no native dependency directory");
  }
  if (
    tailOffset + 8 > buffer.length ||
    buffer.subarray(tailOffset, tailOffset + 4).toString("ascii") !== "dlst" ||
    buffer.readUInt32BE(tailOffset + 4) !== buffer.length - tailOffset
  ) {
    throw new Error("Frozen AMXD native dependency directory has an invalid header");
  }

  const records = [];
  let offset = tailOffset + 8;
  while (offset < buffer.length) {
    const record = parseNativeDirectoryRecord(buffer, offset, buffer.length);
    records.push(record);
    if (records.length > MAX_JSON_DOCUMENTS + MAX_ZIP_ARCHIVES) {
      throw new Error("Frozen AMXD native dependency directory has too many records");
    }
    offset = record.end;
  }
  if (offset !== buffer.length) {
    throw new Error("Frozen AMXD native dependency directory is truncated");
  }

  const documentRecords = records.filter(({ type }) => type === "JSON");
  const folderRecords = records.filter(({ type }) => type === "fold");
  if (
    documentRecords.length !== documentRanges.length ||
    folderRecords.length !== archives.length ||
    records.length !== documentRecords.length + folderRecords.length ||
    records
      .slice(0, documentRecords.length)
      .some(({ type }) => type !== "JSON") ||
    records.slice(documentRecords.length).some(({ type }) => type !== "fold")
  ) {
    throw new Error("Frozen AMXD native dependency directory has inconsistent record counts");
  }
  if (
    records.some(({ vers }) => vers !== 0) ||
    documentRecords.some(({ flag }, index) => flag !== (index === 0 ? 17 : 0)) ||
    documentRecords.some(({ mdat }) => mdat === 0) ||
    folderRecords.some(({ flag, mdat }) => flag !== 0 || mdat !== 0)
  ) {
    throw new Error("Frozen AMXD native dependency directory has unexpected record flags");
  }

  for (let index = 0; index < documentRecords.length; index += 1) {
    const record = documentRecords[index];
    const range = documentRanges[index];
    const nextStart = documentRanges[index + 1]?.start ?? zipOffset;
    if (record.of32 + AMPF_HEADER_LENGTH !== range.start || record.sz32 !== nextStart - range.start) {
      throw new Error("Frozen AMXD native dependency directory has stale JSON offsets");
    }
  }

  const documentNames = documentRecords.map(({ name }) => name);
  if (
    documentNames.some(
      (name, index) =>
        name !== pathBasename(name) ||
        !(index === 0 ? name.endsWith(".amxd") : name.endsWith(".maxpat")),
    ) ||
    new Set(documentNames).size !== documentNames.length
  ) {
    throw new Error("Frozen AMXD native dependency directory has invalid JSON names");
  }

  const patcherNames = archives
    .flatMap(({ entries }) => entries.map(({ name }) => name))
    .filter((name) => /^patchers\/[^/]+\.maxpat$/.test(name))
    .map((name) => name.slice("patchers/".length));
  const patcherNameSet = new Set(patcherNames);
  const dependencyNameSet = new Set(documentNames.slice(1));
  if (
    patcherNameSet.size !== patcherNames.length ||
    patcherNameSet.size !== documentNames.length ||
    [...dependencyNameSet].some((name) => !patcherNameSet.has(name)) ||
    [...patcherNameSet].filter((name) => !dependencyNameSet.has(name)).length !== 1
  ) {
    throw new Error("Frozen AMXD native dependency directory does not match embedded patchers");
  }

  for (let index = 0; index < folderRecords.length; index += 1) {
    const record = folderRecords[index];
    const archive = archives[index];
    if (
      record.name !== archiveFolderName(archive) ||
      record.of32 + AMPF_HEADER_LENGTH !== archive.start ||
      record.sz32 !== archive.end - archive.start
    ) {
      throw new Error("Frozen AMXD native dependency directory has stale ZIP offsets");
    }
  }

  return {
    documentNames,
    folderNames: folderRecords.map(({ name }) => name),
    recordCount: records.length,
    topLevelPatcherName: [...patcherNameSet].find(
      (name) => !dependencyNameSet.has(name),
    ),
  };
}

function pathBasename(name) {
  const parts = name.split(/[\\/]/);
  return parts[parts.length - 1];
}

function inspectFrozenAmxd(buffer, options) {
  assertAmpfContainer(buffer, { frozen: true });
  // Native Freeze can store dependencies directly before the project ZIPs.
  // Read the directory first: scanning arbitrary PNG/JS bytes for JSON is unsafe.
  const directoryOffset = buffer.readUInt32BE(44) + AMPF_HEADER_LENGTH;
  if (directoryOffset + 8 > buffer.length ||
      buffer.toString("ascii", directoryOffset, directoryOffset + 4) !== "dlst" ||
      buffer.readUInt32BE(directoryOffset + 4) !== buffer.length - directoryOffset) {
    throw new Error("Frozen AMXD native dependency directory has an invalid header");
  }
  const records = [];
  for (let offset = directoryOffset + 8; offset < buffer.length;) {
    const record = parseNativeDirectoryRecord(buffer, offset, buffer.length);
    records.push(record);
    if (records.length > MAX_JSON_DOCUMENTS + MAX_ZIP_ARCHIVES) throw new Error("Too many native dependencies");
    offset = record.end;
  }
  if (records.some(record => record.type === "TEXT" || record.type === "PNG ")) {
    return inspectDirectDependencies(buffer, records, directoryOffset, options);
  }
  const zipOffset = buffer.indexOf(ZIP_LOCAL_HEADER, AMPF_HEADER_LENGTH);
  if (zipOffset < 0) throw new Error("Frozen AMXD has no embedded ZIP payload");
  const metadata = parseFrozenJsonDocuments(buffer, zipOffset);
  const { documents } = metadata;
  const archive = parseEmbeddedZipEntries(buffer, zipOffset, options);
  assertFrozenMetadataDirectory(buffer, archive.tailOffset);
  const { entries } = archive;
  const nativeDirectory = parseNativeDependencyDirectory(
    buffer,
    archive.tailOffset,
    metadata.ranges,
    zipOffset,
    archive.archives,
  );
  const topLevelPatcher = documents[0]?.patcher;
  if (!topLevelPatcher) throw new Error("Frozen AMXD has no top-level patcher metadata");
  return {
    documents,
    entries,
    nativeDirectory,
    validation: {
      zipOffset,
      zipArchiveCount: archive.archiveCount,
      zipTailOffset: archive.tailOffset,
      jsonDocumentCount: documents.length,
      zipEntryCount: entries.length,
      nativeDirectoryRecordCount: nativeDirectory.recordCount,
      amxdType: topLevelPatcher.project?.amxdtype ?? null,
      minimumLiveVersion: topLevelPatcher.minimum_live_version ?? null,
      minimumMaxVersion: topLevelPatcher.minimum_max_version ?? null,
    },
  };
}

function inspectDirectDependencies(buffer, records, directoryOffset, options) {
  const documents = [], nativeEntries = [], nativeBundles = [], names = new Set();
  let externalParts = [];
  let external = null;
  let nextOffset = AMPF_HEADER_LENGTH + FROZEN_METADATA_HEADER_LENGTH;
  let firstZip = null;
  const folders = [];
  for (const [index, record] of records.entries()) {
    const start = record.of32 + AMPF_HEADER_LENGTH;
    const end = start + record.sz32;
    if (start !== nextOffset || record.sz32 === 0 || end > directoryOffset ||
        record.vers !== 0 || record.flag !== (index === 0 ? 17 : 0) ||
        (record.type === "fold" ? record.mdat !== 0 : record.mdat === 0) ||
        names.has(record.name) || (index === 0 && record.type !== "JSON")) {
      throw new Error("Frozen AMXD has inconsistent native dependency offsets or flags");
    }
    names.add(record.name);
    nextOffset = end;
    const data = buffer.subarray(start, end);
    if (externalParts.length) {
      const part = externalParts.shift();
      if (record.type !== "\0\0\0\0" || record.name !== `${external.name.slice(0, -4)}/${part}`) {
        throw new Error("Invalid native external resource order or name");
      }
      external[part] = data;
      if (!externalParts.length) {
        const zip = parseEmbeddedZipEntries(external.zipfile, 0, options);
        if (zip.archiveCount !== 1 || zip.tailOffset !== external.zipfile.length) {
          throw new Error("Invalid native external ZIP payload");
        }
        external.entries = zip.entries;
        nativeBundles.push(external);
        external = null;
      }
      continue;
    }
    if (record.type === "iLaX") {
      if (firstZip !== null || !/^[a-zA-Z0-9_-]+\.mxo$/.test(record.name) ||
          data.length !== 4 || data.readUInt32BE(0) !== 0) {
        throw new Error("Invalid native external marker");
      }
      external = { name: record.name };
      externalParts = ["zipfile", "executable", "plist"];
      continue;
    }
    if (record.type === "\0\0\0\0") throw new Error("Orphan native external resource");
    if (record.type === "fold") {
      firstZip ??= start;
      folders.push(record);
      continue;
    }
    if (firstZip !== null || record.name !== pathBasename(record.name)) {
      throw new Error("Frozen AMXD has invalid native dependency ordering or name");
    }
    if (record.type === "JSON") {
      if (!/\.(amxd|maxpat)$/.test(record.name)) throw new Error("Invalid native patcher name");
      const jsonEnd = findJsonDocumentEnd(buffer, start, end);
      if (buffer.subarray(jsonEnd, end).some(byte => ![0, 9, 10, 13, 32].includes(byte))) throw new Error("Unexpected trailing patcher data");
      documents.push(JSON.parse(buffer.toString("utf8", start, jsonEnd)));
    } else {
      if (record.type === "TEXT" && !record.name.endsWith(".js")) throw new Error("Invalid native script name");
      if (record.type === "PNG " && (!record.name.endsWith(".png") || !data.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")))) throw new Error("Invalid native image");
      nativeEntries.push({ name: record.name, data });
    }
  }
  if (externalParts.length || nextOffset !== directoryOffset || firstZip === null || !documents[0]?.patcher) throw new Error("Incomplete native frozen payload");
  const archive = parseEmbeddedZipEntries(buffer, firstZip, options);
  assertFrozenMetadataDirectory(buffer, archive.tailOffset);
  if (archive.tailOffset !== directoryOffset || folders.length !== archive.archives.length) throw new Error("Native ZIP directory mismatch");
  for (const [index, folder] of folders.entries()) {
    const zip = archive.archives[index];
    if (folder.name !== archiveFolderName(zip) || folder.of32 + AMPF_HEADER_LENGTH !== zip.start || folder.sz32 !== zip.end - zip.start) throw new Error("Native ZIP offset mismatch");
  }
  const patcher = documents[0].patcher;
  return {
    documents, entries: archive.entries, nativeEntries, nativeBundles,
    nativeDirectory: { documentNames: records.filter(r => r.type === "JSON").map(r => r.name), folderNames: folders.map(r => r.name), recordCount: records.length },
    validation: { zipOffset: firstZip, zipArchiveCount: archive.archiveCount, zipTailOffset: directoryOffset,
      jsonDocumentCount: documents.length, zipEntryCount: archive.entries.length, nativeDependencyCount: nativeEntries.length,
      nativeDirectoryRecordCount: records.length, amxdType: buffer.readUInt32BE(8),
      savedByMax: patcher.appversion ?? null,
      minimumLiveVersion: patcher.minimum_live_version ?? null, minimumMaxVersion: patcher.minimum_max_version ?? null },
  };
}

function validateFrozenAmxd(buffer) {
  return inspectFrozenAmxd(buffer).validation;
}

module.exports = {
  MAX_AMXD_BYTES,
  MAX_ZIP_ENTRIES,
  MAX_ZIP_ENTRY_BYTES,
  MAX_ZIP_TOTAL_BYTES,
  assertAmpfContainer,
  inspectFrozenAmxd,
  validateFrozenAmxd,
};
