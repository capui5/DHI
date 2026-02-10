sap.ui.define([
    "./BaseController",
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/core/Messaging",
    "sap/ui/core/message/Message",
    "sap/ui/core/message/MessageType",
    "sap/ui/core/BusyIndicator"
], (BaseController, Controller, MessageBox, MessageToast, Messaging, Message, MessageType, BusyIndicator) => {
    "use strict";

    return BaseController.extend("com.dhi.cms.cmsrequester.controller.ContractDetails", {
        onInit() {
            this.getRouter().getRoute("ContractDetails").attachPatternMatched(this._onObjectMatched, this);

        },
        _onObjectMatched: function (oEvent) {
            BusyIndicator.show(0);
            this.basicVaditionIds = ["contractTitleInput", "contractTypeSelect", "contractaliasInput", "contractdescriptionInput"];
            this.clearValidationStates(this.basicVaditionIds);
            if (this.getModel("Details").getProperty("/dynamicControlIds")) {
                this.clearValidationStates(this.getModel("Details").getProperty("/dynamicControlIds"));
            }
            // this.getModel("Details").setData();
            this._SelectedContractType = null;
            const oArgs = oEvent.getParameter("arguments");
            this.contractId = oArgs.contractId;
            const sRouteName = oEvent.getParameter("name");
            const isEditMode = !!this.contractId;
            this._oIconTabBar = this.byId("iconTabBar");
            if (!this.contractId) {
                this._initializeContractMasters();
            }
            else {
                this._getContractDetails();
            }

            // this._initializeViewState(oEvent, isEditMode, sRouteName);

            this._focusOnBasicInfoTab();
            // this._loadTenantData();
            this.getModel("appModel").setProperty("/focussedDate", new Date())
            this._filterContractTypeByCompany();
            BusyIndicator.hide();

        },

        _filterContractTypeByCompany: function () {
            var that = this;
            var oRolesModel = this.getOwnerComponent().getModel("roles");

            var fnApply = function () {
                var sCompanyName = oRolesModel.getProperty("/companyName");
                console.log("=== Filter Contract Type ===");
                console.log("Company Name for filter:", sCompanyName);
                if (!sCompanyName) {
                    console.log("No company name found, skipping filter");
                    return;
                }
                var oComboBox = that.byId("contractTypeSelect");
                if (oComboBox) {
                    var oBinding = oComboBox.getBinding("items");
                    console.log("ComboBox binding:", oBinding ? "found" : "NOT found");
                    if (oBinding) {
                        var oFilter = new sap.ui.model.Filter("AdminName", sap.ui.model.FilterOperator.EQ, sCompanyName);
                        oBinding.filter(oFilter);
                        console.log("Filter applied: AdminName =", sCompanyName);
                    }
                } else {
                    console.log("ComboBox contractTypeSelect NOT found");
                }
            };

            if (oRolesModel.getProperty("/companyLoaded")) {
                fnApply();
            } else {
                var fnHandler = function () {
                    if (oRolesModel.getProperty("/companyLoaded")) {
                        oRolesModel.detachPropertyChange(fnHandler);
                        fnApply();
                    }
                };
                oRolesModel.attachPropertyChange(fnHandler);
            }
        },

        _initializeContractMasters: function () {
            const data = {
                "ID": null,
                "alias": null,
                "contract_id": null,
                "description": null,
                "end_date": null,
                "is_visible": true,
                "name": null,
                "start_date": null,
                "templates_ID": null,
                "company_CompanyCode": null,
                "attribute_values": [],
                "attachments": [],
                "status": "New"
            };

            this.getModel("contractModel").setData(data);
            this.getModel("appModel").setProperty("/isFieldEditable", true)
            this.getModel("appModel").setProperty("/attachmentsMode", "Delete")
        },
        _getContractDetails: async function () {
            let oModel = this.getModel();
            let sPath = "/Contracts('" + this.contractId + "')";
            let oContext = oModel.bindContext(sPath, undefined, { $expand: "attribute_values,attachments" });
            let oDetail = await oContext.requestObject().then(function (oData) {
                console.log(oData);
                return oData;
            })
            this.contractData = oDetail;
            this.getModel("contractModel").setData(oDetail);
            this.getModel("appModel").setProperty("/status", oDetail.status);
            if (oDetail.status === "Draft") {
                this.getModel("appModel").setProperty("/isFieldEditable", true)
                this.getModel("appModel").setProperty("/attachmentsMode", "Delete")
            }
            else if (oDetail.status === "Submitted") {
                this.getModel("appModel").setProperty("/isFieldEditable", false)
                this.getModel("appModel").setProperty("/attachmentsMode", "None")
            }

        },

        _focusOnBasicInfoTab: function () {
            const oIconTabBar = this.byId("iconTabBar");
            oIconTabBar.setSelectedKey("BasicInfo");
            const oBasicInfoTab = oIconTabBar.getItems()[0].getDomRef();
            if (oBasicInfoTab) {
                oBasicInfoTab.focus();
            }
            this._currentTabKey = "BasicInfo";

        },

        onTabSelect: async function (navItemId) {
            let sSelectedKey = this.byId("iconTabBar").mProperties.selectedKey;
            if (typeof (navItemId) != "object") {
                sSelectedKey = navItemId;
            }
            this.byId("iconTabBar").setSelectedKey(this._currentTabKey)

            let sSelectedContractType = this.byId("contractTypeSelect").getSelectedKey();
            if (!this.byId("contractTypeSelect").getSelectedKey()) {

                this.byId("iconTabBar").setSelectedKey("BasicInfo")
                MessageBox.warning("Please select the Contract Type")
                return false;
            }
            if (this._currentTabKey === "BasicInfo") {
                if (!this.validateControls(this.basicVaditionIds)) {
                    MessageToast.show("Please fill all mandatory fields.");
                    return false;
                }
                if (!this.onDateChange()) {
                    MessageToast.show("Please fix date errors");
                    return;
                }
            }

            if (sSelectedKey != "BasicInfo") {
                if (this._SelectedContractType
                    != sSelectedContractType) {
                    this.getView().setBusy(true)

                    await this.initializeDetails();
                    this._previewLayout();
                    this.getView().setBusy(false)
                }
            }
            if (sSelectedKey === "Details") {
                this._setDefaultFirstDetailsSectionTab();
            }
            if (sSelectedKey === "ContractPrev") {
                this._previewLayout();
            }
            this._SelectedContractType = sSelectedContractType;
            this._currentTabKey = sSelectedKey;
            this.byId("iconTabBar").setSelectedKey(sSelectedKey);
            return true;
        },

        handleNextTabpress: async function (navItemId) {
            const bCanNavigate = await this.onTabSelect(navItemId);

            if (bCanNavigate) {
                this._oIconTabBar.setSelectedKey(navItemId);
            } else {
                this._oIconTabBar.setSelectedKey(this._currentTabKey);
            }
        },
        _setDefaultFirstDetailsSectionTab: function () {
            var oTabBar = this.byId("idSpecificationBox");
            var groups = this.getView().getModel("Details").getProperty("/AttributeGroups");

            if (groups && groups.length > 0) {
                oTabBar.setSelectedKey(groups[0].Attribute_Groups_ID);
            }

        },
        initializeDetails: function () {
            const oODataModel = this.getOwnerComponent().getModel(); // your OData V4 model (must be set in Component)
            let sSelectedTemplate = this.byId("contractTypeSelect").getSelectedKey();
            const that = this;

            // 1) Build the CDS view navigation path (portal view)
            const templatePortalPath = `/TemplatePortalCatalogue(TemplateID='${sSelectedTemplate}')`;

            // 2) Bind a context to that path and then create a list binding for the "Set" navigation
            const templateContextBinding = oODataModel.bindContext(templatePortalPath);
            const templateContext = templateContextBinding.getBoundContext();

            // list binding for child collection 'Set' under that context (own request so it fetches independently)
            this.productSpecificationBinding = oODataModel.bindList("Set", templateContext, [], [], {
                $$ownRequest: true
            });

            this.model = oODataModel;
            this.isBound = true;

            // 3) Request the contexts (rows). Adjust range (0,100) if you expect more rows.
            return this.productSpecificationBinding.requestContexts(0, 100).then(async function (aContexts) {
                // aContexts is an array of sap.ui.model.odata.v4.Context
                const rows = aContexts.map(function (ctx) {
                    return ctx.getObject(); // plain JS object per row from the CDS view
                });
                const groupsMap = {};
                for (const row of rows) {
                    const gid = row.Attribute_Groups_ID || "defaultGroup";
                    let AttributeTypeAssociation;
                    if (!groupsMap[gid]) {
                        groupsMap[gid] = {
                            Attribute_Groups_ID: gid,
                            Attribute_Group_Name: row.Attribute_Group_Name || "Group",
                            Attribute_Group_Role: row.Attribute_Group_Role || "",
                            AttributeGroupOrder: row.AttributeGroupOrder || 0,
                            Attributes: []
                        };
                    }

                    let attributeValue = row.Attribute_Value || "";
                    // AUTO CONVERT DATE STRINGS INTO JS DATE OBJECT FOR DATEPICKER
                    if (row.AttributeType.toLowerCase() === "date") {
                        attributeValue = that._formateDateToDateValueFormat(attributeValue, row.AttributeType);
                    }
                    if (row.AttributeType === "select") {
                        AttributeTypeAssociation = await that._getCombovalues(row.Attribute_ID);
                        AttributeTypeAssociation = AttributeTypeAssociation.combovalues;
                    }

                    // Determine the value based on whether contractId exists

                    if (that.contractId) {
                        if (that.contractData && that.contractData.attribute_values) {
                            // Find matching attribute_value by both attribute_groups_ID and attributes_ID
                            const matchingAttrValue = that.contractData.attribute_values.find(av =>
                                av.attribute_groups_ID === row.Attribute_Groups_ID &&
                                av.attributes_ID === row.Attribute_ID
                            );

                            if (matchingAttrValue) {
                                attributeValue = matchingAttrValue.valueJson || "";
                            }
                            if (row.AttributeType.toLowerCase() === "date") {
                                attributeValue = that._formateDateToDateValueFormat(attributeValue, row.AttributeType);
                            }
                        }
                    }

                    // normalize attribute row to a shape your factory expects
                    const attr = {
                        Attribute_ID: row.Attribute_ID,
                        Attribute_Name: row.Attribute_Name,
                        AttributeOrder: row.AttributeOrder || 0,
                        IsMandatory: !!row.Is_Required,
                        AttributeType: row.AttributeType || "String",
                        AttributeTypeAssociation: AttributeTypeAssociation || [],
                        Value: attributeValue,
                        IsPortalEnabled: typeof row.IsPortalEnabled !== "undefined" ? row.IsPortalEnabled : null,
                        Portal_ID: row.Portal_ID || null
                    };
                    groupsMap[gid].Attributes.push(attr);
                };

                // convert map -> sorted array
                let grouped = Object.keys(groupsMap).map(function (k) { return groupsMap[k]; });
                grouped.sort(function (a, b) { return a.AttributeGroupOrder - b.AttributeGroupOrder; });
                grouped.forEach(function (g) {
                    g.Attributes.sort(function (a, b) { return a.AttributeOrder - b.AttributeOrder; });
                });

                const modelData = { AttributeGroups: grouped };
                that.getOwnerComponent().getModel("Details").setData(modelData);
                console.log("Details", that.getOwnerComponent().getModel("Details").getData())

                return modelData; // optional: allow caller to chain
            }).catch(function (err) {
                jQuery.sap.log.error("Failed to load TemplatePortalCatalogue Set", err);
                throw err;
            });
        },
        _formateDateToDateValueFormat: function (attributeValue, AttributeType) {
            if (
                typeof attributeValue === "string" &&
                attributeValue.trim() !== "" &&
                AttributeType &&
                AttributeType.toLowerCase() === "date"
            ) {
                const parsed = new Date(attributeValue);

                if (!isNaN(parsed.getTime())) {
                    attributeValue = parsed;   // <-- IMPORTANT: pass actual Date object
                } else {
                    console.warn("Invalid date format:", attributeValue);
                    attributeValue = null;
                }
            }
            else if (
                attributeValue === "") {
                attributeValue = null;
            }
            return attributeValue;
        },

        onNavigation: function (sNavigationTarget) {
            var oRouter = this.getOwnerComponent().getRouter();
            var sNavigationTarget;
            if (sNavigationTarget) {
                oRouter.navTo(sNavigationTarget);
            } else {
                console.error("Navigation target not defined.");
            }
        },
        formatDate: function (sDate) {
            if (!sDate) { return ""; }
            // handle both ISO strings and already formatted dates
            try {
                var d = new Date(sDate);
                if (isNaN(d.getTime())) { return sDate; }
                var pad = function (n) { return n < 10 ? "0" + n : n; };
                return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
            } catch (e) {
                return sDate;
            }
        },

        /**
         * parts[0] = Value (string or boolean-like)
         * parts[1] = AttributeType (Input, DatePicker, MultiInput, CheckBox...)
         */
        formatAttribute: function (sValue, sAttributeType) {
            // normalize null/undefined
            if (sValue === null || typeof sValue === "undefined" || sValue === "") {
                return ""; // show empty if no value
            }

            // Checkboxes -> render Yes/No
            if (sAttributeType === "CheckBox") {
                // Accept boolean or string representations
                if (sValue === true || sValue === "true" || sValue === "1" || sValue === 1) { return "Yes"; }
                return "No";
            }

            // DatePicker -> format date
            if (sAttributeType === "DatePicker") {
                return this.formatDate(sValue);
            }

            // MultiInput -> if tokens serialized as comma-separated string, show as-is;
            // if it's an array, join with comma:
            if (sAttributeType === "MultiInput") {
                if (Array.isArray(sValue)) {
                    return sValue.join(", ");
                }
                return String(sValue);
            }

            // Default -> just return the value as string
            return String(sValue);
        },
        onRowsUpdated: function () {
            var oTable = this.byId("UploadSetTable");
            this.getModel("appModel").setProperty("/AttachmentsCount", oTable.getBinding("items").getLength());
        },
        onUploadCompleted: async function (oEvent) {
            this.getView().setBusy(true)
            let vItem = oEvent.getParameters().item;
            let Attachments = this.getModel("contractModel").getProperty("/attachments") || [];
            let aItems = Array.isArray(vItem) ? vItem : [vItem];
            let total = Attachments.length + aItems.length;
            if (total > 5) {
                MessageBox.warning("Attachments limit is Exceeded.");
                return;
            }
            let that = this;
            const newFiles = await Promise.all(
                aItems.map(async function (oItem) {
                    return await that._getfiledata(oItem);
                })
            );
            Attachments.push(...newFiles);
            this.getModel("contractModel").setProperty("/attachments", Attachments);
            console.log("Mapped upload results:", Attachments);
            this.getView().setBusy(false)
        },
        onBeforeUploadStarts: function (oEvent) {
            let oItem = oEvent.getParameter("item");
            let oModel = this.getModel("contractModel");
            let Attachments = oModel.getProperty("/attachments") || [];

            let sFileName = oItem.getFileName();

            let bDuplicate = Attachments.some(function (oFile) {
                return (
                    oFile.file_name === sFileName
                );
            });

            if (bDuplicate) {
                MessageBox.warning("This file is already uploaded.");
                oEvent.preventDefault();
            }
        },

        onDeleteDocumentPress: function (oEvent) {
            var oListItem = oEvent.getParameter("listItem");
            if (!oListItem) {
                console.log("Delete event fired without listItem");
                return;
            }

            var oModel = this.getModel("contractModel");
            var oContext = oListItem.getBindingContext("contractModel");
            if (oContext) {
                var sPath = oContext.getPath();
                var aParts = sPath.split("/");
                var sIndex = aParts.pop();
                var aAttachments = oModel.getProperty("/attachments") || [];
                var iIndex = parseInt(sIndex, 10);

                if (!isNaN(iIndex) && iIndex >= 0 && iIndex < aAttachments.length) {
                    sap.m.MessageBox.confirm("Are you sure you want to delete this attachment?", {
                        onClose: function (sAction) {
                            if (sAction === sap.m.MessageBox.Action.OK) {
                                aAttachments.splice(iIndex, 1);
                                oModel.setProperty("/attachments", aAttachments);
                            } else {

                            }
                        }
                    });
                } else {
                    console.error("Invalid attachment index:", sIndex, "path:", sPath);
                }
            } else {

                var sFileName = oListItem.getCells && oListItem.getCells()[0] && oListItem.getCells()[0].getText && oListItem.getCells()[0].getText();
                var aAttachments = oModel.getProperty("/attachments") || [];
                var i = aAttachments.findIndex(function (it) {
                    return it.file_name === sFileName || it.file_url === sFileName; // adjust as needed
                });
                if (i >= 0) {
                    aAttachments.splice(i, 1);
                    oModel.setProperty("/attachments", aAttachments);
                } else {
                    console.warn("Could not find matching attachment to delete (fallback).");
                }
            }
        },
        // handleSaveContractBasicInfo: async function () {
        //     const contractMasterData = this.getModel("contractModel").getData();
        //     contractMasterData.attachments = [];
        //     contractMasterData.attribute_values = [];
        //     contractMasterData.status = "Draft";
        //     let oResponse = await this.ODataPost("/Contracts", contractMasterData)
        //     if (oResponse) {
        //         this.getModel("contractModel").setData(oResponse);
        //     }

        // },
        handleSaveandSubmitContractDetails: async function (sSaveType) {
            let contractMasterData = this.getModel("contractModel").getData();
            let sMessage = contractMasterData.name + " Contract Saved Successfully";
            if (!this.validateControls(this.basicVaditionIds)) {
                MessageToast.show("Please fill all mandatory fields.");
                return;
            }
            contractMasterData.status = "Draft";

            // Set company from logged-in user's company
            var oRolesModel = this.getOwnerComponent().getModel("roles");
            var sCompanyCode = oRolesModel.getProperty("/companyCode");
            if (sCompanyCode) {
                contractMasterData.company_CompanyCode = sCompanyCode;
            }

            if (sSaveType === "submit") {
                if (!this.validateControls(this.getModel("Details").getProperty("/dynamicControlIds"))) {
                    MessageToast.show("Please fill all mandatory fields in Details Section.");
                    this.byId("iconTabBar").setSelectedKey("Details")
                    return;
                }
                contractMasterData.status = "Submitted";
                sMessage = contractMasterData.name + " Contract Submitted Successfully";
            }
            contractMasterData.attribute_values = this.convertModelDataToAttributeValues();

            let that = this;
            if (!this.contractId) {

                try {

                    const sId = await this.ODataPost("/Contracts", contractMasterData);
                    if (sId) {
                        MessageBox.success(sMessage, {
                            actions: [MessageBox.Action.OK],
                            onClose: function (oAction) {
                                if (oAction === MessageBox.Action.OK) {
                                    that.getRouter().navTo("Contracts");
                                }
                            }
                        });
                    }
                    else {
                        MessageBox.warning("Cannot" + sMessage);
                    }

                } catch (err) {
                    console.error("Create failed:", err);
                    MessageToast.show("Contract creation failed");
                }
            }
            else {
                console.log(this.getAppModulePathBaseURL());
                $.ajax({
                    url: this.getAppModulePathBaseURL() + "/contracts/Contracts('" + this.contractId + "')",
                    method: "PUT",
                    contentType: "application/json",
                    data: JSON.stringify(contractMasterData),
                    success: function (data) {
                        console.log(data)
                        MessageBox.success(sMessage, {
                            actions: [MessageBox.Action.OK],
                            onClose: function (oAction) {
                                if (oAction === MessageBox.Action.OK) {
                                    that.getRouter().navTo("Contracts");
                                }
                            }
                        });
                    },
                    error: function (error) {
                        MessageToast.show("Error submitting data");
                    }
                });
            }
        },
        convertModelDataToAttributeValues: function () {
            const modelData = this.getModel("Details").getData();
            const result = [];
            if (!modelData || !Array.isArray(modelData.AttributeGroups)) return result;
            modelData.AttributeGroups.forEach(group => {
                const groupId = group.Attribute_Groups_ID;
                (group.Attributes || []).forEach(attr => {
                    let rawValue = (typeof attr.Value !== "undefined" && attr.Value !== null) ? attr.Value : "";
                    if (attr.AttributeType === "boolean") {
                        rawValue = String(rawValue);
                    }
                    let valueJson = rawValue;
                    result.push({
                        attribute_groups_ID: groupId,
                        attributes_ID: attr.Attribute_ID,
                        valueJson: valueJson
                    });
                });
            });

            return result;
        },
        validateControls: function (idList) {
            let isValid = true;

            idList.forEach(id => {
                let control = this.byId(id);

                if (!control) {
                    control = sap.ui.getCore().byId(id);
                    if (!control) {
                        console.log("Control not found:", id);
                        return;
                    }
                }
                let value = null;
                if (control.getValue) {
                    value = control.getValue();
                } else if (control.getSelectedKey) {
                    value = control.getSelectedKey();
                } else if (control.getDateValue) {
                    value = control.getDateValue();
                } else if (control.getSelected) {
                    value = control.getSelected();
                }
                if (typeof value === "string") {
                    value = value.trim();
                }
                const invalid = (value === null || value === "" || value === undefined);

                if (invalid) {
                    isValid = false;
                    control.setValueState("Error");
                    control.setValueStateText("This field is required.");
                } else {
                    control.setValueState("None");
                }
            });
            return isValid;
        },
        clearValidationStates: function (idList) {
            idList.forEach(id => {
                let control = this.byId(id);
                if (!control) {
                    control = sap.ui.getCore().byId(id);
                    if (!control) {
                        console.log("Control not found:", id);
                        return;
                    }
                }
                if (control.setValueState) {
                    control.setValueState("None");
                    control.setValueStateText("");
                }

            });
        },
        onControlValueChange: function (oEvent) {
            const oControl = oEvent.getSource();
            let v = null;
            if (oControl.getValue) {
                v = oControl.getValue();
            } else if (oControl.getSelectedKey) {
                v = oControl.getSelectedKey();
            } else if (oControl.getDateValue) {
                v = oControl.getDateValue();
            } else if (oControl.getSelected) {
                v = oControl.getSelected();
            }
            if (v !== null && v !== "" && v !== undefined) {
                oControl.setValueState("None");
                oControl.setValueStateText("");
            }
        },
        onDateChange: function () {
            const oStartPicker = this.byId("dpStartDate");
            const oEndPicker = this.byId("dpEndDate");

            const sStartDate = oStartPicker.getValue();
            const sEndDate = oEndPicker.getValue();

            // Reset states
            oStartPicker.setValueState("None");
            oEndPicker.setValueState("None");

            // Validate only if both values exist
            if (sStartDate && sEndDate && sEndDate <= sStartDate) {
                oEndPicker.setValue("");
                oEndPicker.setValueState("Error");
                oEndPicker.setValueStateText("Expiry date must be greater than start date");
                return false;
            }

            return true;
        },
        _previewLayout: function () {
            const oView = this.getView();
            const oDetailsModel = oView.getModel("Details");
            const aGroups = oDetailsModel.getProperty("/AttributeGroups");
            const oContainer = oView.byId("previewDialogVBox");
            oContainer.removeAllItems();
            aGroups.forEach(group => {
                const oPanel = new sap.m.Panel({
                    headerText: group.Attribute_Group_Name,
                    expandable: false,
                    expanded: true,
                    width: "98%"
                });
                const oForm = new sap.ui.layout.form.SimpleForm({
                    editable: true,
                    layout: "ColumnLayout"
                });
                group.Attributes.forEach(attr => {
                    // Label
                    oForm.addContent(new sap.m.Label({
                        text: attr.Attribute_Name
                    }));
                    // Value Text (formatted)
                    oForm.addContent(new sap.m.Text({
                        text: this.formatAttribute(attr.Value, attr.AttributeType)
                    }));
                });
                oPanel.addContent(oForm);
                oPanel.addStyleClass("groupPanelClass");
                oContainer.addItem(oPanel);
                this.byId("prevTemplate").setText(this.byId("contractTypeSelect").getSelectedItem().getProperty("text"))
            });
        },
    });
});