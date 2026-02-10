const cds = require('@sap/cds')
const axios = require('axios')
const nodemailer = require('nodemailer')

module.exports = async function () {
  const { Templates, Contracts } = this.entities;
  const { executeHttpRequest } = require('@sap-cloud-sdk/http-client');

  // ─── Configuration ───
  const DAYS_THRESHOLD = 30;

  // ─── User Info endpoint ───
  this.on('getUserInfo', async (req) => {
    const allRoles = ['DHI_Admin', 'DHI_PowerUser', 'Company_Admin', 'Company_Editor', 'Company_Viewer', 'Auditor'];
    const roles = allRoles.map(role => ({
      role: role,
      allowed: req.user.is(role)
    }));
    // Get email from JWT token - try multiple sources
    let userEmail = req.user.id;
    try {
      // Try to get email from token info (XSUAA JWT payload)
      const tokenInfo = req.user.tokenInfo;
      if (tokenInfo) {
        const payload = tokenInfo.getPayload();
        userEmail = payload.email || payload.mail || payload.user_name || req.user.id;
        console.log("getUserInfo - JWT payload keys:", Object.keys(payload).join(', '));
      } else if (req.user.attr && req.user.attr.email) {
        userEmail = req.user.attr.email;
      }
    } catch (e) {
      console.log("getUserInfo - error reading token:", e.message);
    }
    console.log("getUserInfo - user.id:", req.user.id, "resolved email:", userEmail);
    return {
      user: userEmail,
      roles: roles
    };
  });

  this.on('getGroupAssociatedTemplates', async (req) => {
    const prQuery = `SELECT
        "ID",
        "ATTRIBUTE_GROUP_ID",
        "NAME",
        "DESC",
        "ALIAS",
        STRING_AGG("TEMPLATE_NAME", ', ') AS "TEMPLATE_NAME"
      FROM "COM_DHI_CMS_ATTRIBUTEGROUPCATALOGUE"
      GROUP BY
        "ID",
        "ATTRIBUTE_GROUP_ID",
        "NAME",
        "DESC",
        "ALIAS"
      ORDER BY "ATTRIBUTE_GROUP_ID" DESC`;

    const grpTemplates = await cds.run(prQuery);
    return grpTemplates;
  });

  // ─── Unique name validations ───
  this.before(['CREATE', 'UPDATE'], 'Attributes', async (req) => {
    const { name, ID } = req.data;
    if (!name) return;
    const where = ID ? { name, ID: { '!=': ID } } : { name };
    const existing = await SELECT.one.from('com.dhi.cms.Attributes').where(where);
    if (existing) return req.reject(400, 'Unique constraint violated: Attribute name must be unique.');
  });

  this.before(['CREATE', 'UPDATE'], 'Attribute_Groups', async (req) => {
    const { name, ID } = req.data;
    if (!name) return;
    const where = ID ? { name, ID: { '!=': ID } } : { name };
    const existing = await SELECT.one.from('com.dhi.cms.Attribute_Groups').where(where);
    if (existing) return req.reject(400, 'Unique constraint violated: Attribute group name must be unique.');
  });

  this.before(['CREATE', 'UPDATE'], 'Templates', async (req) => {
    const { name, ID } = req.data;
    if (!name) return;
    const where = ID ? { name, ID: { '!=': ID } } : { name };
    const existing = await SELECT.one.from('com.dhi.cms.Templates').where(where);
    if (existing) return req.reject(400, 'Unique constraint violated: Template name must be unique.');
  });

  // ─── Workflow Helpers ───
  async function getTaskProcessor(templateId) {
    try {
      const instancesRes = await executeHttpRequest(
        { destinationName: 'SBPA_API' },
        {
          method: 'GET',
          url: '/public/workflow/rest/v1/workflow-instances',
          params: { 'context.id': templateId },
          headers: { 'Content-Type': 'application/json' }
        }
      );

      if (instancesRes.data && instancesRes.data.length > 0) {
        const workflowInstanceId = instancesRes.data[0].id;
        const tasksRes = await executeHttpRequest(
          { destinationName: 'SBPA_API' },
          {
            method: 'GET',
            url: `/public/workflow/rest/v1/task-instances?workflowInstanceId=${workflowInstanceId}&status=COMPLETED`,
            headers: { 'Content-Type': 'application/json' }
          }
        );

        if (tasksRes.data && tasksRes.data.length > 0) {
          const latestTask = tasksRes.data[tasksRes.data.length - 1];
          return latestTask.processor || latestTask.completedBy || latestTask.createdBy;
        }
      }
    } catch (err) {
      console.error('Failed to get task processor:', err.message);
    }
    return null;
  }

  function mapTemplateToWorkflowPayload(template) {
    const firstTG = template.attribute_groups?.[0];
    const group = firstTG?.attribute_groups || {};

    return {
      definitionId:
        'ap11.dhi-alm-cloud-mwwpt8sk.dhitemplateapprovalform.template_approval_process',
      context: {
        template_id: template.template_id ?? template.ID,
        _name: template.name ?? '',
        Status: template.Status ?? '',
        AssignedTo: template.AssignedTo ?? '',
        ID: template.ID ?? '',
        attribute_groups: {
          attribute_group_id: group.attribute_group_id || group.ID || '',
          name: group.name ?? '',
          desc: group.desc ?? '',
          attributes: (group.attributes || []).map(ga => {
            const attr = ga.attribute || {};
            return {
              attribute_id: attr.attribute_id ?? '',
              name: attr.name ?? '',
              desc: attr.desc ?? '',
              alias: attr.alias ?? '',
              type: attr.type ?? '',
              value: attr.value ?? '',
              is_mandatory: attr.is_mandatory ?? false,
              maxlength: attr.maxlength ?? null,
              minlength: attr.minlength ?? null
            };
          })
        }
      }
    };
  }

  // ─── Template Workflow Actions ───
  this.on('submitTemplate', async (req) => {
    const { template } = req.data;
    const templateDetails = await cds.run(
      SELECT.one.from('com.dhi.cms.Templates')
        .where({ ID: template.ID })
        .columns(t => {
          t.ID,
            t.template_id,
            t.name,
            t.Status,
            t.AssignedTo,
            t.attribute_groups(ag => {
              ag.sortID,
                ag.attribute_groups(g => {
                  g.ID,
                    g.attribute_group_id,
                    g.name,
                    g.desc,
                    g.attributes(a => {
                      a.sortID,
                        a.attribute(attr => {
                          attr.attribute_id,
                            attr.name,
                            attr.desc,
                            attr.alias,
                            attr.type,
                            attr.value,
                            attr.is_mandatory,
                            attr.maxlength,
                            attr.minlength
                        })
                    })
                })
            })
        })
    );
    console.log("Details", JSON.stringify(templateDetails, null, 2));
    const workflowPayload = mapTemplateToWorkflowPayload(templateDetails);
    console.log(workflowPayload);
    try {
      const response = await executeHttpRequest(
        { destinationName: 'SBPA_API' },
        {
          method: 'POST',
          url: '/public/workflow/rest/v1/workflow-instances',
          data: workflowPayload,
          headers: { 'Content-Type': 'application/json' }
        }
      );
      console.log('SBPA workflow triggered successfully:', JSON.stringify(response.data));
    } catch (err) {
      const details = err.response ? JSON.stringify(err.response.data) : err.message;
      console.error('Failed to trigger SBPA workflow:', details);
      req.error(500, 'Workflow trigger failed: ' + details);
    }
    return "Workflow Submitted";
  });

  this.on('approveTemplate', async (req) => {
    const { ID } = req.data;
    const processor = await getTaskProcessor(ID);
    const approvedBy = processor || req.data.ApprovedBy || 'unknown';
    await UPDATE(Templates)
      .set({ Status: 'APPROVED', ApprovedBy: approvedBy, ApprovedAt: new Date() })
      .where({ ID });
  });

  this.on('rejectTemplate', async (req) => {
    const { ID, RejectionReason } = req.data;
    const processor = await getTaskProcessor(ID);
    const rejectedBy = processor || req.data.RejectedBy || 'unknown';
    await UPDATE(Templates)
      .set({ Status: 'REJECTED', RejectionReason, RejectedBy: rejectedBy, RejectedAt: new Date() })
      .where({ ID });
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── Contract Expiry Notification (ANS + Email) ───
  // ═══════════════════════════════════════════════════════════════

  // Helper: Get ANS credentials from VCAP_SERVICES
  function getANSCredentials() {
    try {
      const vcapServices = JSON.parse(process.env.VCAP_SERVICES || '{}');
      const ansService = vcapServices['alert-notification']?.[0];
      if (ansService?.credentials) {
        return ansService.credentials;
      }
    } catch (e) {
      console.error('Error parsing VCAP_SERVICES:', e.message);
    }
    return null;
  }

  // Helper: Get OAuth token for ANS
  async function getANSToken(credentials) {
    try {
      const tokenUrl = credentials.oauth_url;
      const response = await axios.post(tokenUrl, null, {
        auth: {
          username: credentials.client_id,
          password: credentials.client_secret
        },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 30000
      });
      return response.data.access_token;
    } catch (err) {
      console.error('Failed to get ANS token:', err.message);
      return null;
    }
  }

  // Helper: Calculate days until expiry
  function getDaysUntilExpiry(expiryDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(expiryDate);
    expiry.setHours(0, 0, 0, 0);
    return Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
  }

  // Helper: Format date
  function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  // Helper: Send alert via SAP ANS to the contract creator
  async function sendContractAlertNotification(contract, daysRemaining) {
    const recipientEmail = contract.createdBy;

    if (!recipientEmail) {
      console.warn(`No createdBy found for contract ${contract.contract_id || contract.ID} - skipping notification`);
      return false;
    }

    const ansCredentials = getANSCredentials();
    if (!ansCredentials) {
      console.error('Alert Notification Service credentials not found in VCAP_SERVICES');
      return false;
    }

    const token = await getANSToken(ansCredentials);
    if (!token) {
      console.error('Failed to obtain ANS token');
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
        tags: {
          recipientEmail: recipientEmail
        }
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
      const response = await axios.post(
        `${ansCredentials.url}/cf/producer/v1/resource-events`,
        alertPayload,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );
      console.log(`Alert sent for contract ${contract.contract_id || contract.ID} to ${recipientEmail}:`, response.status);
      return true;
    } catch (err) {
      console.error(`Failed to send alert to ${recipientEmail}:`, err.message);
      if (err.response) {
        console.error('Response data:', JSON.stringify(err.response.data));
      }
      return false;
    }
  }

  // Action: Check all contracts for expiry and send notifications
  this.on('checkExpiryNotifications', async (req) => {
    console.log(`Starting contract expiry notification check (threshold: ${DAYS_THRESHOLD} days)`);

    const contracts = await SELECT.from(Contracts, c => {
      c('*'),
      c.templates(t => { t.name, t.AssignedTo })
    }).where({ end_date: { '!=': null } });

    console.log(`Found ${contracts.length} contracts with expiry dates`);

    let notificationsSent = 0;
    let notificationsFailed = 0;
    const results = [];

    for (const contract of contracts) {
      const daysUntilExpiry = getDaysUntilExpiry(contract.end_date);

      if (daysUntilExpiry > 0 && daysUntilExpiry <= DAYS_THRESHOLD) {
        console.log(`Contract ${contract.contract_id || contract.ID} ("${contract.name}") expires in ${daysUntilExpiry} days - sending notification`);

        const sent = await sendContractAlertNotification(contract, daysUntilExpiry);
        if (sent) {
          notificationsSent++;
          results.push({
            contractId: contract.contract_id || contract.ID,
            contractName: contract.name,
            startDate: contract.start_date,
            expiryDate: contract.end_date,
            daysRemaining: daysUntilExpiry,
            status: 'sent'
          });
        } else {
          notificationsFailed++;
          results.push({
            contractId: contract.contract_id || contract.ID,
            contractName: contract.name,
            startDate: contract.start_date,
            expiryDate: contract.end_date,
            daysRemaining: daysUntilExpiry,
            status: 'failed'
          });
        }
      } else if (daysUntilExpiry <= 0) {
        console.log(`Contract ${contract.contract_id || contract.ID} has already expired`);
      }
    }

    const summary = `Contract expiry check completed. Sent: ${notificationsSent}, Failed: ${notificationsFailed}`;
    console.log(summary);

    return JSON.stringify({
      message: summary,
      threshold: DAYS_THRESHOLD,
      totalChecked: contracts.length,
      notificationsSent,
      notificationsFailed,
      details: results
    });
  });

  // Action: Send notification for a specific contract
  this.on('sendExpiryNotification', async (req) => {
    const { contractId } = req.data;

    if (!contractId) {
      req.error(400, 'Contract ID is required');
      return false;
    }

    const contract = await SELECT.one.from(Contracts, c => {
      c('*'),
      c.templates(t => { t.name, t.AssignedTo })
    }).where({ ID: contractId });

    if (!contract) {
      req.error(404, 'Contract not found');
      return false;
    }

    if (!contract.end_date) {
      req.error(400, 'Contract has no expiry date set');
      return false;
    }

    const daysUntilExpiry = getDaysUntilExpiry(contract.end_date);

    if (daysUntilExpiry <= 0) {
      req.error(400, 'Contract has already expired');
      return false;
    }

    console.log(`Manually sending expiry notification for contract ${contract.contract_id || contract.ID}`);
    return await sendContractAlertNotification(contract, daysUntilExpiry);
  });

  // ANS Webhook - receives alert from ANS and sends email to dynamic recipient
  this.on('ansWebhook', async (req) => {
    const { recipientEmail, subject, body, contractId, contractName, daysRemaining, startDate, expiryDate } = req.data;

    console.log(`ANS Webhook triggered - sending email to: ${recipientEmail}`);

    if (!recipientEmail) {
      req.error(400, 'Recipient email is required');
      return false;
    }

    try {
      const smtpHost = process.env.SMTP_HOST;
      const smtpPort = process.env.SMTP_PORT || '587';
      const smtpUser = process.env.SMTP_USER;
      const smtpPassword = process.env.SMTP_PASSWORD;
      const smtpFrom = process.env.SMTP_FROM || smtpUser;

      if (!smtpHost || !smtpUser || !smtpPassword) {
        console.error('SMTP configuration missing. Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD environment variables.');
        req.error(500, 'SMTP configuration not found');
        return false;
      }

      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(smtpPort),
        secure: smtpPort === '465',
        auth: { user: smtpUser, pass: smtpPassword }
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

      const mailOptions = {
        from: smtpFrom,
        to: recipientEmail,
        subject: emailSubject,
        text: emailBody
      };

      const result = await transporter.sendMail(mailOptions);
      console.log(`Email sent to ${recipientEmail}: ${result.messageId}`);
      return true;
    } catch (err) {
      console.error('Failed to send email:', err.message);
      req.error(500, 'Failed to send email: ' + err.message);
      return false;
    }
  });
}
