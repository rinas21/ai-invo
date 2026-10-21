import { Packer, Document, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType } from 'docx';
import pdfmake from 'pdfmake/build/pdfmake.js';
import vfsFonts from 'pdfmake/build/vfs_fonts.js';
import { parseMemoHtml, extractPlainText } from './htmlParser.js';

const pdfMake = pdfmake.default || pdfmake;
const vfs = vfsFonts?.default ?? vfsFonts;
if (typeof pdfMake.addVirtualFileSystem === 'function') {
  try { pdfMake.addVirtualFileSystem(vfs); } catch {}
} else {
  try { pdfMake.vfs = vfs; } catch {}
}

function fontMap(bold, italic) {
  return { bold: !!bold, italics: !!italic };
}

export function buildDocx(html) {
  const blocks = parseMemoHtml(html);
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: blocks.map((block) => blockToDocx(block)),
      },
    ],
  });
  return Packer.toBuffer(doc);
}

function blockToDocx(block) {
  if (block.type === 'heading') {
    return new Paragraph({
      text: runsToText(block.runs),
      heading: block.level === 1 ? 1 : block.level === 2 ? 2 : 3,
      spacing: { before: 200, after: 200 },
    });
  }
  if (block.type === 'paragraph') {
    const children = block.runs.map((r) => new TextRun({ text: r.text, bold: r.bold, italics: r.italic, font: 'Calibri', size: 22 }));
    return new Paragraph({ children, spacing: { after: 240 } });
  }
  if (block.type === 'table') {
    const rows = block.rows.map((row) => {
      const cells = row.map((cell) => {
        const text = runsToText(cell.runs);
        const first = cell.runs[0];
        return new TableCell({
          children: [new TextRun({ text, bold: !!first?.bold, font: 'Calibri', size: 20 })],
          verticalAlignment: AlignmentType.CENTER,
        });
      });
      return new TableRow({ children: cells });
    });
    return new Table({
      rows,
      width: { size: 100, type: WidthType.PERCENTAGE },
    });
  }
  return new Paragraph({ text: '' });
}

function runsToText(runs) {
  return runs.map((r) => r.text).join('');
}

function blockToPdfMake(block) {
  if (block.type === 'heading') {
    return {
      text: runsToText(block.runs),
      style: 'heading',
      margin: [0, 10, 0, 6],
      bold: true,
    };
  }
  if (block.type === 'paragraph') {
    if (block.runs.length === 0) return { text: '', margin: [0, 0, 0, 8] };
      return {
        text: block.runs.map((r) => ({ text: r.text, bold: r.bold, italics: r.italic })),
        margin: [0, 0, 0, 10],
      };
  }
  if (block.type === 'table') {
    const body = block.rows.map((row) =>
      row.map((cell) => ({
        text: cell.runs.map((r) => ({ text: r.text, bold: r.bold, italics: r.italic })),
        margin: [4, 4, 4, 4],
      }))
    );
    return {
      table: {
        widths: block.rows[0].map(() => '*'),
        body,
      },
      margin: [0, 4, 0, 14],
      layout: 'lightHorizontalLines',
    };
  }
  return { text: '', margin: [0, 0, 0, 8] };
}

export function buildPdf(html) {
  const blocks = parseMemoHtml(html);
  const content = blocks.map(blockToPdfMake);
  const docDefinition = {
    pageSize: 'A4',
    pageMargins: [40, 60, 40, 60],
    styles: {
      heading: { fontSize: 14, bold: true, margin: [0, 12, 0, 8] },
    },
    content,
    defaultStyle: { fontSize: 10 },
  };
  return new Promise((resolve, reject) => {
    try {
      pdfMake.createPdf(docDefinition).getBuffer((buffer) => {
        resolve(Buffer.from(buffer));
      });
    } catch (err) {
      reject(err);
    }
  });
}

export { extractPlainText };
