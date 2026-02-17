namespace com.dhi.cms;


using {
    cuid,
    managed
} from '@sap/cds/common';

@assert.unique: {uniqueAttributeName: [name]}
entity Attributes : cuid, managed {
    attribute_id : String;
    name         : String @mandatory;
    desc         : String;
    alias        : String @mandatory;
    type         : String;
    value        : String;
    // regex        : String;
    status       : String;
    // tags         : String;
    // multilingual : Boolean;
    // schemaJson   : LargeString;
    contracts    : Association to many ContractsAttributes
                       on contracts.attributes = $self;
    title        : String;
    maxlength    : Integer;
    minlength    : Integer;
    is_mandatory : Boolean;
    grpItems : Composition of many AttributeGroupAttribute
        on grpItems.attribute = $self;
    combovalues : Composition of many ComboValues on combovalues.attribute=$self
}

entity ComboValues : cuid {
    attribute:Association to Attributes;
    value: String;
}
entity AttributeGroupAttribute : cuid, managed {
    attributeGroup  : Association to Attribute_Groups;
    attribute       : Association to Attributes;
    sortID          : Integer;
}
  @assert.unique: {uniqueAttributeGroupName: [name]}
entity Attribute_Groups : cuid, managed {
    attribute_group_id : String;
    name               : String(100) @mandatory;
    desc               : String(100);
    alias              : String(100);
    templates          : Association to many TemplatesAttributeGroups
                             on templates.attribute_groups = $self;
    attributes         : Composition of many AttributeGroupAttribute
                             on attributes.attributeGroup = $self;
    attribute_templates : Composition of many TemplatesAttributeGroups
                            on attribute_templates.attribute_groups = $self;
// role               : String(100);
}

entity TemplatesAttributeGroups : cuid, managed {
    key templates        : Association to Templates;
    key attribute_groups : Association to Attribute_Groups;
        sortID           : Integer;
}

@assert.unique: {uniqueTemplateName: [name]}
entity Templates : cuid, managed {
    template_id      : String;
    name             : String(100) @mandatory;
    desc             : String(100);
    contracts        : Composition of many Contracts
                           on contracts.templates = $self;
    attribute_groups : Composition of many TemplatesAttributeGroups
                           on attribute_groups.templates = $self;
        Status : String(20) default 'SUBMITTED';
        ApprovedBy      : String(100);
        ApprovedAt      : Timestamp;
        RejectionReason : String(255);
        RejectedBy      : String(100);
        RejectedAt      : Timestamp;
        AdminName       : String(200);
}

entity Companies {
    key CompanyCode : String(20);
    CompanyName     : String(200);
    contracts       : Association to many Contracts
                          on contracts.company = $self;
    admins          : Composition of many CompanyAdmins
                          on admins.company = $self;
}

entity CompanyAdmins : cuid {
    company   : Association to Companies;
    adminId   : String(100);
    adminName : String(200);
}

entity ContractsAttributes : cuid, managed {
    key contracts        : Association to Contracts;
    key attribute_groups : Association to Attribute_Groups;
    key attributes       : Association to Attributes;
        valueJson        : LargeString;
}
@assert.unique: {uniqueProductName: [name]}
entity Contracts : cuid, managed {
    contract_id      : String(30);
    name             : String
                                                @mandatory;
    description      :  String;
    alias            :  String         @mandatory;
    start_date       : Date;
    end_date         : Date;
    is_visible       : Boolean;

    templates        : Association to Templates @assert.target;
    company          : Association to Companies;
    attachments      : Composition of many Attachments
                           on attachments.contracts = $self;
    attribute_values : Composition of many ContractsAttributes
                           on attribute_values.contracts = $self;
    status          : String default 'Draft';
    ApprovedBy      : String(100);
    ApprovedAt      : Timestamp;
    RejectionReason : String(255);
    RejectedBy      : String(100);
    RejectedAt      : Timestamp;
}

entity NotificationLogs : cuid, managed {
    contract         : Association to Contracts;
    notificationType : String(50);   // e.g. 'contract.expiring.30d', 'contract.expired'
    recipientEmail   : String(200);
    reminderWindow   : String(10);   // '30d', '14d', '7d', 'expired'
    severity         : String(20);   // 'INFO', 'WARNING', 'ERROR'
    status           : String(20);   // 'Sent', 'Failed'
    errorMessage     : String(500);
    retryCount       : Integer default 0;
    sentAt           : Timestamp;
}

entity Attachments : cuid, managed {
    contracts     : Association to Contracts;
    file_url      : String;

    @Core.IsMediaType                : true
    media_type    : String;

    @Core.ContentDisposition.Filename: file_name
    file_name     : String(100);
    file_size:String;
    file_name_dms : String(150);
    previewable   : String default 'true';
    trustedSource : String default 'true';
    desc          : String;
    dimension     : String;
    tags          : String;
    embedded_link : String;

    @Core.MediaType                  : media_type
    file_content  : LargeBinary;
}

define view TemplatePortalCatalogue with parameters TemplateID: String as
    select from TemplatesAttributeGroups as _Templates
    left join AttributeGroupAttribute as _AttributeGroupsAttr
        on _Templates.attribute_groups.ID = _AttributeGroupsAttr.attributeGroup.ID
    left join Attribute_Groups as _AttributeGroups
        on _Templates.attribute_groups.ID = _AttributeGroups.ID
    left join Attributes as _Attributes
        on _AttributeGroupsAttr.attribute.ID = _Attributes.ID
    {
        key _Templates.templates.ID           as Template_ID,
            _Templates.templates.name         as Template_Name,
            _Templates.templates.desc         as Template_Description,

        key _Templates.attribute_groups.ID    as Attribute_Groups_ID,
            _AttributeGroups.name           as Attribute_Group_Name,
            _Templates.sortID                 as AttributeGroupOrder,

        key _AttributeGroupsAttr.attribute.ID as Attribute_ID,
            _Attributes.name                  as Attribute_Name,
            _Attributes.value                  as Attribute_Value,
            _Attributes.type                  as AttributeType,
            _AttributeGroupsAttr.sortID       as AttributeOrder,
            _Attributes.is_mandatory          as Is_Required
    }
    where
        _Templates.templates.ID = :TemplateID
    order by
        _Templates.sortID,
        _AttributeGroupsAttr.sortID;

        define view AttributeGroupCatalogue as
        select from Attribute_Groups as _AttributeGroups
        left join TemplatesAttributeGroups as _templateGroups
            on _AttributeGroups.ID = _templateGroups.attribute_groups.ID
        {
            key _AttributeGroups.ID                   as ID,
            key _AttributeGroups.attribute_group_id   as attribute_group_id,
                _AttributeGroups.name                 as name,
                _AttributeGroups.desc                 as desc,
                _AttributeGroups.alias                as alias,
                _templateGroups.templates.name        as template_name,
            key _templateGroups.templates.template_id as template_id

        }
