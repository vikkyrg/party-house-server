const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const appConfig = require('../config/app');

class InvoiceService {
  constructor() {
    this.invoicesDir = path.join(__dirname, '../../invoices');

    // Create invoices directory if it doesn't exist
    if (!fs.existsSync(this.invoicesDir)) {
      fs.mkdirSync(this.invoicesDir, { recursive: true });
    }
  }

  /**
   * Generate PDF invoice for booking
   * @param {Object} booking - Booking object with populated theater, eventType, addOns
   * @returns {Promise<string>} - Path to generated PDF
   */
  async generateInvoice(booking) {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const filePath = path.join(this.invoicesDir, `${booking.bookingId}.pdf`);
      const stream = fs.createWriteStream(filePath);

      doc.pipe(stream);

      // Header
      this.drawHeader(doc);

      // Booking details
      this.drawBookingDetails(doc, booking);

      // Pricing breakdown
      this.drawPricing(doc, booking);

      // Terms and conditions
      this.drawTerms(doc);

      // Footer
      this.drawFooter(doc);

      doc.end();

      // Wait for file to be written
      await new Promise((resolve, reject) => {
        stream.on('finish', resolve);
        stream.on('error', reject);
      });

      logger.info(`Invoice generated: ${filePath}`);
      return filePath;
    } catch (error) {
      logger.error('Error generating invoice:', error);
      throw new Error('Failed to generate invoice');
    }
  }

  drawHeader(doc) {
    // Logo/Company name
    doc.fontSize(24).font('Helvetica-Bold').text(appConfig.brandName, 50, 50, { align: 'center' });

    doc
      .fontSize(12)
      .font('Helvetica')
      .text('Private Theater Celebrations', 50, 75, { align: 'center' });

    doc
      .fontSize(10)
      .text(`${appConfig.websiteUrl} | ${appConfig.supportEmail}`, 50, 90, { align: 'center' });

    // Invoice title
    doc.fontSize(18).font('Helvetica-Bold').text('BOOKING INVOICE', 50, 120, { align: 'center' });

    // Line
    doc.moveTo(50, 135).lineTo(550, 135).stroke();
  }

  drawBookingDetails(doc, booking) {
    doc.fontSize(14).font('Helvetica-Bold').text('Booking Details', 50, 160);

    doc
      .fontSize(11)
      .font('Helvetica')
      .text(`Booking ID: ${booking.bookingId}`, 50, 185)
      .text(`Booking Date: ${new Date(booking.createdAt).toLocaleDateString('en-IN')}`, 50, 200)
      .text(`Event Date: ${new Date(booking.date).toLocaleDateString('en-IN')}`, 50, 215)
      .text(`Time Slot: ${booking.timeSlot}`, 50, 230);

    doc
      .font('Helvetica-Bold')
      .text('Theater:', 50, 255)
      .font('Helvetica')
      .text(`${booking.theater.name}`, 120, 255);

    doc
      .font('Helvetica-Bold')
      .text('Location:', 50, 270)
      .font('Helvetica')
      .text(`${booking.theater.address}`, 120, 270);

    doc
      .font('Helvetica-Bold')
      .text('Event Type:', 50, 295)
      .font('Helvetica')
      .text(`${booking.eventType.name}`, 120, 295);

    doc
      .font('Helvetica-Bold')
      .text('Customer:', 50, 320)
      .font('Helvetica')
      .text(`${booking.customerDetails.name}`, 120, 320)
      .text(`${booking.customerDetails.phone}`, 120, 335)
      .text(`${booking.customerDetails.email}`, 120, 350);
  }

  drawPricing(doc, booking) {
    const y = 390;

    doc.fontSize(14).font('Helvetica-Bold').text('Pricing Details', 50, y);

    let currentY = y + 25;

    // Theater price
    doc
      .font('Helvetica')
      .fontSize(11)
      .text('Theater Rental', 50, currentY)
      .text(`₹${booking.pricing.theaterPrice}`, 400, currentY, { align: 'right' });

    currentY += 20;

    // Add-ons
    if (booking.addOns && booking.addOns.length > 0) {
      doc.font('Helvetica-Bold').text('Add-ons:', 50, currentY);
      currentY += 15;

      booking.addOns.forEach((addon, _index) => {
        doc
          .font('Helvetica')
          .text(`• ${addon.addOn.name} x ${addon.quantity}`, 60, currentY)
          .text(`₹${addon.price * addon.quantity}`, 400, currentY, { align: 'right' });
        currentY += 18;
      });
    }

    currentY += 10;

    // Subtotal
    doc
      .font('Helvetica-Bold')
      .text('Subtotal', 50, currentY)
      .text(`₹${booking.pricing.subtotal}`, 400, currentY, { align: 'right' });

    currentY += 20;

    // Tax
    doc
      .font('Helvetica')
      .text('GST (18%)', 50, currentY)
      .text(`₹${booking.pricing.tax}`, 400, currentY, { align: 'right' });

    currentY += 20;

    // Discount
    if (booking.pricing.discount > 0) {
      doc
        .font('Helvetica')
        .text(`Discount (${booking.pricing.discountCode || 'Promo'})`, 50, currentY)
        .text(`-₹${booking.pricing.discount}`, 400, currentY, { align: 'right' });
      currentY += 20;
    }

    // Total
    doc.moveTo(50, currentY).lineTo(550, currentY).stroke();

    currentY += 25;

    doc
      .fontSize(16)
      .font('Helvetica-Bold')
      .text('TOTAL', 50, currentY)
      .text(`₹${booking.pricing.total}`, 400, currentY, { align: 'right' });

    currentY += 30;

    // Payment status
    doc
      .fontSize(11)
      .font('Helvetica')
      .text(`Payment Status: ${booking.payment.status.toUpperCase()}`, 50, currentY);

    if (booking.payment.razorpayPaymentId) {
      doc.text(`Transaction ID: ${booking.payment.razorpayPaymentId}`, 50, currentY + 15);
    }
  }

  drawTerms(doc) {
    const y = 650;

    doc.fontSize(10).font('Helvetica-Bold').text('Terms & Conditions:', 50, y);

    doc
      .font('Helvetica')
      .fontSize(9)
      .text('• Booking is non-refundable unless cancelled 48 hours before the event', 50, y + 15)
      .text('• Please arrive 15 minutes before your scheduled time slot', 50, y + 28)
      .text('• Outside food and beverages are not allowed', 50, y + 41)
      .text(`• For any queries, contact us at ${appConfig.supportEmail}`, 50, y + 54);
  }

  drawFooter(doc) {
    doc
      .fontSize(8)
      .font('Helvetica')
      .text(`Thank you for choosing ${appConfig.brandName}!`, 50, 750, { align: 'center' })
      .text('Page 1 of 1', 50, 765, { align: 'center' });
  }
}

module.exports = new InvoiceService();
