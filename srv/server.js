const cds = require('@sap/cds');
const nodemailer = require('nodemailer');

// ANS Webhook + Job Scheduler endpoint - registered before CDS middleware
cds.on('bootstrap', (app) => {
  const express = require('express');

  // ─── ANS Webhook (unauthenticated) ───
  app.use('/contracts/ansWebhook', express.json());

  app.post('/contracts/ansWebhook', async (req, res) => {
    // ANS delivers the full event object - extract fields from tags and body
    const tags = req.body.tags || {};
    const recipientEmail = tags.recipientEmail || req.body.recipientEmail;
    const contractId = tags.contractId || req.body.contractId;
    const contractName = tags.contractName || req.body.contractName;
    const daysRemaining = tags.daysRemaining || req.body.daysRemaining;
    const startDate = tags.startDate || req.body.startDate;
    const expiryDate = tags.expiryDate || req.body.expiryDate;
    const subject = req.body.subject;
    const body = req.body.body;

    console.log(`ANS Webhook triggered - sending email to: ${recipientEmail}`);

    if (!recipientEmail) {
      return res.status(400).json({ error: 'Recipient email is required' });
    }

    try {
      const { getDestination } = require('@sap-cloud-sdk/connectivity');
      const destination = await getDestination({ destinationName: 'Mail_Destination' });

      if (!destination) {
        console.error('Mail_Destination not found in BTP destination service');
        return res.status(500).json({ error: 'Mail destination not configured' });
      }

      const props = destination.originalProperties || {};
      const smtpHost = props['mail.smtp.host'];
      const smtpPort = props['mail.smtp.port'] || '587';
      const smtpUser = props['mail.user'];
      const smtpPassword = props['mail.password'];
      const smtpFrom = props['mail.smtp.from'] || smtpUser;

      if (!smtpHost || !smtpUser || !smtpPassword) {
        console.error(`Mail_Destination missing - host:${!!smtpHost} user:${!!smtpUser} pass:${!!smtpPassword}`);
        return res.status(500).json({ error: 'Incomplete mail destination configuration' });
      }

      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(smtpPort),
        secure: props['mail.smtp.ssl.enable'] === 'true',
        auth: { user: smtpUser, pass: smtpPassword },
        tls: {
          rejectUnauthorized: props['mail.smtp.ssl.checkserveridentity'] !== 'false'
        }
      });

      const emailSubject = subject || `Contract "${contractName}" expires in ${daysRemaining} days`;
      const emailBody = body || `Dear Team,

This is an automated notification to inform you that the following contract is expiring soon:

Contract ID: ${contractId || 'N/A'}
Contract Name: ${contractName || 'N/A'}
Start Date: ${startDate || 'N/A'}
Expiry Date: ${expiryDate || 'N/A'}
Days Remaining: ${daysRemaining || 'N/A'}

Please take necessary action before the expiry date.

Best regards,
DHI Contract Management System`;

      const result = await transporter.sendMail({
        from: smtpFrom,
        to: recipientEmail,
        subject: emailSubject,
        text: emailBody
      });

      console.log(`Email sent to ${recipientEmail}: ${result.messageId}`);
      res.status(200).json({ success: true, messageId: result.messageId });
    } catch (err) {
      console.error('Failed to send email:', err.message);
      res.status(500).json({ error: 'Failed to send email: ' + err.message });
    }
  });

  console.log('ANS Webhook registered at POST /contracts/ansWebhook (unauthenticated)');

  // ─── SAP Job Scheduler Endpoint ───
  app.use('/scheduler/expiryCheck', express.json());

  app.put('/scheduler/expiryCheck', async (req, res) => {
    console.log(`[${new Date().toISOString()}] Job Scheduler triggered: contract expiry check`);
    try {
      const tx = cds.tx({ user: new cds.User.Privileged() });
      const srv = await cds.connect.to('ContractService');
      const result = await srv.tx(tx).send('checkExpiryNotifications');
      console.log(`[${new Date().toISOString()}] Job Scheduler expiry check completed`);
      res.status(200).json({ success: true, result });
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Job Scheduler expiry check failed:`, err.message, err.stack);
      res.status(500).json({ error: err.message });
    }
  });

  console.log('Job Scheduler endpoint registered at PUT /scheduler/expiryCheck');
});

module.exports = cds.server;
