import { inflateRawSync } from 'node:zlib';
import { DOCX_BODY_ENTRY_PATH } from './constants';

/**
 * Best-effort, dependency-free text extraction from Word documents.
 *
 * `.docx` is a ZIP archive: the central directory is walked by hand, the one
 * body entry (`word/document.xml`) is inflated with `node:zlib`, and its XML
 * is reduced to one line per paragraph. Legacy `.doc` (an OLE2 compound file)
 * has no documented plain-text path, so a crude printable-run scrape is the
 * honest best effort — binary noise between text runs becomes line breaks.
 *
 * Everything here is deterministic and pure: no filesystem, no network, no
 * model. Extraction never throws on malformed input — it degrades to fewer
 * lines or an empty string, which the caller reads as an invalid transcript.
 */

/** Extracts the transcript text from a `.docx` or `.doc` payload, one line
 * per paragraph (docx) or text run (doc). Returns '' when nothing readable
 * is found. */
export function extractDocumentText(fileName: string, content: Buffer): string {
  if (fileName.toLowerCase().endsWith('.docx')) {
    return extractDocxText(content);
  }
  if (fileName.toLowerCase().endsWith('.doc')) {
    return extractDocText(content);
  }
  return '';
}

/** Extracts text from a zipped Office document: locate `word/document.xml`
 * through the central directory, inflate it, and strip the XML down to one
 * line per paragraph. */
function extractDocxText(content: Buffer): string {
  const xml = readZipEntry(content, DOCX_BODY_ENTRY_PATH);
  if (xml === null) {
    return '';
  }
  return xmlToLines(xml);
}

/** Reduces a WordprocessingML document to plain text: paragraph ends become
 * line breaks, tabs and soft breaks become spaces, every remaining tag is
 * stripped, and the five XML entities are decoded. */
function xmlToLines(xml: string): string {
  const withBreaks = xml
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:tab\b[^>]*\/?>/g, ' ')
    .replace(/<w:br\b[^>]*\/?>/g, '\n');
  return decodeXmlEntities(withBreaks.replace(/<[^>]*>/g, ''))
    .split('\n')
    .map(line => line.replace(/[ \t]+/g, ' ').trim())
    .filter(line => line !== '')
    .join('\n');
}

const XML_ENTITY_PATTERN = /&(?:amp|lt|gt|quot|apos|#(\d+)|#x([0-9a-fA-F]+));/g;

/** Decodes the five predefined XML entities plus numeric character
 * references. Unknown entities are left as literal text. */
function decodeXmlEntities(text: string): string {
  return text.replace(XML_ENTITY_PATTERN, (entity, decimal, hex) => {
    if (decimal !== undefined) {
      return String.fromCodePoint(Number(decimal));
    }
    if (hex !== undefined) {
      return String.fromCodePoint(Number.parseInt(hex, 16));
    }
    switch (entity) {
      case '&amp;':
        return '&';
      case '&lt;':
        return '<';
      case '&gt;':
        return '>';
      case '&quot;':
        return '"';
      case '&apos;':
        return "'";
      default:
        return entity;
    }
  });
}

/** Reads one file out of a ZIP archive by hand: scan backwards for the End of
 * Central Directory record, walk the central directory entries, and inflate
 * the target's data from its local header. Returns null for anything it
 * cannot parse — a malformed archive is an empty transcript, never a crash. */
function readZipEntry(content: Buffer, entryName: string): string | null {
  const eocdOffset = findEocdOffset(content);
  if (eocdOffset === -1) {
    return null;
  }

  const entryCount = content.readUInt16LE(eocdOffset + 10);
  let offset = content.readUInt32LE(eocdOffset + 16);
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > content.length || content.readUInt32LE(offset) !== 0x0201_4b50) {
      return null;
    }
    const method = content.readUInt16LE(offset + 10);
    const compressedSize = content.readUInt32LE(offset + 20);
    const nameLength = content.readUInt16LE(offset + 28);
    const extraLength = content.readUInt16LE(offset + 30);
    const commentLength = content.readUInt16LE(offset + 32);
    const localHeaderOffset = content.readUInt32LE(offset + 42);
    const name = content.toString('utf8', offset + 46, offset + 46 + nameLength);
    offset += 46 + nameLength + extraLength + commentLength;

    if (name !== entryName) {
      continue;
    }
    return inflateLocalEntry(content, localHeaderOffset, method, compressedSize);
  }
  return null;
}

/** Locates the End of Central Directory record: the last 22–65,557 bytes of
 * the archive, scanned back to front. */
function findEocdOffset(content: Buffer): number {
  const minimum = Math.max(0, content.length - 22 - 0xffff);
  for (let offset = content.length - 22; offset >= minimum; offset -= 1) {
    if (content.readUInt32LE(offset) === 0x0605_4b50) {
      return offset;
    }
  }
  return -1;
}

/** Inflates one entry from its local file header: the header's own name and
 * extra lengths (which may differ from the central directory's) size the
 * gap before the data. */
function inflateLocalEntry(content: Buffer, localHeaderOffset: number, method: number, compressedSize: number): string | null {
  if (localHeaderOffset + 30 > content.length || content.readUInt32LE(localHeaderOffset) !== 0x0403_4b50) {
    return null;
  }
  const nameLength = content.readUInt16LE(localHeaderOffset + 26);
  const extraLength = content.readUInt16LE(localHeaderOffset + 28);
  const dataStart = localHeaderOffset + 30 + nameLength + extraLength;
  const dataEnd = Math.min(dataStart + compressedSize, content.length);
  if (dataStart >= content.length) {
    return null;
  }

  const data = content.subarray(dataStart, dataEnd);
  try {
    const text = method === 0 ? data : method === 8 ? inflateRawSync(data) : null;
    return text === null ? null : text.toString('utf8');
  } catch {
    return null;
  }
}

/** Minimum length of a contiguous printable run worth keeping — shorter runs
 * are binary noise, not transcript text. */
const MINIMUM_TEXT_RUN_LENGTH = 4;
const PRINTABLE_RUN_PATTERN = /[\x20-\x7E]{4,}/g;

/** Scrapes a legacy binary Word document: contiguous printable runs are
 * extracted from the UTF-16LE and Latin-1 decodings, and whichever decoding
 * yields more text wins. Deterministic and crude, by design. */
function extractDocText(content: Buffer): string {
  const utf16Runs = content.toString('utf16le').match(PRINTABLE_RUN_PATTERN) ?? [];
  const latin1Runs = content.toString('latin1').match(PRINTABLE_RUN_PATTERN) ?? [];
  const candidates = [
    utf16Runs.filter(run => run.length >= MINIMUM_TEXT_RUN_LENGTH),
    latin1Runs.filter(run => run.length >= MINIMUM_TEXT_RUN_LENGTH),
  ];
  const best = candidates.reduce((best, runs) =>
    runs.join('').length > best.join('').length ? runs : best,
  );
  return best.map(run => run.trim()).filter(run => run !== '').join('\n');
}
