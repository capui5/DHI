const cds = require('@sap/cds')

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

  // ═══════════════════════════════════════════════════════════════
  // ─── Contract Workflow Helpers ───
  // ═══════════════════════════════════════════════════════════════

  async function getContractTaskProcessor(contractId) {
    try {
      const instancesRes = await executeHttpRequest(
        { destinationName: 'SBPA_API' },
        {
          method: 'GET',
          url: '/public/workflow/rest/v1/workflow-instances',
          params: { 'context.id': contractId },
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
      console.error('Failed to get contract task processor:', err.message);
    }
    return null;
  }

  function mapContractToWorkflowPayload(contract) {
    return {
      definitionId:
        'ap11.dhi-alm-cloud-mwwpt8sk.dhicontractapprovalform.contract_approval_process',
      context: {
        contract_id: contract.contract_id ?? contract.ID,
        name: contract.name ?? '',
        description: contract.description ?? '',
        alias: contract.alias ?? '',
        start_date: contract.start_date ?? '',
        end_date: contract.end_date ?? '',
        status: contract.status ?? '',
        AssignedTo: contract.AssignedTo ?? '',
        ID: contract.ID ?? '',
        company: {
          CompanyCode: contract.company?.CompanyCode ?? '',
          CompanyName: contract.company?.CompanyName ?? ''
        },
        template_name: contract.templates?.name ?? ''
      }
    };
  }

  // ─── Contract Workflow Actions ───
  this.on('submitContract', async (req) => {
    const { contractId } = req.data;
    const contractDetails = await SELECT.one.from('com.dhi.cms.Contracts')
      .where({ ID: contractId })
      .columns(c => {
        c.ID,
        c.contract_id,
        c.name,
        c.description,
        c.alias,
        c.start_date,
        c.end_date,
        c.status,
        c.AssignedTo,
        c.templates(t => { t.name }),
        c.company(co => { co.CompanyCode, co.CompanyName })
      });

    if (!contractDetails) {
      req.error(404, 'Contract not found');
      return;
    }

    console.log("Contract Details", JSON.stringify(contractDetails, null, 2));
    const workflowPayload = mapContractToWorkflowPayload(contractDetails);
    console.log("Workflow Payload", JSON.stringify(workflowPayload, null, 2));

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
      console.log('SBPA contract workflow triggered successfully:', JSON.stringify(response.data));
    } catch (err) {
      const details = err.response ? JSON.stringify(err.response.data) : err.message;
      console.error('Failed to trigger SBPA contract workflow:', details);
      req.error(500, 'Workflow trigger failed: ' + details);
    }
    return "Contract Workflow Submitted";
  });

  this.on('approveContract', async (req) => {
    const { ID } = req.data;
    const processor = await getContractTaskProcessor(ID);
    const approvedBy = processor || req.data.ApprovedBy || 'unknown';
    await UPDATE(Contracts)
      .set({ status: 'Approved', ApprovedBy: approvedBy, ApprovedAt: new Date() })
      .where({ ID });
  });

  this.on('rejectContract', async (req) => {
    const { ID, RejectionReason } = req.data;
    const processor = await getContractTaskProcessor(ID);
    const rejectedBy = processor || req.data.RejectedBy || 'unknown';
    await UPDATE(Contracts)
      .set({ status: 'Rejected', RejectionReason, RejectedBy: rejectedBy, RejectedAt: new Date() })
      .where({ ID });
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── Contract Expiry Notification (ANS + Email) ───
  // ═══════════════════════════════════════════════════════════════

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

  // Helper: Send alert via SAP ANS to the company admin
  async function sendContractAlertNotification(contract, daysRemaining) {
    const recipientEmail = contract.company?.AdminName;

    if (!recipientEmail) {
      console.warn(`No admin email found for contract ${contract.contract_id || contract.ID} (company: ${contract.company_CompanyCode}) - skipping notification`);
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
      const response = await executeHttpRequest(
        { destinationName: 'ALERT_NOTIFICATION' },
        {
          method: 'post',
          url: '/cf/producer/v1/resource-events',
          data: alertPayload,
          headers: { 'Content-Type': 'application/json' }
        },
         {
    fetchCsrfToken: false   // 👈 THIS LINE FIXES 403
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
      c.templates(t => { t.name, t.AssignedTo }),
      c.company(co => { co.CompanyCode, co.CompanyName, co.AdminName })
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
      c.templates(t => { t.name, t.AssignedTo }),
      c.company(co => { co.CompanyCode, co.CompanyName, co.AdminName })
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

}
