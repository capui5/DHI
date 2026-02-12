const cds = require('@sap/cds');
const nodemailer = require('nodemailer');
const cron = require('node-cron');

// ANS Webhook - registered before CDS middleware (no auth required)
cds.on('bootstrap', (app) => {
  const express = require('express');
  app.use('/contracts/ansWebhook', express.json());

  app.post('/contracts/ansWebhook', async (req, res) => {
    const { recipientEmail, subject, body, contractId, contractName, daysRemaining, startDate, expiryDate } = req.body;

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
});

// ─── Scheduled Contract Expiry Check ───
const DAYS_THRESHOLD = 30;

function getDaysUntilExpiry(expiryDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);
  return Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

async function sendContractAlertToANS(contract, daysRemaining) {
  const { executeHttpRequest } = require('@sap-cloud-sdk/http-client');
  const recipientEmail = contract.company?.AdminName;

  if (!recipientEmail) {
    console.warn(`No admin email found for contract ${contract.contract_id || contract.ID} (company: ${contract.company_CompanyCode}) - skipping`);
    return false;
  }

  const alertPayload = {
    eventType: "contractExpiryWarning",
    eventTimestamp: Math.floor(Date.now() / 1000),
    severity: daysRemaining <= 7 ? "ERROR" : daysRemaining <= 15 ? "WARNING" : "INFO",
    category: "ALERT",
    subject: `Contract "${contract.name}" expires in ${daysRemaining} days`,
    body: `Dear User,

This is an automated notification to inform you that the following contract is expiring soon:

Contract ID: ${contract.contract_id || contract.ID}
Contract Name: ${contract.name}
Description: ${contract.description || 'N/A'}
Alias: ${contract.alias || 'N/A'}
Start Date: ${formatDate(contract.start_date)}
Expiry Date: ${formatDate(contract.end_date)}
Days Remaining: ${daysRemaining}
Status: ${contract.status || 'N/A'}
Template: ${contract.templates?.name || 'N/A'}

Please take necessary action before the expiry date.

Best regards,
DHI Contract Management System`,
    resource: {
      resourceName: String(contract.contract_id || contract.ID),
      resourceType: "contract",
      tags: { recipientEmail: recipientEmail }
    },
    tags: {
      contractId: String(contract.contract_id || contract.ID),
      contractName: String(contract.name),
      daysRemaining: String(daysRemaining),
      startDate: String(contract.start_date || ''),
      expiryDate: String(contract.end_date),
      recipientEmail: recipientEmail
    }
  };

  try {
    const response = await executeHttpRequest(
      { destinationName: 'ALERT_NOTIFICATION' },
      {
        method: 'post',
        url: '/cf/producer/v1/resource-events',
        data: alertPayload,
        headers: { 'Content-Type': 'application/json' }
      },
      { fetchCsrfToken: false }
    );
    console.log(`Alert sent for contract ${contract.contract_id || contract.ID} to ${recipientEmail}:`, response.status);
    return true;
  } catch (err) {
    console.error(`Failed to send alert for contract ${contract.contract_id || contract.ID}:`, err.message);
    if (err.response) {
      console.error('Response data:', JSON.stringify(err.response.data));
    }
    return false;
  }
}

async function runScheduledExpiryCheck() {
  console.log(`[${new Date().toISOString()}] Running scheduled contract expiry check...`);
  try {
    const { Contracts } = cds.entities('com.dhi.cms');
    const contracts = await SELECT.from(Contracts, c => {
      c('*'),
      c.templates(t => { t.name, t.AssignedTo }),
      c.company(co => { co.CompanyCode, co.CompanyName, co.AdminName, co.AdminId })
    }).where({ end_date: { '!=': null } });

    console.log(`Scheduled check: Found ${contracts.length} contracts with expiry dates`);
    let sent = 0, failed = 0;

    for (const contract of contracts) {
      const daysUntilExpiry = getDaysUntilExpiry(contract.end_date);
      if (daysUntilExpiry > 0 && daysUntilExpiry <= DAYS_THRESHOLD) {
        console.log(`Contract ${contract.contract_id || contract.ID} expires in ${daysUntilExpiry} days`);
        const result = await sendContractAlertToANS(contract, daysUntilExpiry);
        if (result) sent++; else failed++;
      }
    }
    console.log(`Scheduled check completed. Sent: ${sent}, Failed: ${failed}`);
  } catch (err) {
    console.error('Scheduled expiry check failed:', err.message);
  }
}

cds.on('served', () => {
  // Schedule contract expiry check at 10:00 AM IST every day
  cron.schedule('0 10 * * *', () => {
    console.log(`[${new Date().toISOString()}] Cron triggered: 10:00 AM IST contract expiry check`);
    runScheduledExpiryCheck();
  }, { timezone: 'Asia/Kolkata' });

  console.log('Contract expiry scheduler started. Runs daily at 10:00 AM IST.');
});

module.exports = cds.server;
