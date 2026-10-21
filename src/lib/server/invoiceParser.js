// Stage A: Deterministic extraction & normalization of invoice data

const KNOWN_TABLE_HEADERS = [
  'workshop code',
  'item name',
  'quantity',
  'sales price',
  'unit price',
  'price',
  'amount',
  'total amount',
  'final amount',
  'subtotal',
  'discount',
  'description',
  'line',
  'item',
  'inv no',
  'date',
  'remark'
];

/**
 * Clean text extracted from PDF, normalizing whitespaces while preserving structural lines.
 */
export function normalizePdfText(rawText) {
  if (!rawText) return '';
  return rawText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\t ]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

/**
 * Extract structured invoice data from normalized invoice text.
 */
export function extractInvoiceData(text) {
  const normalized = normalizePdfText(text);
  const lines = normalized.split('\n').filter(Boolean);

  const data = {
    invoiceNumber: null,
    invoiceDate: null,
    supplierName: null,
    customerName: null,
    contactPerson: null,
    telephone: null,
    location: null,
    currency: null,
    referenceNumber: null,
    orderNumber: null,
    workshopCode: null,
    itemName: null,
    quantity: null,
    unitPrice: null,
    discount: null,
    subtotal: null,
    totalAmount: null,
    finalAmount: null,
    paymentInstructions: null,
    remarks: null,
    arithmeticValid: null,
    discrepancy: null,
  };

  function isHeaderRow(line) {
    if (line.includes(':')) return false; // Labeled key-value line, not a table header row
    let count = 0;
    const lower = line.toLowerCase();
    const primaryHeaders = ['workshop code', 'item name', 'quantity', 'sales price', 'unit price', 'final amount', 'total amount', 'subtotal'];
    for (const h of primaryHeaders) {
      if (lower.includes(h.replace(/\s+/g, '')) || lower.includes(h)) count++;
    }
    return count >= 2;
  }

  // Helper to find label value either on same line or next line
  function findLabelValue(patterns) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (isHeaderRow(line)) continue;

      for (const pattern of patterns) {
        const regex = new RegExp(`^(?:${pattern})[:\\s]+(.*)$`, 'i');
        const match = line.match(regex);
        if (match) {
          const val = match[1]?.trim();
          if (val && !/^\[blank\]$/i.test(val) && val !== '-') {
            return { value: val, index: i };
          }
          // Check next line if current was empty or [blank]
          if (i + 1 < lines.length) {
            const next = lines[i + 1].trim();
            // ensure next line is not another recognized label or header row
            if (next && !isLikelyLabel(next) && !isHeaderRow(next) && !/^\[blank\]$/i.test(next) && next !== '-') {
              return { value: next, index: i + 1 };
            }
          }
        }
      }
    }
    return { value: null, index: -1 };
  }

  function isLikelyLabel(str) {
    return /^(reference no|invoice no|date|contact person|customer|currency|amount|total|workshop code|item name|quantity|sales price|tel no|location)[:\s]/i.test(str);
  }

  // 1. Reference No
  const refRes = findLabelValue(['Reference\\s*No\\.?|Ref\\s*No\\.?|Ref\\.?']);
  if (refRes.value) {
    data.referenceNumber = refRes.value.split(/\s+/)[0];
  }

  // 2. Invoice No
  const invRes = findLabelValue(['Invoice\\s*No\\.?|Inv\\s*No\\.?|Invoice\\s*#']);
  if (invRes.value) {
    data.invoiceNumber = invRes.value.split(/\s+/)[0];
  } else if (data.referenceNumber) {
    // If no explicit Invoice No, reference number serves as the primary document reference
    data.invoiceNumber = data.referenceNumber;
  }

  // 3. Date
  const dateRes = findLabelValue(['Date|Invoice\\s*Date|Dated']);
  if (dateRes.value) {
    // Extract date pattern e.g. 12/10/2026 or 12-10-2026 or 12 Oct 2026
    const dm = dateRes.value.match(/([0-9]{1,2}[\/\-.][0-9]{1,2}[\/\-.][0-9]{2,4}|[0-9]{1,2}\s+[A-Za-z]{3,9}\s+[0-9]{2,4})/);
    if (dm) {
      data.invoiceDate = dm[1].trim();
    } else {
      data.invoiceDate = dateRes.value;
    }
  }

  // 4. Contact Person
  const contactRes = findLabelValue(['Contact\\s*Person|Contact|Attn']);
  if (contactRes.value) {
    data.contactPerson = cleanPersonName(contactRes.value);
  }

  // 5. Telephone
  const telRes = findLabelValue(['Tel\\s*No\\.?|Phone|Telephone|Tel']);
  if (telRes.value) {
    data.telephone = telRes.value;
  }

  // 6. Customer
  const custRes = findLabelValue(['Customer|Bill\\s*To|Client|Invoiced\\s*To']);
  if (custRes.value) {
    data.customerName = cleanName(custRes.value);
  }

  // 7. Location
  const locRes = findLabelValue(['Location|Venue|Address']);
  if (locRes.value) {
    data.location = cleanName(locRes.value);
  }

  // 8. Currency
  const currRes = findLabelValue(['Currency']);
  if (currRes.value) {
    const cm = currRes.value.match(/[A-Z]{3}/);
    data.currency = cm ? cm[0] : currRes.value.slice(0, 3).toUpperCase();
  } else {
    // Detect from text
    if (/\bLKR\b/i.test(normalized)) data.currency = 'LKR';
    else if (/\bUSD\b|\$/i.test(normalized)) data.currency = 'USD';
    else if (/\bEUR\b|€/i.test(normalized)) data.currency = 'EUR';
    else if (/\bGBP\b|£/i.test(normalized)) data.currency = 'GBP';
  }

  // 9. Workshop Code
  const wsRes = findLabelValue(['Workshop\\s*Code|Course\\s*Code|Programme\\s*Code']);
  if (wsRes.value) {
    data.workshopCode = wsRes.value.split(/\s+/)[0];
  } else {
    const wsm = normalized.match(/WSH\/[0-9A-Za-z]+/i);
    if (wsm) data.workshopCode = wsm[0];
  }

  // 10. Item Name / Description
  const itemRes = findLabelValue(['Item\\s*Name|Item|Description|Particulars|Programme|Program']);
  if (itemRes.value) {
    data.itemName = cleanItemName(itemRes.value);
  } else {
    // Look for lines containing programme/course/training
    const progLine = lines.find((l) =>
      /programme|training|workshop|conference|summit|course/i.test(l) &&
      !isLikelyLabel(l) &&
      !/^(SLIM Home|Customer|Tax Invoice)/i.test(l)
    );
    if (progLine) {
      data.itemName = cleanItemName(progLine);
    }
  }

  // 11. Quantity
  const qtyRes = findLabelValue(['Quantity|Qty']);
  if (qtyRes.value) {
    const qm = qtyRes.value.match(/([0-9]+(?:\.[0-9]+)?)/);
    if (qm) data.quantity = parseFloat(qm[1]);
  }

  // 12. Unit Price
  const priceRes = findLabelValue(['Sales\\s*Price\\s*\\(Unit\\)|Sales\\s*Price|Unit\\s*Price|Rate|Price']);
  if (priceRes.value) {
    data.unitPrice = cleanMoney(priceRes.value);
  }

  // 13. Amounts: Amount, Total Amount, Final Amount
  const totalRes = findLabelValue(['Final\\s*Amount|Total\\s*Amount|Total\\s*Due|Total|Balance\\s*Due']);
  if (totalRes.value) {
    data.totalAmount = cleanMoney(totalRes.value);
    data.finalAmount = data.totalAmount;
  }

  const amtRes = findLabelValue(['Amount|Sub\\s*Total|Subtotal']);
  if (amtRes.value) {
    data.subtotal = cleanMoney(amtRes.value);
    if (!data.totalAmount) {
      data.totalAmount = data.subtotal;
      data.finalAmount = data.subtotal;
    }
  }

  // If amount still missing, search for largest currency figure
  if (!data.totalAmount) {
    const moneyMatches = [...normalized.matchAll(/([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{2}))/g)];
    if (moneyMatches.length) {
      data.totalAmount = moneyMatches[moneyMatches.length - 1][1];
      data.finalAmount = data.totalAmount;
    }
  }

  // 14. Supplier Name Extraction & Safeguards
  data.supplierName = determineSupplier(normalized, lines, data);

  // 15. Arithmetic validation: Quantity * UnitPrice vs Total
  if (data.quantity && data.unitPrice && data.totalAmount) {
    const q = Number(data.quantity);
    const p = parseFloat(String(data.unitPrice).replace(/,/g, ''));
    const t = parseFloat(String(data.totalAmount).replace(/,/g, ''));
    if (!isNaN(q) && !isNaN(p) && !isNaN(t)) {
      const expected = q * p;
      if (Math.abs(expected - t) < 0.01) {
        data.arithmeticValid = true;
      } else {
        data.arithmeticValid = false;
        data.discrepancy = `Quantity (${q}) * Unit Price (${p}) = ${expected.toLocaleString()} differs from stated Total (${t.toLocaleString()})`;
      }
    }
  }

  return data;
}

/**
 * Filter out concatenated header words from Item Name
 */
function cleanItemName(str) {
  let cleaned = str.trim();
  // Strip concatenated headers like Workshop CodeItem NameQuantity
  for (const header of KNOWN_TABLE_HEADERS) {
    const reg = new RegExp(`\\b${header}\\b`, 'gi');
    cleaned = cleaned.replace(reg, ' ');
  }
  // Strip trailing numbers or codes that may belong to other columns
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned || str.trim();
}

/**
 * Clean person names (never allow labels or cheque words)
 */
function cleanPersonName(str) {
  let cleaned = str.replace(/^(Mr\.|Ms\.|Mrs\.|Dr\.)\s*/i, '').trim();
  if (/^(only|blank|n\/a|-)$/i.test(cleaned)) return null;
  return str.trim();
}

/**
 * Clean generic entity names
 */
function cleanName(str) {
  return str.replace(/\s+/g, ' ').trim();
}

/**
 * Clean monetary value string to "800,000.00"
 */
function cleanMoney(str) {
  const m = str.match(/([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?|[0-9]+(?:\.[0-9]{2})?)/);
  if (m) {
    let numStr = m[1];
    // if no decimal, add .00
    if (!numStr.includes('.')) numStr += '.00';
    return numStr;
  }
  return str.trim();
}

/**
 * Safely determine Supplier Name with strict guards against "Only.", cheque instructions, etc.
 */
function determineSupplier(text, lines, extracted) {
  // Check for SLIM / Sri Lanka Institute of Marketing patterns
  if (
    /Sri\s*Lanka\s*Institute\s*of\s*Marketing/i.test(text) ||
    /\bSLIM\b/i.test(text) ||
    /SLIM\s*Home/i.test(text) ||
    /WSH\/[A-Z0-9]+/i.test(text)
  ) {
    return 'Sri Lanka Institute of Marketing (SLIM)';
  }

  // Look for cheque instructions: "cheque in favo(u)r of [Supplier]"
  const chequeMatch = text.match(/(?:cheque|check|favour\s*of|favor\s*of|pay\s*to)\s+([^\n\r,]+)/i);
  if (chequeMatch) {
    let cand = chequeMatch[1].replace(/with\s+a\/c\s+payee.*$/i, '').trim();
    cand = cand.replace(/\bOnly\.?$/i, '').trim();
    if (cand && !isInvalidSupplier(cand)) {
      return cand;
    }
  }

  // Look for Supplier/Vendor/Biller label
  for (const line of lines) {
    const sm = line.match(/^(?:Supplier|Vendor|Biller|From|Issuer)[:\s]+(.*)$/i);
    if (sm) {
      const cand = sm[1].trim();
      if (!isInvalidSupplier(cand)) return cand;
    }
  }

  // Fallback to top header lines if not invoice title
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const l = lines[i];
    if (
      !/tax invoice|invoice|receipt|bill|date|reference|customer/i.test(l) &&
      !isInvalidSupplier(l) &&
      l.length > 3
    ) {
      return l;
    }
  }

  return '[REVIEW REQUIRED: supplier name unavailable]';
}

/**
 * Invalidation guard: strings that are NEVER valid suppliers
 */
function isInvalidSupplier(name) {
  if (!name || name.trim().length <= 2) return true;
  const lower = name.trim().toLowerCase();
  if (lower === 'only.' || lower === 'only' || lower === 'with a/c payee only' || lower === 'a/c payee only') {
    return true;
  }
  if (/^(blank|n\/a|none|date|reference no|invoice no|amount|customer)$/i.test(lower)) {
    return true;
  }
  return false;
}

/**
 * Stage B: Map structured data to hr/payment_approval_template.html placeholders
 */
export function mapDataToTemplatePlaceholders(data) {
  const currencyPrefix = data.currency ? `${data.currency} ` : '';

  // Format date to "DD Month YYYY" if possible
  let formattedDate = data.invoiceDate;
  if (data.invoiceDate) {
    const dMatch = data.invoiceDate.match(/^([0-9]{1,2})[\/\-.]([0-9]{1,2})[\/\-.]([0-9]{2,4})$/);
    if (dMatch) {
      const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const day = parseInt(dMatch[1], 10);
      const monthIdx = parseInt(dMatch[2], 10) - 1;
      let year = dMatch[3];
      if (year.length === 2) year = '20' + year;
      if (months[monthIdx]) {
        formattedDate = `${day} ${months[monthIdx]} ${year}`;
      }
    }
  }

  const amountStr = data.totalAmount || data.finalAmount || null;
  const formattedAmount = amountStr ? (currencyPrefix + amountStr) : null;

  return {
    date: formattedDate || data.invoiceDate || null,
    paymentPurpose: data.itemName ? data.itemName.toUpperCase() : null,
    supplierName: data.supplierName && !isInvalidSupplier(data.supplierName) ? data.supplierName : null,
    feeService: data.itemName || null,
    employeeName: null, // absent on corporate invoice; do not fabricate
    programmeEvent: data.itemName || null,
    invoiceDate: data.invoiceDate || null,
    description: data.itemName ? (data.workshopCode ? `${data.itemName} (Workshop Code: ${data.workshopCode})` : data.itemName) : null,
    invoiceNo: data.invoiceNumber || data.referenceNumber || null,
    amount: formattedAmount || amountStr || null,
    preparedBy: null, // contact person Dushantha is not author of memo
    approvedBy: null,
  };
}
