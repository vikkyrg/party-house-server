const path = require('path');
const fs = require('fs');
const handlebars = require('handlebars');
const { createTransporter } = require('../config/email');
const logger = require('../utils/logger');
const appConfig = require('../config/app');

const sendEmail = async (options) => {
  const { to, subject, template, data, html: htmlContent } = options;
  const transporter = createTransporter();

  if (!transporter) {
    logger.warn(`Email not sent (SMTP not configured): ${subject} -> ${to}`);
    return;
  }

  let html = htmlContent;

  if (template) {
    const templatePath = path.join(__dirname, '../templates', `${template}.hbs`);
    if (fs.existsSync(templatePath)) {
      const templateSource = fs.readFileSync(templatePath, 'utf8');
      const compiledTemplate = handlebars.compile(templateSource);
      // Convert mongoose docs to plain object to avoid Handlebars prototype access error
      const plainData = data ? JSON.parse(JSON.stringify(data)) : {};
      html = compiledTemplate({ ...plainData, appConfig });
    }
  }

  const mailOptions = {
    from: `"${appConfig.brandName}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
    to,
    subject,
    html,
  };

  await transporter.sendMail(mailOptions);
  logger.info(`Email sent: ${subject} -> ${to}`);
};

module.exports = { sendEmail };
