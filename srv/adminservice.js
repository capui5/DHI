const cds = require('@sap/cds')

module.exports = async function () {
  const { Templates, Contracts, NotificationLogs } = this.entities;
  const { executeHttpRequest } = require('@sap-cloud-sdk/http-client');

  // ─── Configuration ───
  const DAYS_THRESHOLD = 30;

  // ─── Audit Log Helper ───
  async function logAuditEvent(req, action, details) {
    try {
      let username = req?.user?.id ?? 'system';
      try {
        const authInfo = req?.user?.authInfo?.token ?? req?.user?.tokenInfo;
        if (authInfo) {
          const payload = authInfo.getPayload();
          username = payload.email || payload.mail || payload.user_name || username;
        } else if (req?.user?.attr?.email) {
          username = req.user.attr.email;
        }
      } catch (_) { /* fall back to req.user.id */ }
      // Allow callers to override the resolved username (e.g. approve/reject via SBPA workflow)
      if (details.performedBy) {
        username = details.performedBy;
      }
      const { message, ...rest } = details;
      const rawId = req?.user?.id ?? '';
      const logMessage = (message || `${action} performed by ${username}`)
        .replace(rawId, username);
      await INSERT.into('com.dhi.cms.AuditLogs').entries({
        timestamp: new Date().toISOString(),
        user: username,
        action,
        message: logMessage,
        details: JSON.stringify(rest)
      });
    } catch (e) {
      console.error('[AuditLog] Failed to write audit event:', e.message);
    }
  }

  // ─── Audit Diff Helpers ───
  function diffAttachments(current, incoming) {
    const currentNames = new Set(current.map(a => a.file_name).filter(Boolean));
    const incomingNames = new Set(incoming.map(a => a.file_name).filter(Boolean));
    const added = [...incomingNames].filter(n => !currentNames.has(n));
    const removed = [...currentNames].filter(n => !incomingNames.has(n));
    if (added.length === 0 && removed.length === 0) return { changed: false };
    const detail = {};
    if (added.length) detail.added = added;
    if (removed.length) detail.removed = removed;
    return { changed: true, detail };
  }

  function diffAttributeValues(current, incoming) {
    const currentMap = {};
    for (const av of current) {
      const k = `${av.attribute_groups_ID}::${av.attributes_ID}`;
      currentMap[k] = av.valueJson ?? '';
    }
    const changes = [];
    for (const av of incoming) {
      if (!av.attributes_ID) continue;
      const k = `${av.attribute_groups_ID}::${av.attributes_ID}`;
      const oldVal = currentMap[k] ?? '';
      const newVal = av.valueJson ?? '';
      if (String(oldVal) !== String(newVal)) {
        changes.push({ attributes_ID: av.attributes_ID, from: oldVal, to: newVal });
      }
    }
    if (changes.length === 0) return { changed: false };
    return { changed: true, detail: { changes } };
  }

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
      const tokenInfo = req.user.authInfo?.token ?? req.user.tokenInfo;
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

  this.before(['CREATE', 'UPDATE'], 'Contracts', async (req) => {
    const { name, ID } = req.data;
    if (!name) return;
    const where = ID ? { name, ID: { '!=': ID } } : { name };
    const existing = await SELECT.one.from('com.dhi.cms.Contracts').where(where);
    if (existing) return req.reject(400, 'Duplicate entry: Contract name already exists.');
  });

  // Set status to 'Expired' for contracts whose end_date has passed
  this.after('READ', 'Contracts', (each) => {
    if (!each) return;
    const items = Array.isArray(each) ? each : [each];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (const item of items) {
      if (item.end_date && item.status !== 'Draft') {
        const endDate = new Date(item.end_date);
        endDate.setHours(0, 0, 0, 0);
        if (endDate < today) {
          item.status = 'Expired';
        }
      }
    }
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

  function mapContractToWorkflowPayload(contract, submittedBy) {
    // Collect all admin IDs from company admins
    const admins = contract.company?.admins || [];
    const allAdminIds = admins.map(a => a.adminId).filter(Boolean).join(',');

    return {
      definitionId:
        'ap11.dhi-alm-cloud-mwwpt8sk.dhitemplateapprovalform.template_approval_process',
      context: {
        contract_id: contract.contract_id ?? contract.ID,
        _name: contract.name ?? '',
        description: contract.description ?? '',
        alias: contract.alias ?? '',
        start_date: contract.start_date ?? '',
        end_date: contract.end_date ?? '',
        status: contract.status ?? '',
        AssignedTo: allAdminIds,
        ID: contract.ID ?? '',
        company: {
          CompanyCode: contract.company?.CompanyCode ?? '',
          CompanyName: contract.company?.CompanyName ?? ''
        },
        template_name: contract.templates?.name ?? '',
        submittedby: submittedBy ?? ''
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
        c.templates(t => { t.name }),
        c.company(co => { co.CompanyCode, co.CompanyName })
      });

    if (!contractDetails) {
      req.error(404, 'Contract not found');
      return;
    }

    console.log("submitContract - contract company_CompanyCode:", contractDetails.company?.CompanyCode || '(EMPTY)');
    console.log("submitContract - contract company object:", JSON.stringify(contractDetails.company));

    // Fetch company admins separately
    if (contractDetails.company?.CompanyCode) {
      const admins = await SELECT.from('com.dhi.cms.CompanyAdmins')
        .where({ company_CompanyCode: contractDetails.company.CompanyCode });
      contractDetails.company.admins = admins || [];
    } else {
      contractDetails.company = contractDetails.company || {};
      contractDetails.company.admins = [];
    }

    // Get submitter's email from JWT token
    let submittedBy = req.user.id;
    try {
      const tokenInfo = req.user.tokenInfo;
      if (tokenInfo) {
        const payload = tokenInfo.getPayload();
        submittedBy = payload.email || payload.user_name || req.user.id;
      } else if (req.user.attr && req.user.attr.email) {
        submittedBy = req.user.attr.email;
      }
    } catch (e) {
      console.log("submitContract - error reading token for submittedBy:", e.message);
    }

    console.log("Contract Details", JSON.stringify(contractDetails, null, 2));
    console.log("Submitted By:", submittedBy);
    const workflowPayload = mapContractToWorkflowPayload(contractDetails, submittedBy);
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
      await logAuditEvent(req, 'CONTRACT_ASSIGNED', {
        message: `Contract '${contractDetails.name}' (Template: '${contractDetails.templates?.name ?? 'N/A'}') assigned for approval by ${submittedBy}`,
        contractId: contractDetails.contract_id || contractId,
        contractName: contractDetails.name,
        templateName: contractDetails.templates?.name,
        assignedBy: submittedBy
      });
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
    const contractForApprove = await SELECT.one.from('com.dhi.cms.Contracts', c => {
      c.contract_id, c.name, c.templates(t => { t.name })
    }).where({ ID });
    await UPDATE(Contracts)
      .set({ status: 'Approved', ApprovedBy: approvedBy, ApprovedAt: new Date() })
      .where({ ID });
    await logAuditEvent(req, 'CONTRACT_APPROVED', {
      message: `Contract '${contractForApprove?.name ?? ID}' (Template: '${contractForApprove?.templates?.name ?? 'N/A'}') approved by ${approvedBy}`,
      contractId: contractForApprove?.contract_id || ID,
      contractName: contractForApprove?.name,
      templateName: contractForApprove?.templates?.name,
      approvedBy,
      performedBy: approvedBy
    });
  });

  this.on('rejectContract', async (req) => {
    const { ID, RejectionReason } = req.data;
    const processor = await getContractTaskProcessor(ID);
    const rejectedBy = processor || req.data.RejectedBy || 'unknown';
    const contractForReject = await SELECT.one.from('com.dhi.cms.Contracts', c => {
      c.contract_id, c.name, c.templates(t => { t.name })
    }).where({ ID });
    await UPDATE(Contracts)
      .set({ status: 'Rejected', RejectionReason, RejectedBy: rejectedBy, RejectedAt: new Date() })
      .where({ ID });
    await logAuditEvent(req, 'CONTRACT_REJECTED', {
      message: `Contract '${contractForReject?.name ?? ID}' (Template: '${contractForReject?.templates?.name ?? 'N/A'}') rejected by ${rejectedBy}${RejectionReason ? ' - Reason: ' + RejectionReason : ''}`,
      contractId: contractForReject?.contract_id || ID,
      contractName: contractForReject?.name,
      templateName: contractForReject?.templates?.name,
      rejectedBy,
      reason: RejectionReason ?? '',
      performedBy: rejectedBy
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── Document Audit Events (Attachments) ───
  // ═══════════════════════════════════════════════════════════════

  this.after('CREATE', 'Attachments', async (data, req) => {
    const items = Array.isArray(data) ? data : [data];
    for (const item of items) {
      await logAuditEvent(req, 'DOCUMENT_UPLOADED', {
        message: `Document '${item.file_name}' uploaded to contract '${item.contracts_ID}' by ${req.user?.id ?? 'unknown'}`,
        attachmentId: item.ID,
        fileName: item.file_name,
        contractId: item.contracts_ID
      });
    }
  });

  this.before('DELETE', 'Attachments', async (req) => {
    try {
      const key = req.params?.[req.params.length - 1];
      if (!key?.ID) return;
      const attachment = await SELECT.one.from('com.dhi.cms.Attachments').where({ ID: key.ID });
      if (!attachment) return;
      await logAuditEvent(req, 'DOCUMENT_DELETED', {
        message: `Document '${attachment.file_name}' removed from contract '${attachment.contracts_ID}' by ${req.user?.id ?? 'unknown'}`,
        attachmentId: attachment.ID,
        fileName: attachment.file_name,
        contractId: attachment.contracts_ID
      });
    } catch (e) {
      console.warn('[AuditLog] Could not log DOCUMENT_DELETED:', e.message);
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── Assignment Audit Events (CompanyAdmins) ───
  // ═══════════════════════════════════════════════════════════════

  this.after('CREATE', 'CompanyAdmins', async (data, req) => {
    const items = Array.isArray(data) ? data : [data];
    for (const item of items) {
      await logAuditEvent(req, 'ADMIN_ASSIGNED', {
        message: `Admin '${item.adminName}' assigned to company '${item.company_CompanyCode}' by ${req.user?.id ?? 'unknown'}`,
        adminId: item.adminId,
        adminName: item.adminName,
        companyCode: item.company_CompanyCode
      });
    }
  });

  this.before('DELETE', 'CompanyAdmins', async (req) => {
    try {
      const key = req.params?.[req.params.length - 1];
      if (!key?.ID) return;
      const admin = await SELECT.one.from('com.dhi.cms.CompanyAdmins').where({ ID: key.ID });
      if (!admin) return;
      await logAuditEvent(req, 'ADMIN_REMOVED', {
        message: `Admin '${admin.adminName}' removed from company '${admin.company_CompanyCode}' by ${req.user?.id ?? 'unknown'}`,
        adminId: admin.adminId,
        adminName: admin.adminName,
        companyCode: admin.company_CompanyCode
      });
    } catch (e) {
      console.warn('[AuditLog] Could not log ADMIN_REMOVED:', e.message);
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── Attribute CRUD Audit Events ───
  // ═══════════════════════════════════════════════════════════════

  this.after('CREATE', 'Attributes', async (data, req) => {
    const items = Array.isArray(data) ? data : [data];
    for (const item of items) {
      await logAuditEvent(req, 'ATTRIBUTE_CREATED', {
        message: `Attribute '${item.name}' created by ${req.user?.id ?? 'unknown'}`,
        attributeId: item.ID,
        attributeName: item.name
      });
    }
  });

  this.before('UPDATE', 'Attributes', async (req) => {
    try {
      const key = req.params?.[req.params.length - 1];
      if (!key?.ID) return;
      const current = await SELECT.one.from('com.dhi.cms.Attributes').where({ ID: key.ID });
      if (!current) return;
      const skip = new Set(['ID', 'modifiedAt', 'modifiedBy']);
      const fieldDetails = {};
      const actuallyChanged = [];
      for (const [field, newVal] of Object.entries(req.data)) {
        if (skip.has(field)) continue;
        if (Array.isArray(newVal)) {
          fieldDetails[field] = { from: '(previous)', to: '(updated)' };
          actuallyChanged.push(field);
          continue;
        }
        const oldVal = current[field];
        if (String(oldVal ?? '') !== String(newVal ?? '')) {
          fieldDetails[field] = { from: oldVal ?? '', to: newVal ?? '' };
          actuallyChanged.push(field);
        } else {
          fieldDetails[field] = 'not changed';
        }
      }
      if (actuallyChanged.length === 0) return;
      await logAuditEvent(req, 'ATTRIBUTE_UPDATED', {
        message: `Attribute '${current.name}' updated by ${req.user?.id ?? 'unknown'} - changed fields: ${actuallyChanged.join(', ')}`,
        attributeId: key.ID,
        attributeName: current.name,
        changedFields: actuallyChanged.join(', '),
        changes: fieldDetails
      });
    } catch (e) {
      console.warn('[AuditLog] Could not log ATTRIBUTE_UPDATED:', e.message);
    }
  });

  this.before('DELETE', 'Attributes', async (req) => {
    try {
      const key = req.params?.[req.params.length - 1];
      if (!key?.ID) return;
      const attribute = await SELECT.one.from('com.dhi.cms.Attributes').where({ ID: key.ID });
      if (!attribute) return;
      await logAuditEvent(req, 'ATTRIBUTE_DELETED', {
        message: `Attribute '${attribute.name}' deleted by ${req.user?.id ?? 'unknown'}`,
        attributeId: attribute.ID,
        attributeName: attribute.name
      });
    } catch (e) {
      console.warn('[AuditLog] Could not log ATTRIBUTE_DELETED:', e.message);
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── Attribute Group CRUD Audit Events ───
  // ═══════════════════════════════════════════════════════════════

  this.after('CREATE', 'Attribute_Groups', async (data, req) => {
    const items = Array.isArray(data) ? data : [data];
    for (const item of items) {
      await logAuditEvent(req, 'ATTRIBUTE_GROUP_CREATED', {
        message: `Attribute Group '${item.name}' created by ${req.user?.id ?? 'unknown'}`,
        groupId: item.ID,
        groupName: item.name
      });
    }
  });

  this.before('UPDATE', 'Attribute_Groups', async (req) => {
    try {
      const key = req.params?.[req.params.length - 1];
      if (!key?.ID) return;
      const current = await SELECT.one.from('com.dhi.cms.Attribute_Groups').where({ ID: key.ID });
      if (!current) return;
      const skip = new Set(['ID', 'modifiedAt', 'modifiedBy']);
      const fieldDetails = {};
      const actuallyChanged = [];
      for (const [field, newVal] of Object.entries(req.data)) {
        if (skip.has(field)) continue;
        if (Array.isArray(newVal)) {
          fieldDetails[field] = { from: '(previous)', to: '(updated)' };
          actuallyChanged.push(field);
          continue;
        }
        const oldVal = current[field];
        if (String(oldVal ?? '') !== String(newVal ?? '')) {
          fieldDetails[field] = { from: oldVal ?? '', to: newVal ?? '' };
          actuallyChanged.push(field);
        } else {
          fieldDetails[field] = 'not changed';
        }
      }
      if (actuallyChanged.length === 0) return;
      await logAuditEvent(req, 'ATTRIBUTE_GROUP_UPDATED', {
        message: `Attribute Group '${current.name}' updated by ${req.user?.id ?? 'unknown'} - changed fields: ${actuallyChanged.join(', ')}`,
        groupId: key.ID,
        groupName: current.name,
        changedFields: actuallyChanged.join(', '),
        changes: fieldDetails
      });
    } catch (e) {
      console.warn('[AuditLog] Could not log ATTRIBUTE_GROUP_UPDATED:', e.message);
    }
  });

  this.before('DELETE', 'Attribute_Groups', async (req) => {
    try {
      const key = req.params?.[req.params.length - 1];
      if (!key?.ID) return;
      const group = await SELECT.one.from('com.dhi.cms.Attribute_Groups').where({ ID: key.ID });
      if (!group) return;
      await logAuditEvent(req, 'ATTRIBUTE_GROUP_DELETED', {
        message: `Attribute Group '${group.name}' deleted by ${req.user?.id ?? 'unknown'}`,
        groupId: group.ID,
        groupName: group.name
      });
    } catch (e) {
      console.warn('[AuditLog] Could not log ATTRIBUTE_GROUP_DELETED:', e.message);
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── Template CRUD Audit Events ───
  // ═══════════════════════════════════════════════════════════════

  this.after('CREATE', 'Templates', async (data, req) => {
    const items = Array.isArray(data) ? data : [data];
    for (const item of items) {
      await logAuditEvent(req, 'TEMPLATE_CREATED', {
        message: `Template '${item.name}' created by ${req.user?.id ?? 'unknown'}`,
        templateId: item.ID,
        templateName: item.name
      });
    }
  });

  this.before('UPDATE', 'Templates', async (req) => {
    try {
      const key = req.params?.[req.params.length - 1];
      if (!key?.ID) return;
      const current = await SELECT.one.from('com.dhi.cms.Templates').where({ ID: key.ID });
      if (!current) return;
      const skip = new Set(['ID', 'modifiedAt', 'modifiedBy']);
      const fieldDetails = {};
      const actuallyChanged = [];
      for (const [field, newVal] of Object.entries(req.data)) {
        if (skip.has(field)) continue;
        if (Array.isArray(newVal)) {
          fieldDetails[field] = { from: '(previous)', to: '(updated)' };
          actuallyChanged.push(field);
          continue;
        }
        const oldVal = current[field];
        if (String(oldVal ?? '') !== String(newVal ?? '')) {
          fieldDetails[field] = { from: oldVal ?? '', to: newVal ?? '' };
          actuallyChanged.push(field);
        } else {
          fieldDetails[field] = 'not changed';
        }
      }
      if (actuallyChanged.length === 0) return;
      await logAuditEvent(req, 'TEMPLATE_UPDATED', {
        message: `Template '${current.name}' updated by ${req.user?.id ?? 'unknown'} - changed fields: ${actuallyChanged.join(', ')}`,
        templateId: key.ID,
        templateName: current.name,
        changedFields: actuallyChanged.join(', '),
        changes: fieldDetails
      });
    } catch (e) {
      console.warn('[AuditLog] Could not log TEMPLATE_UPDATED:', e.message);
    }
  });

  this.before('DELETE', 'Templates', async (req) => {
    try {
      const key = req.params?.[req.params.length - 1];
      if (!key?.ID) return;
      const template = await SELECT.one.from('com.dhi.cms.Templates').where({ ID: key.ID });
      if (!template) return;
      await logAuditEvent(req, 'TEMPLATE_DELETED', {
        message: `Template '${template.name}' deleted by ${req.user?.id ?? 'unknown'}`,
        templateId: template.ID,
        templateName: template.name
      });
    } catch (e) {
      console.warn('[AuditLog] Could not log TEMPLATE_DELETED:', e.message);
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── Contract CRUD Audit Events ───
  // ═══════════════════════════════════════════════════════════════

  this.after('CREATE', 'Contracts', async (data, req) => {
    const items = Array.isArray(data) ? data : [data];
    for (const item of items) {
      await logAuditEvent(req, 'CONTRACT_CREATED', {
        message: `Contract '${item.name}' (${item.contract_id || item.ID}) created by ${req.user?.id ?? 'unknown'}`,
        contractId: item.contract_id || item.ID,
        contractName: item.name
      });
    }
  });

  this.before('UPDATE', 'Contracts', async (req) => {
    try {
      const key = req.params?.[req.params.length - 1];
      if (!key?.ID) return;
      const current = await SELECT.one.from('com.dhi.cms.Contracts').where({ ID: key.ID });
      if (!current) return;
      const [currentAttachments, currentAttrValues] = await Promise.all([
        SELECT.from('com.dhi.cms.Attachments').where({ contracts_ID: key.ID }),
        SELECT.from('com.dhi.cms.ContractsAttributes').where({ contracts_ID: key.ID })
      ]);
      const skip = new Set(['ID', 'modifiedAt', 'modifiedBy']);
      const fieldDetails = {};
      const actuallyChanged = [];
      for (const [field, newVal] of Object.entries(req.data)) {
        if (skip.has(field)) continue;
        if (field === 'attachments' && Array.isArray(newVal)) {
          const diff = diffAttachments(currentAttachments, newVal);
          if (diff.changed) { fieldDetails[field] = diff.detail; actuallyChanged.push(field); }
          else { fieldDetails[field] = 'not changed'; }
          continue;
        }
        if (field === 'attribute_values' && Array.isArray(newVal)) {
          const diff = diffAttributeValues(currentAttrValues, newVal);
          if (diff.changed) { fieldDetails[field] = diff.detail; actuallyChanged.push(field); }
          else { fieldDetails[field] = 'not changed'; }
          continue;
        }
        if (Array.isArray(newVal)) {
          fieldDetails[field] = { from: '(previous)', to: '(updated)' };
          actuallyChanged.push(field);
          continue;
        }
        const oldVal = current[field];
        if (String(oldVal ?? '') !== String(newVal ?? '')) {
          fieldDetails[field] = { from: oldVal ?? '', to: newVal ?? '' };
          actuallyChanged.push(field);
        } else {
          fieldDetails[field] = 'not changed';
        }
      }
      if (actuallyChanged.length === 0) return;
      await logAuditEvent(req, 'CONTRACT_UPDATED', {
        message: `Contract '${current.name}' updated by ${req.user?.id ?? 'unknown'} - changed fields: ${actuallyChanged.join(', ')}`,
        contractId: current.contract_id || key.ID,
        contractName: current.name,
        changedFields: actuallyChanged.join(', '),
        changes: fieldDetails
      });
    } catch (e) {
      console.warn('[AuditLog] Could not log CONTRACT_UPDATED:', e.message);
    }
  });

  this.before('DELETE', 'Contracts', async (req) => {
    try {
      const key = req.params?.[req.params.length - 1];
      if (!key?.ID) return;
      const contract = await SELECT.one.from('com.dhi.cms.Contracts').where({ ID: key.ID });
      if (!contract) return;
      await logAuditEvent(req, 'CONTRACT_DELETED', {
        message: `Contract '${contract.name}' (${contract.contract_id || contract.ID}) deleted by ${req.user?.id ?? 'unknown'}`,
        contractId: contract.contract_id || contract.ID,
        contractName: contract.name
      });
    } catch (e) {
      console.warn('[AuditLog] Could not log CONTRACT_DELETED:', e.message);
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // ─── Contract Expiry Notification (ANS) ───
  // ═══════════════════════════════════════════════════════════════


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

  // Determine event type and reminder window based on days remaining.
  // Notifications are sent ONLY on exactly 30, 14, or 7 days before expiry.
  function getEventClassification(daysRemaining) {
    if (daysRemaining === 30) {
      return { eventType: 'contract.expiring.30d', reminderWindow: '30d', severity: 'INFO' };
    } else if (daysRemaining === 14) {
      return { eventType: 'contract.expiring.14d', reminderWindow: '14d', severity: 'WARNING' };
    } else if (daysRemaining === 7) {
      return { eventType: 'contract.expiring.7d', reminderWindow: '7d', severity: 'ERROR' };
    }
    return null;
  }

  // Determine renewal event classification based on contract status
  function getRenewalClassification(status) {
    if (status === 'Renewal Due') {
      return { eventType: 'contract.renewal.due', reminderWindow: 'renewal-due', severity: 'WARNING' };
    } else if (status === 'Renewal Pending') {
      return { eventType: 'contract.renewal.pending', reminderWindow: 'renewal-pending', severity: 'INFO' };
    } else if (status === 'Renewal Completed') {
      return { eventType: 'contract.renewal.completed', reminderWindow: 'renewal-completed', severity: 'INFO' };
    }
    return null;
  }

  // Check if notification was already sent (de-duplication)
  async function isAlreadySent(contractID, notificationType) {
    const existing = await SELECT.one.from(NotificationLogs).where({
      contract_ID: contractID,
      notificationType: notificationType,
      status: 'Sent'
    });
    return !!existing;
  }

  // Log notification attempt to audit table
  async function logNotification(contractID, notificationType, recipientEmail, reminderWindow, severity, status, errorMessage) {
    const timestamp = new Date().toISOString();
    await INSERT.into(NotificationLogs).entries({
      contract_ID: contractID,
      notificationType,
      recipientEmail,
      reminderWindow,
      severity,
      status,
      errorMessage: errorMessage || null,
      retryCount: 0,
      sentAt: timestamp
    });
    await logAuditEvent(null, 'NOTIFICATION_SENT', {
      message: `Notification '${notificationType}' (${reminderWindow}) sent to '${recipientEmail}' for contract '${contractID}' - Status: ${status}${errorMessage ? ' | Error: ' + errorMessage : ''}`,
      contractId: contractID,
      notificationType,
      recipientEmail,
      reminderWindow,
      severity,
      status,
      errorMessage: errorMessage || null
    });
  }

  // Send alert via SAP ANS - sends to all company admins
  async function sendContractAlertNotification(contract, daysRemaining, overrideClassification) {
    const admins = contract.company?.admins || [];
    const recipientEmails = admins.map(a => a.adminName).filter(Boolean);
    const contractId = contract.contract_id || contract.ID;
    const classification = overrideClassification || getEventClassification(daysRemaining);

    if (!classification) return { sent: false, skipped: true, reason: 'outside-threshold' };

    if (recipientEmails.length === 0) {
      console.warn(`No admin emails for contract ${contractId} (company: ${contract.company_CompanyCode}) - skipping`);
      await logNotification(contract.ID, classification.eventType, 'N/A', classification.reminderWindow, classification.severity, 'Failed', 'No admin email found');
      return { sent: false, skipped: false, reason: 'no-recipient' };
    }

    // De-duplication: skip if already sent for this event type
    const alreadySent = await isAlreadySent(contract.ID, classification.eventType);
    if (alreadySent) {
      console.log(`Notification ${classification.eventType} already sent for contract ${contractId} - skipping`);
      return { sent: false, skipped: true, reason: 'duplicate' };
    }

    let subjectText;
    if (classification.eventType.startsWith('contract.renewal')) {
      const renewalLabels = {
        'contract.renewal.due': `Contract "${contract.name}" - Renewal Due`,
        'contract.renewal.pending': `Contract "${contract.name}" - Renewal Pending`,
        'contract.renewal.completed': `Contract "${contract.name}" - Renewal Completed`
      };
      subjectText = renewalLabels[classification.eventType] || `Contract "${contract.name}" - Renewal Update`;
    } else {
      subjectText = daysRemaining <= 0
        ? `Contract "${contract.name}" has expired`
        : `Contract "${contract.name}" expires in ${daysRemaining} days`;
    }

    let anySent = false;
    for (const recipientEmail of recipientEmails) {
      const alertPayload = {
        eventType: 'contractExpiryWarning',
        eventTimestamp: Math.floor(Date.now() / 1000),
        severity: classification.severity,
        category: "NOTIFICATION",
        subject: subjectText,
        body: `Dear User,

This is an automated notification regarding the following contract:

Contract ID: ${contractId}
Contract Name: ${contract.name}
Description: ${contract.description || 'N/A'}
Alias: ${contract.alias || 'N/A'}
Start Date: ${formatDate(contract.start_date)}
Expiry Date: ${formatDate(contract.end_date)}
Days Remaining: ${daysRemaining <= 0 ? 'Expired' : daysRemaining}
Status: ${contract.status || 'N/A'}
Template: ${contract.templates?.name || 'N/A'}

${classification.eventType === 'contract.renewal.due'
  ? 'ACTION REQUIRED: This contract is due for renewal. Please initiate the renewal process.'
  : classification.eventType === 'contract.renewal.pending'
  ? 'REMINDER: Renewal for this contract is in progress. Please ensure timely completion.'
  : classification.eventType === 'contract.renewal.completed'
  ? 'CONFIRMATION: This contract has been successfully renewed.'
  : 'Please take necessary action.'}

Best regards,
DHI Contract Management System`,
        resource: {
          resourceName: String(contractId),
          resourceType: "contract",
          tags: { recipientEmail }
        },
        tags: {
          contractId: String(contractId),
          contractName: String(contract.name),
          daysRemaining: String(daysRemaining),
          startDate: String(contract.start_date || ''),
          expiryDate: String(contract.end_date),
          recipientEmail,
          reminderWindow: classification.reminderWindow
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
        console.log(`Alert ${classification.eventType} sent for contract ${contractId} to ${recipientEmail}: ${response.status}`);
        await logNotification(contract.ID, classification.eventType, recipientEmail, classification.reminderWindow, classification.severity, 'Sent', null);
        anySent = true;
      } catch (err) {
        const errMsg = err.response ? JSON.stringify(err.response.data) : err.message;
        console.error(`Failed to send ${classification.eventType} for contract ${contractId} to ${recipientEmail}:`, errMsg);
        await logNotification(contract.ID, classification.eventType, recipientEmail, classification.reminderWindow, classification.severity, 'Failed', errMsg);
      }
    }
    return { sent: anySent, skipped: false };
  }

  // Action: Check all contracts for expiry and renewal, send notifications
  this.on('checkExpiryNotifications', async (req) => {
    console.log(`[${new Date().toISOString()}] Starting contract expiry & renewal notification check (threshold: ${DAYS_THRESHOLD} days)`);

    const contracts = await SELECT.from(Contracts, c => {
      c('*'),
      c.templates(t => { t.name }),
      c.company(co => { co.CompanyCode, co.CompanyName })
    }).where({ end_date: { '!=': null } });

    console.log(`Found ${contracts.length} contracts with expiry dates`);

    // Fetch admins for each contract's company
    for (const contract of contracts) {
      if (contract.company?.CompanyCode) {
        const admins = await SELECT.from('com.dhi.cms.CompanyAdmins')
          .where({ company_CompanyCode: contract.company.CompanyCode });
        contract.company.admins = admins || [];
      }
    }

    let sent = 0, failed = 0, skipped = 0;
    const results = [];

    // Helper to process a notification result
    function trackResult(contract, daysUntilExpiry, result, eventLabel) {
      const cid = contract.contract_id || contract.ID;
      if (result.sent) {
        sent++;
        results.push({ contractId: cid, contractName: contract.name, daysRemaining: daysUntilExpiry, event: eventLabel, status: 'sent' });
      } else if (result.skipped) {
        skipped++;
        results.push({ contractId: cid, contractName: contract.name, daysRemaining: daysUntilExpiry, event: eventLabel, status: 'skipped', reason: result.reason });
      } else {
        failed++;
        results.push({ contractId: cid, contractName: contract.name, daysRemaining: daysUntilExpiry, event: eventLabel, status: 'failed', reason: result.reason });
      }
    }

    for (const contract of contracts) {
      const daysUntilExpiry = getDaysUntilExpiry(contract.end_date);
      const renewalStates = ['Renewal Due', 'Renewal Pending', 'Renewal Completed'];

      // ─── 1. Expiry Notifications (exactly 30d, 14d, or 7d before expiry only) ───
      if ([30, 14, 7].includes(daysUntilExpiry)) {
        const result = await sendContractAlertNotification(contract, daysUntilExpiry);
        trackResult(contract, daysUntilExpiry, result, 'expiry');
      }

      // ─── 2. Renewal Due: auto-set when contract is within threshold and still Approved ───
      if (daysUntilExpiry <= DAYS_THRESHOLD && daysUntilExpiry > 0 && contract.status === 'Approved') {
        await UPDATE(Contracts).set({ status: 'Renewal Due' }).where({ ID: contract.ID });
        contract.status = 'Renewal Due';
        console.log(`Contract "${contract.name}" status updated to Renewal Due`);
      }

      // ─── 3. Renewal lifecycle notifications ───
      if (renewalStates.includes(contract.status)) {
        const renewalClass = getRenewalClassification(contract.status);
        if (renewalClass) {
          const alreadySent = await isAlreadySent(contract.ID, renewalClass.eventType);
          if (!alreadySent) {
            const result = await sendContractAlertNotification(contract, daysUntilExpiry, renewalClass);
            trackResult(contract, daysUntilExpiry, result, contract.status);
          } else {
            skipped++;
            results.push({
              contractId: contract.contract_id || contract.ID,
              contractName: contract.name,
              daysRemaining: daysUntilExpiry,
              event: contract.status,
              status: 'skipped',
              reason: 'duplicate'
            });
          }
        }
      }
    }

    const summary = `Expiry & renewal check done. Sent: ${sent}, Failed: ${failed}, Skipped: ${skipped}`;
    console.log(`[${new Date().toISOString()}] ${summary}`);

    return JSON.stringify({
      message: summary,
      threshold: DAYS_THRESHOLD,
      totalChecked: contracts.length,
      sent, failed, skipped,
      details: results
    });
  });

  // Action: Send notification for a specific contract (manual trigger)
  this.on('sendExpiryNotification', async (req) => {
    const { contractId } = req.data;

    if (!contractId) {
      req.error(400, 'Contract ID is required');
      return false;
    }

    const contract = await SELECT.one.from(Contracts, c => {
      c('*'),
      c.templates(t => { t.name }),
      c.company(co => { co.CompanyCode, co.CompanyName })
    }).where({ ID: contractId });

    if (!contract) {
      req.error(404, 'Contract not found');
      return false;
    }

    // Fetch company admins separately
    if (contract.company?.CompanyCode) {
      const admins = await SELECT.from('com.dhi.cms.CompanyAdmins')
        .where({ company_CompanyCode: contract.company.CompanyCode });
      contract.company.admins = admins || [];
    }

    if (!contract.end_date) {
      req.error(400, 'Contract has no expiry date set');
      return false;
    }

    const daysUntilExpiry = getDaysUntilExpiry(contract.end_date);
    console.log(`Manually sending expiry notification for contract ${contract.contract_id || contract.ID}`);
    const result = await sendContractAlertNotification(contract, daysUntilExpiry);
    return result.sent;
  });

}
