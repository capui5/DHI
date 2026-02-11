using {com.dhi.cms as cms} from '../db/schema';

service ContractService @(path: '/contracts')@(requires: 'authenticated-user') {
    // ─── Attributes & Attribute Groups ───
    @(restrict: [
        {
            grant: ['READ'],
            to   : [
                'DHI_Admin',
                'DHI_PowerUser',
                'Company_Admin',
                'Company_Editor',
                'Company_Viewer',
                'Auditor'
            ]
        },
        {
            grant: [
                'CREATE',
                'UPDATE',
                'DELETE'
            ],
            to   : ['DHI_Admin']
        }
    ])
    entity Attributes                                  as projection on cms.Attributes;

    @(restrict: [
        {
            grant: ['READ'],
            to   : [
                'DHI_Admin',
                'DHI_PowerUser',
                'Company_Admin',
                'Company_Editor',
                'Company_Viewer',
                'Auditor'
            ]
        },
        {
            grant: [
                'CREATE',
                'UPDATE',
                'DELETE'
            ],
            to   : ['DHI_Admin']
        }
    ])
    entity Attribute_Groups                            as projection on cms.Attribute_Groups;

    @(restrict: [
        {
            grant: ['READ'],
            to   : [
                'DHI_Admin',
                'DHI_PowerUser',
                'Company_Admin',
                'Company_Editor',
                'Company_Viewer',
                'Auditor'
            ]
        },
        {
            grant: [
                'CREATE',
                'UPDATE',
                'DELETE'
            ],
            to   : ['DHI_Admin']
        }
    ])
    entity AttributeGroupAttribute                     as projection on cms.AttributeGroupAttribute;

    // ─── Templates ───
    @(restrict: [
        {
            grant: ['READ'],
            to   : [
                'DHI_Admin',
                'DHI_PowerUser',
                'Company_Admin',
                'Company_Editor',
                'Company_Viewer',
                'Auditor'
            ]
        },
        {
            grant: [
                'CREATE',
                'UPDATE'
            ],
            to   : [
                'DHI_Admin',
                'DHI_PowerUser'
            ]
        },
        {
            grant: ['DELETE'],
            to   : ['DHI_Admin']
        }
    ])
    entity Templates                                   as projection on cms.Templates;

    @(restrict: [
        {
            grant: ['READ'],
            to   : [
                'DHI_Admin',
                'DHI_PowerUser',
                'Company_Admin',
                'Company_Editor',
                'Company_Viewer',
                'Auditor'
            ]
        },
        {
            grant: [
                'CREATE',
                'UPDATE',
                'DELETE'
            ],
            to   : [
                'DHI_Admin',
                'DHI_PowerUser'
            ]
        }
    ])
    entity TemplatesAttributeGroups                    as projection on cms.TemplatesAttributeGroups;

    // ─── Contracts ───
    @(restrict: [
        {
            grant: ['READ'],
            to   : [
                'DHI_Admin',
                'DHI_PowerUser',
                'Company_Admin',
                'Company_Editor',
                'Company_Viewer',
                'Auditor'
            ]
        },
        {
            grant: [
                'CREATE',
                'UPDATE'
            ],
            to   : [
                'Company_Admin',
                'Company_Editor'
            ]
        },
        {
            grant: ['DELETE'],
            to   : ['Company_Admin']
        }
    ])
    entity Contracts                                   as projection on cms.Contracts;

    @(restrict: [
        {
            grant: ['READ'],
            to   : [
                'DHI_Admin',
                'DHI_PowerUser',
                'Company_Admin',
                'Company_Editor',
                'Company_Viewer',
                'Auditor'
            ]
        },
        {
            grant: [
                'CREATE',
                'UPDATE'
            ],
            to   : [
                'Company_Admin',
                'Company_Editor'
            ]
        },
        {
            grant: ['DELETE'],
            to   : ['Company_Admin']
        }
    ])
    entity ContractsAttributes                         as projection on cms.ContractsAttributes;

    @(restrict: [
        {
            grant: ['READ'],
            to   : [
                'DHI_Admin',
                'DHI_PowerUser',
                'Company_Admin',
                'Company_Editor',
                'Company_Viewer',
                'Auditor'
            ]
        },
        {
            grant: [
                'CREATE',
                'UPDATE'
            ],
            to   : [
                'Company_Admin',
                'Company_Editor'
            ]
        },
        {
            grant: ['DELETE'],
            to   : ['Company_Admin']
        }
    ])
    entity Attachments                                 as projection on cms.Attachments;

    // ─── Read-only Catalogue Views ───
    @(restrict: [{
        grant: ['READ'],
        to   : [
            'DHI_Admin',
            'DHI_PowerUser',
            'Company_Admin',
            'Company_Editor',
            'Company_Viewer',
            'Auditor'
        ]
    }])
    @Core.Description: 'TemplatePortal Catalogue View'
    entity TemplatePortalCatalogue(TemplateID: String) as
        select from cms.TemplatePortalCatalogue (
            TemplateID: :TemplateID
        );

    @(restrict: [{
        grant: ['READ'],
        to   : [
            'DHI_Admin',
            'DHI_PowerUser',
            'Company_Admin',
            'Company_Editor',
            'Company_Viewer',
            'Auditor'
        ]
    }])
    entity AttributeGroupCatalogue                     as projection on cms.AttributeGroupCatalogue;

    @(restrict: [{
        grant: ['READ'],
        to   : [
            'DHI_Admin',
            'DHI_PowerUser',
            'Company_Admin',
            'Company_Editor',
            'Company_Viewer',
            'Auditor'
        ]
    }])
    function getGroupAssociatedTemplates()            returns array of String

    @(restrict: [{
        grant: ['READ'],
        to   : [
            'DHI_Admin',
            'DHI_PowerUser',
            'Company_Admin',
            'Company_Editor',
            'Company_Viewer',
            'Auditor'
        ]
    }])

    entity LISTAPPROVER                                as projection on cms.LISTAPPROVER;

    @(restrict: [
        {
            grant: ['READ'],
            to   : [
                'DHI_Admin',
                'DHI_PowerUser',
                'Company_Admin',
                'Company_Editor',
                'Company_Viewer',
                'Auditor'
            ]
        },
        {
            grant: [
                'CREATE',
                'UPDATE',
                'DELETE'
            ],
            to   : ['DHI_Admin']
        }
    ])
    entity Companies                                   as projection on cms.Companies;

    // ─── Contract Workflow Actions ───
    @(requires: [
        'Company_Admin',
        'Company_Editor'
    ])
    action   submitContract(contractId: UUID)          returns String;

    @(requires: 'authenticated-user')
    action   approveContract(ID: UUID,
                             ApprovedBy: String);

    @(requires: 'authenticated-user')
    action   rejectContract(ID: UUID,
                            RejectionReason: String,
                            RejectedBy: String);

    // ─── Notification Actions ───
    @(requires: [
        'DHI_Admin',
        'Company_Admin'
    ])
    action   checkExpiryNotifications()               returns String;

    @(requires: [
        'DHI_Admin',
        'Company_Admin'
    ])
    action   sendExpiryNotification(contractId: UUID) returns Boolean;

    action   ansWebhook(recipientEmail: String,
                        subject: String,
                        body: String,
                        contractId: String,
                        contractName: String,
                        daysRemaining: String,
                        startDate: String,
                        expiryDate: String)           returns Boolean;

    // ─── User Info (accessible to all authenticated users) ───
    type UserRole {
        role    : String;
        allowed : Boolean;
    }

    type UserInfo {
        user  : String;
        roles : array of UserRole;
    }

    function getUserInfo()                            returns UserInfo;
}
