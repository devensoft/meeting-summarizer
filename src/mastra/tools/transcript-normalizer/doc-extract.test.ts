import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'bun:test';
import { extractDocumentText } from './doc-extract';

/**
 * Test zip builder: hand-assembles local file headers plus a central
 * directory — just enough archive for the extractor to walk. CRCs are
 * written as zeros on purpose: extraction never verifies them.
 */

function crcZeroBuffer(length: number): Buffer {
  return Buffer.alloc(length);
}

function u16(value: number): Buffer {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function u32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return buffer;
}

function buildZip(entries: Array<{ name: string; data: Buffer; method: number }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, 'utf8');
    const localHeader = Buffer.concat([
      u32(0x0403_4b50),
      u16(20),
      u16(0),
      u16(entry.method),
      u16(0),
      u16(0),
      crcZeroBuffer(4),
      u32(entry.data.length),
      u32(entry.data.length),
      u16(nameBuffer.length),
      u16(0),
      nameBuffer,
    ]);
    localParts.push(localHeader, entry.data);

    centralParts.push(
      u32(0x0201_4b50),
      u16(20),
      u16(20),
      u16(0),
      u16(entry.method),
      u16(0),
      u16(0),
      crcZeroBuffer(4),
      u32(entry.data.length),
      u32(entry.data.length),
      u16(nameBuffer.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBuffer,
    );
    offset += localHeader.length + entry.data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.concat([
    u32(0x0605_4b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralDirectory.length),
    u32(offset),
    u16(0),
  ]);
  return Buffer.concat([...localParts, centralDirectory, eocd]);
}

const XML = [
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
  '<w:body>',
  '<w:p><w:r><w:t>Opening remark</w:t></w:r></w:p>',
  '<w:p><w:r><w:t>Alpha</w:t></w:r><w:r><w:t> Beta &amp; Gamma</w:t><w:tab/><w:t>Delta</w:t></w:r></w:p>',
  '<w:p><w:r><w:t>Line before a break</w:t><w:br/><w:t>Line after a break</w:t></w:r></w:p>',
  '</w:body>',
  '</w:document>',
].join('');

describe('extractDocumentText', () => {
  it('extracts one line per .docx paragraph, joining runs and decoding entities', () => {
    const zip = buildZip([{ name: 'word/document.xml', data: deflateRawSync(Buffer.from(XML, 'utf8')), method: 8 }]);

    expect(extractDocumentText('meeting.docx', zip)).toBe(
      [
        'Opening remark',
        'Alpha Beta & Gamma Delta',
        'Line before a break',
        'Line after a break',
      ].join('\n'),
    );
  });

  it('reads stored (uncompressed) .docx entries too', () => {
    const zip = buildZip([{ name: 'word/document.xml', data: Buffer.from('<w:document><w:p><w:r><w:t>Stored entry</w:t></w:r></w:p></w:document>', 'utf8'), method: 0 }]);

    expect(extractDocumentText('meeting.docx', zip)).toBe('Stored entry');
  });

  it('skips other archive entries and empty paragraphs', () => {
    const xml = '<w:document><w:p><w:r><w:t>Only body text</w:t></w:r></w:p><w:p></w:p></w:document>';
    const zip = buildZip([
      { name: 'docProps/core.xml', data: Buffer.from('<title>ignore me</title>', 'utf8'), method: 0 },
      { name: 'word/document.xml', data: Buffer.from(xml, 'utf8'), method: 0 },
    ]);

    expect(extractDocumentText('meeting.docx', zip)).toBe('Only body text');
  });

  it('degrades a malformed .docx to an empty extraction', () => {
    expect(extractDocumentText('meeting.docx', Buffer.from('not a zip at all'))).toBe('');
    expect(extractDocumentText('meeting.docx', buildZip([{ name: 'word/other.xml', data: Buffer.from('x'), method: 0 }]))).toBe('');
  });

  it('scrapes printable text runs from a legacy .doc', () => {
    // Legacy .doc files store text as UTF-16LE runs between binary noise.
    const text = Buffer.from('Legacy document body text', 'utf16le');
    const doc = Buffer.concat([Buffer.from('\xD0\xCF\x11\xE0', 'latin1'), crcZeroBuffer(64), text, crcZeroBuffer(16)]);

    expect(extractDocumentText('meeting.doc', doc)).toContain('Legacy document body text');
  });

  it('degrades an unreadable .doc to an empty extraction', () => {
    expect(extractDocumentText('meeting.doc', Buffer.from('\xD0\xCF\x11\xE0', 'latin1'))).toBe('');
  });

  it('returns nothing for unknown extensions', () => {
    expect(extractDocumentText('meeting.rtf', Buffer.from('anything'))).toBe('');
  });
});
