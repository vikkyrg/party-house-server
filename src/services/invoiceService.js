const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const appConfig = require('../config/app');

class InvoiceService {
  constructor() {
    this.invoicesDir = path.join(__dirname, '../../invoices');

    if (!fs.existsSync(this.invoicesDir)) {
      fs.mkdirSync(this.invoicesDir, { recursive: true });
    }

    // Resolve Unicode font supporting the Indian Rupee symbol (₹)
    this.regularFontPath = this.resolveFontPath('SegoeUI.ttf');
    this.boldFontPath = this.resolveFontPath('SegoeUI-Bold.ttf');
  }

  resolveFontPath(fileName) {
    const localAssetPath = path.join(__dirname, '../assets/fonts', fileName);
    if (fs.existsSync(localAssetPath)) {
      return localAssetPath;
    }

    const winFontsPath = path.join('C:/Windows/Fonts', fileName.toLowerCase());
    if (fs.existsSync(winFontsPath)) {
      return winFontsPath;
    }

    return null;
  }

  formatCurrency(amount) {
    const num = Number(amount) || 0;
    return `₹${num.toLocaleString('en-IN')}`;
  }

  formatDate(dateInput) {
    if (!dateInput) return '—';
    try {
      return new Date(dateInput).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return String(dateInput);
    }
  }

  /**
   * Generate PDF invoice for booking on a single clean A4 page
   * @param {Object} booking - Booking object with populated theater, room, eventType, addOns
   * @returns {Promise<string>} - Path to generated PDF
   */
  async generateInvoice(booking) {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 36, bottom: 15, left: 30, right: 30 },
        autoFirstPage: true,
      });

      // Register fonts with Rupee glyph support
      if (this.regularFontPath && fs.existsSync(this.regularFontPath)) {
        doc.registerFont('AppFont', this.regularFontPath);
      } else {
        doc.registerFont('AppFont', 'Helvetica');
      }

      if (this.boldFontPath && fs.existsSync(this.boldFontPath)) {
        doc.registerFont('AppFont-Bold', this.boldFontPath);
      } else {
        doc.registerFont('AppFont-Bold', 'Helvetica-Bold');
      }

      const filePath = path.join(this.invoicesDir, `${booking.bookingId || 'booking'}.pdf`);
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      // Render all sections within a compact, single-page layout (A4 height is 841.89 pt)
      let currentY = 36;
      currentY = this.drawHeader(doc, currentY);
      currentY = this.drawBookingAndCustomerDetails(doc, booking, currentY);
      currentY = this.drawPricing(doc, booking, currentY);
      this.drawTermsAndFooter(doc, currentY);

      doc.end();

      await new Promise((resolve, reject) => {
        stream.on('finish', resolve);
        stream.on('error', reject);
      });

      logger.info(`Invoice generated successfully: ${filePath}`);
      return filePath;
    } catch (error) {
      logger.error('Error generating invoice:', error);
      throw new Error('Failed to generate invoice');
    }
  }

  drawHeader(doc, startY) {
    const leftX = 30;
    const rightX = 310;
    const pageWidth = 535; // 595 - 60 (margins: left 30, right 30)

    // Company Header Left Side - RIO PARTY HOUSE
    doc.fillColor('#1a1c21');
    doc.font('AppFont-Bold').fontSize(18).text('RIO PARTY HOUSE', leftX, startY);

    doc.font('AppFont').fontSize(9).fillColor('#4b5563');
    const addressLine1 = '#7, Dinnur Main Road, Ganesh Block, RT Nagar, Bangalore - 560032.';
    const addressLine2 = 'Suzuki Showroom Building, 3rd Floor.';
    const contactLine = 'Contact Number: 81478 97771';

    doc.text(addressLine1, leftX, startY + 22, { width: 300 });
    doc.text(addressLine2, leftX, startY + 34, { width: 300 });
    doc.font('AppFont-Bold').fillColor('#8c5211').text(contactLine, leftX, startY + 46, { width: 300 });

    // Right Side: BOOKING INVOICE title only (removed subtitle and website url)
    doc.font('AppFont-Bold').fontSize(18).fillColor('#8c5211').text('BOOKING INVOICE', rightX, startY + 12, {
      align: 'right',
      width: 255,
    });

    const dividerY = startY + 64;
    doc.strokeColor('#d1d5db').lineWidth(0.8).moveTo(leftX, dividerY).lineTo(leftX + pageWidth, dividerY).stroke();

    return dividerY + 10;
  }

  drawBookingAndCustomerDetails(doc, booking, startY) {
    const leftX = 30;
    const midX = 302;
    const boxWidth = 263;
    const cardHeight = 100;

    // Card 1: Booking Details
    doc.roundedRect(leftX, startY, boxWidth, cardHeight, 6).fillAndStroke('#fcfbf9', '#e5e7eb');
    doc.fillColor('#8c5211').font('AppFont-Bold').fontSize(10).text('RESERVATION DETAILS', leftX + 10, startY + 8);

    doc.font('AppFont').fontSize(8.5).fillColor('#374151');
    let lineY = startY + 24;

    doc.font('AppFont-Bold').text('Booking Ref: ', leftX + 10, lineY, { continued: true });
    doc.font('AppFont').fillColor('#1f2937').text(booking.bookingId || '—');

    lineY += 13;
    doc.font('AppFont-Bold').text('Booking Date: ', leftX + 10, lineY, { continued: true });
    doc.font('AppFont').text(this.formatDate(booking.createdAt));

    lineY += 13;
    doc.font('AppFont-Bold').text('Event Date: ', leftX + 10, lineY, { continued: true });
    doc.font('AppFont').text(this.formatDate(booking.date));

    lineY += 13;
    doc.font('AppFont-Bold').text('Time Slot: ', leftX + 10, lineY, { continued: true });
    doc.font('AppFont').text(booking.timeSlot || '—');

    lineY += 13;
    doc.font('AppFont-Bold').text('Theater & Room: ', leftX + 10, lineY, { continued: true });
    const theaterName = booking.theater?.name || booking.theaterName || 'Rio Party House';
    const roomName = booking.room?.name || booking.roomName || 'Private Room';
    doc.font('AppFont').text(`${theaterName} (${roomName})`, { width: 160, ellipsis: true });

    // Card 2: Customer & Occasion Details
    doc.roundedRect(midX, startY, boxWidth, cardHeight, 6).fillAndStroke('#fcfbf9', '#e5e7eb');
    doc.fillColor('#8c5211').font('AppFont-Bold').fontSize(10).text('CUSTOMER & OCCASION', midX + 10, startY + 8);

    doc.font('AppFont').fontSize(8.5).fillColor('#374151');
    lineY = startY + 24;

    const custName = booking.customerDetails?.name || booking.user?.name || 'Guest';
    const custPhone = booking.customerDetails?.phone || booking.user?.phone || '—';
    const custEmail = booking.customerDetails?.email || booking.user?.email || '—';
    const occasion = booking.eventType?.name || booking.eventTypeName || 'Celebration';

    doc.font('AppFont-Bold').text('Customer: ', midX + 10, lineY, { continued: true });
    doc.font('AppFont').text(custName, { width: 180, ellipsis: true });

    lineY += 13;
    doc.font('AppFont-Bold').text('Phone: ', midX + 10, lineY, { continued: true });
    doc.font('AppFont').text(custPhone);

    lineY += 13;
    doc.font('AppFont-Bold').text('Email: ', midX + 10, lineY, { continued: true });
    doc.font('AppFont').text(custEmail, { width: 190, ellipsis: true });

    lineY += 13;
    doc.font('AppFont-Bold').text('Occasion: ', midX + 10, lineY, { continued: true });
    doc.font('AppFont').text(occasion);

    lineY += 13;
    doc.font('AppFont-Bold').text('Guests: ', midX + 10, lineY, { continued: true });
    doc.font('AppFont').text(`${booking.customerDetails?.members || 1} Guests${booking.customerDetails?.kids ? ` (${booking.customerDetails.kids} Kids)` : ''}`);

    return startY + cardHeight + 12;
  }

  drawPricing(doc, booking, startY) {
    const leftX = 30;
    const tableWidth = 535; // Extended layout width
    const rightColX = 360;
    const rightColWidth = 163; // Increased amount column width with 12px right padding

    const pricing = booking.pricing || {};

    // Pricing Header Bar
    doc.rect(leftX, startY, tableWidth, 20).fill('#8c5211');
    doc.fillColor('#ffffff').font('AppFont-Bold').fontSize(9);
    doc.text('DESCRIPTION / ITEM', leftX + 10, startY + 5);
    doc.text('AMOUNT', rightColX, startY + 5, { align: 'right', width: rightColWidth });

    let currentY = startY + 24;

    const drawRow = (label, amountStr, isBold = false, indent = 10, isHighlight = false) => {
      if (isHighlight) {
        doc.rect(leftX, currentY - 2, tableWidth, 16).fill('#f9fafb');
      }
      doc.font(isBold ? 'AppFont-Bold' : 'AppFont').fontSize(8.5).fillColor(isBold ? '#111827' : '#374151');
      doc.text(label, leftX + indent, currentY, { width: 330 });
      doc.text(amountStr, rightColX, currentY, { align: 'right', width: rightColWidth });
      currentY += 15;
    };

    // 1. Theater / Room Rental
    const theaterPrice = pricing.roomPrice || pricing.theaterPrice || 0;
    const durationLabel = booking.timeSlot ? ` (${booking.timeSlot})` : '';
    drawRow(`Theater & Private Room Reservation${durationLabel}`, this.formatCurrency(theaterPrice));

    // 2. Selected Cake (if any)
    if (booking.cake || booking.cakeDetails || pricing.cakePrice > 0) {
      const cakeName = booking.cakeDetails?.name || booking.cake?.name || 'Celebration Cake';
      const cakeSize = booking.cakeDetails?.sizeLabel || booking.cakeDetails?.size || '';
      drawRow(`Cake: ${cakeName}${cakeSize ? ` (${cakeSize})` : ''}`, this.formatCurrency(pricing.cakePrice || 0));
    }

    // 3. Add-ons breakdown
    if (booking.addOns && booking.addOns.length > 0) {
      booking.addOns.forEach((addon) => {
        const addonName = addon.name || addon.addOn?.name || addon.variantName || 'Custom Add-on';
        const qty = addon.quantity || 1;
        const totalAddonPrice = (addon.price || 0) * qty;
        drawRow(`Add-on: ${addonName} x ${qty}`, this.formatCurrency(totalAddonPrice), false, 16);
      });
    }

    // 4. Discount (if any)
    if (pricing.discount > 0) {
      drawRow(`Discount (${pricing.discountCode || 'Promo'})`, `-${this.formatCurrency(pricing.discount)}`, false, 10, true);
    }

    // Subtle divider
    doc.strokeColor('#e5e7eb').lineWidth(0.6).moveTo(leftX, currentY).lineTo(leftX + tableWidth, currentY).stroke();
    currentY += 4;

    // Subtotal and Total Booking Value (WITHOUT GST / TAX)
    const actualSubtotal = pricing.subtotal || pricing.total || 0;
    drawRow('Subtotal (Tax Exempt / Net)', this.formatCurrency(actualSubtotal), true);

    const actualTotal = pricing.total || actualSubtotal;
    currentY += 2;
    doc.rect(leftX, currentY - 2, tableWidth, 18).fill('#f4ede4');
    doc.font('AppFont-Bold').fontSize(9.5).fillColor('#1f2937');
    doc.text('TOTAL BOOKING VALUE', leftX + 10, currentY + 2);
    doc.text(this.formatCurrency(actualTotal), rightColX, currentY + 2, { align: 'right', width: rightColWidth });
    currentY += 22;

    // Advance Payment Received & Remaining Balance Due
    const isPaid = booking.payment?.status === 'paid';
    const advancePaid = isPaid ? (booking.payment.amountPaid || pricing.advanceAmount || 750) : 0;
    const remainingBalance = actualTotal > advancePaid ? actualTotal - advancePaid : 0;

    doc.rect(leftX, currentY - 2, tableWidth, 38).fillAndStroke('#fcfbf9', '#e5e7eb');

    doc.font('AppFont-Bold').fontSize(8.5).fillColor('#065f46');
    doc.text('Advance Amount Received:', leftX + 10, currentY + 4);
    doc.text(this.formatCurrency(advancePaid), rightColX, currentY + 4, { align: 'right', width: rightColWidth });

    doc.font('AppFont-Bold').fontSize(9).fillColor('#92400e');
    doc.text('Remaining Balance Due at Venue:', leftX + 10, currentY + 20);
    doc.text(this.formatCurrency(remainingBalance), rightColX, currentY + 20, { align: 'right', width: rightColWidth });

    currentY += 46;

    // Payment & UPI Transaction Reference Box
    doc.roundedRect(leftX, currentY, tableWidth, 26, 4).fillAndStroke('#ffffff', '#e5e7eb');
    doc.font('AppFont-Bold').fontSize(8).fillColor('#374151');
    const paymentStatusText = (booking.payment?.status || 'pending').toUpperCase();
    const upiRefText = booking.payment?.upiTransactionId ? ` | UPI Ref / UTR: ${booking.payment.upiTransactionId}` : '';
    doc.text(`Payment Status: ${paymentStatusText}${upiRefText}`, leftX + 10, currentY + 8);

    return currentY + 32;
  }

  drawTermsAndFooter(doc, startY) {
    const leftX = 30;
    const tableWidth = 535;

    // Terms & Conditions Header
    doc.font('AppFont-Bold').fontSize(8.5).fillColor('#8c5211').text('TERMS & CONDITIONS', leftX, startY);

    const terms = [
      '1. Please arrive at the venue 15 minutes prior to your scheduled time slot.',
      '2. Slot reservation advance is non-refundable unless cancelled at least 48 hours prior to the show time.',
      '3. Outside food and beverages are strictly not permitted inside the theater rooms.',
      '4. Any balance payment is payable at the venue upon check-in via Cash, UPI, or Card.',
      '5. For any booking queries or support, reach us on WhatsApp/Call: 81478 97771.',
    ];

    doc.font('AppFont').fontSize(7.5).fillColor('#4b5563');
    let termY = startY + 12;
    terms.forEach((term) => {
      doc.text(term, leftX, termY, { width: tableWidth, lineGap: 1 });
      termY += 10;
    });

    // Clean single-page footer at bottom
    const footerY = 780; // A4 height is 841.89 pt (margins: top 36, bottom 15)
    doc.strokeColor('#e5e7eb').lineWidth(0.6).moveTo(leftX, footerY - 8).lineTo(leftX + tableWidth, footerY - 8).stroke();

    doc.font('AppFont-Bold').fontSize(8).fillColor('#8c5211').text(
      'Thank you for celebrating with RIO PARTY HOUSE!',
      leftX,
      footerY,
      { align: 'center', width: tableWidth, lineBreak: false }
    );
    doc.font('AppFont').fontSize(7).fillColor('#9ca3af').text(
      'This is a computer-generated invoice and requires no physical signature.',
      leftX,
      footerY + 11,
      { align: 'center', width: tableWidth, lineBreak: false }
    );
  }
}

module.exports = new InvoiceService();
