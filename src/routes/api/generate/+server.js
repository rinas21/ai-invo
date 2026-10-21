import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { validateSession } from '$lib/server/auth';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import pdfParse from 'pdf-parse';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  extractInvoiceData,
  mapDataToTemplatePlaceholders,
  normalizePdfText,
} from '$lib/server/invoiceParser.js';

const COOKIE_NAME = 'invomemo_session';
const MAX_PDF_SIZE = 15 * 1024 * 1024; // 15 MB

function getApiKey() {
  return env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
}

function getTemplate() {
  const candidatePaths = [
    join(process.cwd(), 'hr', 'payment_approval_template.html'),
    join(process.cwd(), 'payment_approval_template.html'),
    join(process.cwd(), 'src', 'lib', 'server', 'payment_approval_template.html'),
  ];

  for (const path of candidatePaths) {
    if (existsSync(path)) {
      try {
        return readFileSync(path, 'utf8');
      } catch {
        // try next path
      }
    }
  }

  throw new Error('Payment approval template not found in hr/ or project root.');
}

function authenticate(cookies) {
  const token = cookies.get(COOKIE_NAME);
  if (!token || !validateSession(token)) {
    throw error(401, 'Authentication required.');
  }
}

function escapeHtml(unsafe) {
  if (unsafe == null) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function populateTemplate(template, fields) {
  let html = template;

  // Handle Prepared By and Approved By signatures specifically
  if (html.includes('Prepared By<br><span class="ph">[Name / Designation]</span>')) {
    html = html.replace(
      'Prepared By<br><span class="ph">[Name / Designation]</span>',
      `Prepared By<br><span class="ph">${escapeHtml(fields.preparedBy || '[REVIEW REQUIRED: preparer name/designation unavailable]')}</span>`
    );
  }
  if (html.includes('Approved By<br><span class="ph">[Name / Designation]</span>')) {
    html = html.replace(
      'Approved By<br><span class="ph">[Name / Designation]</span>',
      `Approved By<br><span class="ph">${escapeHtml(fields.approvedBy || '[REVIEW REQUIRED: approver name/designation unavailable]')}</span>`
    );
  }

  const replacements = {
    '[DD Month YYYY]': fields.date || '[REVIEW REQUIRED: invoice date unavailable]',
    '[PAYMENT PURPOSE]': fields.paymentPurpose || '[REVIEW REQUIRED: payment purpose unavailable]',
    '[SUPPLIER NAME]': fields.supplierName || '[REVIEW REQUIRED: supplier name unavailable]',
    '[description of fee/service]': fields.feeService || '[REVIEW REQUIRED: fee/service description unavailable]',
    '[Employee Name]': fields.employeeName || '[REVIEW REQUIRED: employee name unavailable]',
    '[Programme / Event Name]': fields.programmeEvent || '[REVIEW REQUIRED: programme/event name unavailable]',
    '[Invoice Date]': fields.invoiceDate || '[REVIEW REQUIRED: invoice date unavailable]',
    '[Description]': fields.description || '[REVIEW REQUIRED: description unavailable]',
    '[Invoice No]': fields.invoiceNo || '[REVIEW REQUIRED: invoice number unavailable]',
    '[0,000.00]': fields.amount || '[REVIEW REQUIRED: amount unavailable]',
  };

  Object.entries(replacements).forEach(([placeholder, value]) => {
    html = html.split(placeholder).join(escapeHtml(value));
  });

  return html;
}

export async function POST({ request, cookies }) {
  authenticate(cookies);

  let template;
  try {
    template = getTemplate();
  } catch (err) {
    console.error('Template loading error:', err);
    return json({ error: 'Failed to load payment approval template from hr/.' }, { status: 500 });
  }

  const contentType = request.headers.get('content-type') || '';

  // Mode 1: Regeneration with user-reviewed / user-corrected fields (JSON)
  if (contentType.includes('application/json')) {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const { fields } = body || {};
    if (!fields) {
      return json({ error: 'No fields provided.' }, { status: 400 });
    }

    const memoHtml = populateTemplate(template, fields);
    return json({ ok: true, html: memoHtml, fields });
  }

  // Mode 2: Full Extraction & Generation from uploaded PDF (multipart/form-data)
  let invoiceFile;
  try {
    const formData = await request.formData();
    invoiceFile = formData.get('invoice');
  } catch {
    return json({ error: 'Invalid file upload request.' }, { status: 400 });
  }

  if (!invoiceFile || typeof invoiceFile.arrayBuffer !== 'function') {
    return json({ error: 'No invoice PDF file was provided.' }, { status: 400 });
  }

  if (invoiceFile.type !== 'application/pdf' && !invoiceFile.name?.toLowerCase().endsWith('.pdf')) {
    return json({ error: 'Only PDF files are supported.' }, { status: 400 });
  }

  const arrayBuffer = await invoiceFile.arrayBuffer();
  if (arrayBuffer.byteLength === 0) {
    return json({ error: 'The uploaded PDF file is empty.' }, { status: 400 });
  }
  if (arrayBuffer.byteLength > MAX_PDF_SIZE) {
    return json({ error: 'File exceeds 15 MB limit. Please upload a smaller file.' }, { status: 400 });
  }

  // Extract text using pdf-parse
  let invoiceText = '';
  try {
    const pdfData = await pdfParse(Buffer.from(arrayBuffer));
    invoiceText = pdfData.text || '';
  } catch (err) {
    console.error('PDF parsing error:', err);
    return json({ error: 'Unable to parse the PDF file. Ensure file is not corrupted or password-protected.' }, { status: 400 });
  }

  if (!invoiceText || invoiceText.trim().length < 5) {
    return json({
      error: 'This PDF does not contain extractable text. Scanned or image-only invoices require OCR.',
    }, { status: 400 });
  }

  // STAGE A: Deterministic Extraction and Normalization
  const normalizedText = normalizePdfText(invoiceText);
  const structuredData = extractInvoiceData(normalizedText);

  // Initial mapped placeholders from deterministic stage
  let mappedFields = mapDataToTemplatePlaceholders(structuredData);
  let geminiUsed = false;
  let geminiNote = null;

  // STAGE B: Semantic mapping with Gemini (if API key available)
  const apiKey = getApiKey();
  if (apiKey) {
    const modelCandidates = [
      env.GEMINI_MODEL || process.env.GEMINI_MODEL,
      'gemini-flash-latest',
      'gemini-2.5-flash',
      'gemini-3.8-flash',
    ].filter(Boolean);

    const genAI = new GoogleGenerativeAI(apiKey);
    const prompt = `
You are an enterprise document-processing system. Map the extracted invoice information to the Payment Approval Memo template placeholders.

INVOICE EXTRACTED TEXT:
"""${normalizedText}"""

STAGE A DETERMINISTIC EXTRACTED FIELDS:
${JSON.stringify(structuredData, null, 2)}

MEMO TEMPLATE:
"""${template}"""

STRICT RULES:
1. invoiceDate: Must be the invoice date (e.g. "${structuredData.invoiceDate || ''}"). Do not confuse with telephone or reference numbers.
2. referenceNumber / invoiceNo: "${structuredData.referenceNumber || structuredData.invoiceNumber || ''}".
3. supplierName: Issuer / vendor name (e.g. "${structuredData.supplierName || ''}"). NEVER use "Only." or cheque wording fragments.
4. paymentPurpose: Capitalized programme/service name (e.g. "${structuredData.itemName || ''}").
5. feeService: Description of fee/service. NEVER merge adjacent table column headings like "Workshop CodeItem NameQuantity".
6. employeeName: Leave null if not explicitly in the invoice (contact persons like "${structuredData.contactPerson || ''}" are NOT the employee incurring expenditure).
7. amount: Monetary total (e.g. "${structuredData.totalAmount || ''}"). Do not use dates or line numbers.
8. Return PURE JSON only, no markdown:
{
  "date": string|null,
  "paymentPurpose": string|null,
  "supplierName": string|null,
  "feeService": string|null,
  "employeeName": string|null,
  "programmeEvent": string|null,
  "invoiceDate": string|null,
  "description": string|null,
  "invoiceNo": string|null,
  "amount": string|null,
  "preparedBy": null,
  "approvedBy": null
}
`;

    for (const modelName of modelCandidates) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        const raw = result.response.text() || '';
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const aiFields = JSON.parse(jsonMatch[0]);
          // Validate AI fields against strict guards
          if (aiFields.supplierName && !/only\.?/i.test(aiFields.supplierName)) {
            mappedFields.supplierName = aiFields.supplierName;
          }
          if (aiFields.paymentPurpose) mappedFields.paymentPurpose = aiFields.paymentPurpose;
          if (aiFields.invoiceDate) mappedFields.invoiceDate = aiFields.invoiceDate;
          if (aiFields.invoiceNo) mappedFields.invoiceNo = aiFields.invoiceNo;
          if (aiFields.amount && !/^(12|10|2026)$/.test(aiFields.amount.trim())) {
            mappedFields.amount = aiFields.amount;
          }
          if (aiFields.description && !aiFields.description.includes('Workshop CodeItem Name')) {
            mappedFields.description = aiFields.description;
          }
          geminiUsed = true;
          break;
        }
      } catch (err) {
        geminiNote = err.message;
        if (err.status === 404) continue;
        break;
      }
    }
  }

  const memoHtml = populateTemplate(template, mappedFields);

  return json({
    ok: true,
    html: memoHtml,
    fields: mappedFields,
    structuredData,
    geminiUsed,
    note: geminiNote,
  });
}
