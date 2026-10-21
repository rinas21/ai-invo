import { extractInvoiceData, mapDataToTemplatePlaceholders, normalizePdfText } from './invoiceParser.js';

// Sample invoice text as extracted from PDF
const sampleInvoiceRawText = `
TAX INVOICE
Reference No: WSH/HK/066
Date: 12/10/2026
Manual No: [blank]
Contact Person: Dushantha
Order No: [blank]
Tel No.: +94 702999927
Customer: Citizens Development Business Finance PLC
Location: SLIM Home
Currency: LKR
Workshop CodeItem NameQuantitySales Price (Unit)Amount
Workshop Code: WSH/2456
Item Name: NextGen Sales Leadership Programme
Quantity: 40
Sales Price (Unit): 20,000.00
Amount: 800,000.00
Total Amount: 800,000.00
Final Amount: 800,000.00
Cheque in favour of Sri Lanka Institute of Marketing With A/C Payee Only.
`;

function assert(condition, message) {
  if (!condition) {
    throw new Error('Assertion failed: ' + message);
  }
}

export function runInvoiceTests() {
  console.log('Running Invoice Extraction Regression Tests...\n');

  const data = extractInvoiceData(sampleInvoiceRawText);

  // 1. Invoice Date
  assert(data.invoiceDate === '12/10/2026', `Expected invoiceDate '12/10/2026', got '${data.invoiceDate}'`);
  console.log('✓ 1. Invoice date correctly extracted as 12/10/2026');

  // 2. Reference Number
  assert(data.referenceNumber === 'WSH/HK/066', `Expected referenceNumber 'WSH/HK/066', got '${data.referenceNumber}'`);
  console.log('✓ 2. Reference number correctly extracted as WSH/HK/066');

  // 3. Workshop Code
  assert(data.workshopCode === 'WSH/2456', `Expected workshopCode 'WSH/2456', got '${data.workshopCode}'`);
  console.log('✓ 3. Workshop code correctly extracted as WSH/2456');

  // 4. Item Name
  assert(
    data.itemName === 'NextGen Sales Leadership Programme',
    `Expected itemName 'NextGen Sales Leadership Programme', got '${data.itemName}'`
  );
  console.log('✓ 4. Item name correctly extracted without merged column headers');

  // 5. Quantity
  assert(data.quantity === 40, `Expected quantity 40, got '${data.quantity}'`);
  console.log('✓ 5. Quantity correctly extracted as 40');

  // 6. Unit Price
  assert(data.unitPrice === '20,000.00', `Expected unitPrice '20,000.00', got '${data.unitPrice}'`);
  console.log('✓ 6. Unit price correctly extracted as 20,000.00');

  // 7. Total Amount
  assert(data.totalAmount === '800,000.00', `Expected totalAmount '800,000.00', got '${data.totalAmount}'`);
  console.log('✓ 7. Total amount correctly extracted as 800,000.00');

  // 8. Contact Person
  assert(data.contactPerson === 'Dushantha', `Expected contactPerson 'Dushantha', got '${data.contactPerson}'`);
  console.log('✓ 8. Contact person correctly extracted as Dushantha');

  // 9. Supplier Name Guard
  assert(data.supplierName !== 'Only.', `Supplier name must not be 'Only.', got '${data.supplierName}'`);
  assert(
    data.supplierName === 'Sri Lanka Institute of Marketing (SLIM)',
    `Expected supplier 'Sri Lanka Institute of Marketing (SLIM)', got '${data.supplierName}'`
  );
  console.log('✓ 9. Supplier name correctly identified as Sri Lanka Institute of Marketing (SLIM) and never "Only."');

  // 10. Header Pollution Guard
  assert(
    !data.itemName.includes('Workshop CodeItem NameQuantity'),
    'Item name must not contain concatenated headers'
  );
  console.log('✓ 10. Concatenated headers correctly rejected');

  // 11. Arithmetic Validation
  assert(data.arithmeticValid === true, 'Arithmetic validation 40 * 20,000.00 === 800,000.00 should pass');
  console.log('✓ 11. Arithmetic validation 40 * 20,000.00 = 800,000.00 verified');

  // 12. Template Mapping Test
  const mapped = mapDataToTemplatePlaceholders(data);
  assert(!mapped.date.includes('unavailable'), `Date must not be unavailable, got '${mapped.date}'`);
  assert(mapped.invoiceNo === 'WSH/HK/066', `Invoice No in template should be 'WSH/HK/066', got '${mapped.invoiceNo}'`);
  assert(mapped.amount === 'LKR 800,000.00' || mapped.amount === '800,000.00', `Amount should be 800,000.00, got '${mapped.amount}'`);
  assert(mapped.employeeName === null, 'Employee name should be null (not set to Dushantha who is contact person)');
  console.log('✓ 12. Template mappings verified: all required fields present, employee name not fabricated');

  console.log('\nAll 12 regression tests passed successfully!');
}

if (process.argv[1]?.endsWith('invoiceParser.test.js')) {
  runInvoiceTests();
}
