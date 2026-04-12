import PDFDocument from 'pdfkit';

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Generate a one-page certificate PDF as a Buffer.
 * @param {string} contestTitle
 * @param {string} winnerName
 * @param {number} rank
 * @param {string} completedAt  ISO date string
 * @returns {Promise<Buffer>}
 */
export function generateCertificate(contestTitle, winnerName, rank, completedAt) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 72 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end',  () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth  = doc.page.width;
    const pageHeight = doc.page.height;
    const midX       = pageWidth / 2;

    // ── Border ────────────────────────────────────────────────────────────────
    doc.rect(36, 36, pageWidth - 72, pageHeight - 72).lineWidth(2).stroke('#1a1a2e');

    // ── Header ────────────────────────────────────────────────────────────────
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#6c63ff')
      .text('KIKOOAI', midX - 40, 80, { width: 80, align: 'center' });

    doc
      .font('Helvetica-Bold')
      .fontSize(28)
      .fillColor('#1a1a2e')
      .text('Certificate of Achievement', 72, 120, { width: pageWidth - 144, align: 'center' });

    // ── Divider ───────────────────────────────────────────────────────────────
    doc
      .moveTo(120, 172)
      .lineTo(pageWidth - 120, 172)
      .lineWidth(1)
      .stroke('#6c63ff');

    // ── Body copy ────────────────────────────────────────────────────────────
    doc
      .font('Helvetica')
      .fontSize(13)
      .fillColor('#444')
      .text('This certificate is proudly presented to', 72, 200, {
        width: pageWidth - 144,
        align: 'center',
      });

    // ── Winner name ───────────────────────────────────────────────────────────
    doc
      .font('Helvetica-Bold')
      .fontSize(36)
      .fillColor('#1a1a2e')
      .text(winnerName, 72, 232, { width: pageWidth - 144, align: 'center' });

    // ── Rank line ────────────────────────────────────────────────────────────
    doc
      .font('Helvetica')
      .fontSize(14)
      .fillColor('#444')
      .text(
        `for achieving ${ordinal(rank)} Place in`,
        72,
        296,
        { width: pageWidth - 144, align: 'center' }
      );

    // ── Contest title ─────────────────────────────────────────────────────────
    doc
      .font('Helvetica-Bold')
      .fontSize(20)
      .fillColor('#6c63ff')
      .text(contestTitle, 72, 322, { width: pageWidth - 144, align: 'center' });

    // ── Date ──────────────────────────────────────────────────────────────────
    const dateStr = new Date(completedAt).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric',
    });

    doc
      .font('Helvetica')
      .fontSize(12)
      .fillColor('#888')
      .text(`Completed on ${dateStr}`, 72, 380, {
        width: pageWidth - 144,
        align: 'center',
      });

    // ── Bottom divider ────────────────────────────────────────────────────────
    doc
      .moveTo(120, pageHeight - 120)
      .lineTo(pageWidth - 120, pageHeight - 120)
      .lineWidth(1)
      .stroke('#6c63ff');

    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#aaa')
      .text('Issued by Kikooai — Language Learning Platform', 72, pageHeight - 106, {
        width: pageWidth - 144,
        align: 'center',
      });

    doc.end();
  });
}
