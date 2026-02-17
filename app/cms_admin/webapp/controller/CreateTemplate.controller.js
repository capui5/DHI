sap.ui.define([
    "./BaseController",
    "sap/ui/core/Fragment",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap/m/MessageBox"

],

    function (BaseController, Fragment, Filter, FilterOperator, MessageToast, MessageBox) {
        "use strict";

        return BaseController.extend("com.dhi.cms.cmsadmin.controller.CreateTemplate", {
            onInit: function () {
                this.getRouter().getRoute("Create Template").attachPatternMatched(this._onObjectMatched, this);
            },

            _onObjectMatched: function (oEvent) {
                var sRouteName = oEvent.getParameter("name");
                var oArgs = oEvent.getParameter("arguments");
                var templateId = oArgs.templateId;
                if (templateId) {
                    this._fnReadExistingTemplate(templateId);
                } else {
                    this._fnReadAttributeGroup();
                    // Initialize new arrays for CRUD
                    this.getModel("appModel").setProperty("/Template", {
                        name: "",
                        desc: "",
                        AdminName: ""
                    });
                    this.getModel("appModel").setProperty("/AttributeGroups", []);
                }
                var isEditMode = !!templateId;
                this.getModel("appModel").setProperty("/isEditMode", isEditMode);
                // this._updateBreadcrumbs(sRouteName);
                this.templateId = templateId;
                this._fnRegisterMessageManager();
                var sTitle = isEditMode ? this.getResourceBundle().getText("Update_Template_Title") : this.getResourceBundle().getText("Create_Template_Title");
                this.getView().byId("createTemplateTitle").setText(sTitle);
                this.templateRankLogic();
                this.getModel("appModel").setProperty("/selectedTemplateTab", "TemplateDetails");
                this.byId("templateIconTabBar").setSelectedKey("TemplateDetails");
            },

            templateRankLogic: function () {
                this.getModel("appModel").refresh(true);
                var oTreeTable = this.byId("tblAttrGrpTemplate2");
                var oFilter = new Filter("Rank", FilterOperator.GT, 0);
                var oBindingInfo = {
                    path: "appModel>/AttributeGroups",
                    parameters: {
                        arrayNames: ["attributes"]
                    },
                    filters: [oFilter]
                };

                oTreeTable.bindRows(oBindingInfo);
            },

            mergeAttributeGroups: function (oldAttributeGroups, newAttributeGroups) {
                // Create a map to store attributes by name for quick lookup
                const attributeGrpMap = new Map(oldAttributeGroups.map(attrGrp => [attrGrp.name, attrGrp]));

                // Merge or update attributes from newAttributeGroups
                newAttributeGroups.forEach(newAttrGrp => {
                    if (!attributeGrpMap.has(newAttrGrp.name)) {
                        // If the attribute group name is not already in oldAttributeGroups, add it
                        oldAttributeGroups.push({ ...newAttrGrp });
                    } else {
                        // If the attribute group name already exists, update its properties
                        const existingAttrGrp = attributeGrpMap.get(newAttrGrp.name);
                        Object.assign(existingAttrGrp, newAttrGrp); // Merge newAttr properties into existingAttr
                    }
                });

                return oldAttributeGroups;
            },

            _fnReadAttributeGroup: function () {
                var that = this;
                var oModel = this.getModel(); // OData V4
                return new Promise(function (resolve, reject) {
                    oModel.bindList("/Attribute_Groups", undefined, undefined, undefined, {
                        $$updateGroupId: "readAttributeGroups",
                        $expand: "attributes($expand=attribute)"
                    }).requestContexts().then(function (aContexts) {
                        var newAttributeGroups = aContexts.map(oContext => oContext.getObject());
                        newAttributeGroups.forEach(group => {
                            group.attributes?.forEach(attr => {
                                if (attr.attribute) {
                                    attr.name = attr.attribute.name || null;
                                    attr.desc = attr.attribute.desc || null;
                                }
                            });
                        });
                        var currentAttributeGroups = that.getModel("appModel").getProperty("/AttributeGroups") || [];
                        const currentAttributeGroupsMap = new Map(currentAttributeGroups.map(attrGrp => [attrGrp.name, attrGrp]));
                        var filteredNewAttributeGroups = newAttributeGroups.filter(attrGrp => {
                            if (!currentAttributeGroupsMap.has(attrGrp.name)) {
                                attrGrp.Rank = 0;
                                return true;
                            }
                            return false;
                        });
                        that.getModel("appModel").setProperty("/FilteredAttributeGroups", filteredNewAttributeGroups);
                        resolve();
                    }).catch(function (oError) {
                        console.error("Error reading Attribute Groups (V4):", oError);
                        reject(oError);
                    });
                });
            },

            _fnReadExistingTemplate: function (templateId) {
                debugger
                var that = this;
                // Construct the OData service path for the Templates entity
                var sPath = "/Templates(" + templateId + ")";

                // Define the parameters for expanding related entities
                var oParameters = {
                    $expand: "attribute_groups($select=ID,sortID;$expand=attribute_groups($select=ID,attribute_group_id,name,desc;$expand=attributes($select=sortID;$expand=attribute)))"
                };

                // Bind the context for the specified path with the defined parameters
                var oBindingContext = this.getModel().bindContext(sPath, null, oParameters);

                // Request the object data from the bound context
                oBindingContext.requestObject().then(function (oData) {
                    if (Array.isArray(oData.attribute_groups)) {
                        oData.attribute_groups.forEach(function (group) {
                            // Set Rank equal to sortID if available, otherwise default to 0
                            group.Rank = group.sortID || 0;

                            if (group.attribute_groups) {
                                // Copy name and desc from the nested attribute_groups entity
                                group.name = group.attribute_groups.name || "";
                                group.desc = group.attribute_groups.desc || "";

                                if (Array.isArray(group.attribute_groups.attributes)) {
                                    group.attributes = group.attribute_groups.attributes.map(function (attrWrapper) {
                                        var flattenedAttr = attrWrapper.attribute || {};
                                        // Add isPortalEnabled from wrapper to the attribute
                                        // flattenedAttr.isPortalEnabled = attrWrapper.isPortalEnabled;
                                        // Also keep sortID from wrapper if needed for sorting
                                        flattenedAttr.sortID = attrWrapper.sortID;
                                        return flattenedAttr;
                                    });

                                    // Now sort the attributes array by sortID ascending
                                    group.attributes.sort(function (a, b) {
                                        return (a.sortID || 0) - (b.sortID || 0);
                                    });
                                } else {
                                    group.attributes = [];
                                }
                            } else {
                                group.name = "";
                                group.desc = "";
                                group.attributes = [];
                            }
                        });

                        // Update the model with the modified data
                        that.getModel("appModel").setProperty("/Template", oData);
                        that.getModel("appModel").setProperty("/AttributeGroups", oData.attribute_groups);
                    }
                });
            },

            onAddAttributeGroup: function () {
                var that = this;
                var oView = this.getView();
                oView.setBusyIndicatorDelay(0);
                oView.setBusy(true);
                if (!this._pDialog) {
                    this._pDialog = Fragment.load({
                        id: oView.getId(),
                        name: "com.dhi.cms.cmsadmin.fragments.templates.AddAttributeGroup",
                        controller: this
                    }).then(function (oDialog) {
                        oView.addDependent(oDialog);
                        return oDialog;
                    });
                }
                // Load data, then open dialog
                this._fnReadAttributeGroup().then(function () {
                    var oAppModel = that.getModel("appModel");
                    var aAssociatedAttributeGroups = oAppModel.getProperty("/AttributeGroups") || [];
                    that._iRankCounter = aAssociatedAttributeGroups.length ? Math.max(...aAssociatedAttributeGroups.map(attr => attr.Rank)) + 1 : 1;
                    var hasSortID = aAssociatedAttributeGroups.some(attrGrp => attrGrp.sortID !== undefined);
                    that._pDialog.then(function (oDialog) {
                        oDialog.clearSelection();
                        oDialog.open();
                        oView.setBusy(false);
                    });
                }).catch(function () {
                    oView.setBusy(false);
                });

            },

            // onAttributeSwitchChange: function (oEvent) {
            //     var bNewState = oEvent.getParameter("state");
            //     var oSwitch = oEvent.getSource();
            //     var oModel = this.getModel("appModel");

            //     var sCurrentPath = oSwitch.getBindingContext("appModel").getPath();
            //     // Example: "/AttributeGroups/0/attributes/1"

            //     var aParts = sCurrentPath.split("/");  // ["", "AttributeGroups", "0", "attributes", "1"]
            //     if (aParts.length < 5) {
            //         MessageBox.error("Invalid path to attribute.");
            //         return;
            //     }

            //     var iGroupIndex = parseInt(aParts[2], 10);
            //     var iAttributeIndex = parseInt(aParts[4], 10);

            //     var oAttributeEntry = oModel.getProperty("/AttributeGroups/" + iGroupIndex);
            //     var oNestedAttribute = oAttributeEntry?.attribute_groups?.attributes?.[iAttributeIndex];

            //     if (!oNestedAttribute || !oNestedAttribute.ID) {
            //         MessageBox.error("Please save template to change the attribute details.");
            //         return;
            //     }

            //     var sID = oNestedAttribute.ID;

            //     var oDataModel = this.getModel("oDataV2");
            //     var sPath = "/AttributeGroupAttribute(" + sID + ")";

            //     var payload = {
            //         isPortalEnabled: bNewState
            //     };

            //     var oBundle = this.getResourceBundle();

            //     oDataModel.update(sPath, payload, {
            //         success: function () {
            //             MessageToast.show(oBundle.getText("attributeUpdateSuccess"));
            //         },
            //         error: function (oError) {
            //             var sErrorMsg = oError.message + ": " + oError.statusCode;
            //             try {
            //                 sErrorMsg += " - " + JSON.parse(oError.responseText).error.message.value;
            //             } catch (e) {}
            //             MessageBox.error(sErrorMsg);
            //         }
            //     });
            // },

            onDropSelected: function (oEvent) {
                var that = this;
                var oDragged = oEvent.getParameter("draggedControl");
                var oDropped = oEvent.getParameter("droppedControl");
                var sDropPosition = oEvent.getParameter("dropPosition");

                var oTable = this.byId("tblAttrGrpTemplate");
                var oModel = this.getView().getModel("appModel");
                var aData = oModel.getProperty("/AttributeGroups");
                var aRankedData = aData.filter(function (item) {
                    return item.Rank > 0;
                });

                var iDraggedIndex = oTable.indexOfItem(oDragged);
                var iDroppedIndex = oTable.indexOfItem(oDropped);

                if (sDropPosition === "After") {
                    iDroppedIndex++;
                }

                // Remove the dragged item from its current index
                var oDraggedData = aRankedData.splice(iDraggedIndex, 1)[0];

                // Insert the dragged item into the new position
                aRankedData.splice(iDroppedIndex, 0, oDraggedData);

                // Update Rank property for all items in the filtered array
                for (var i = 0; i < aRankedData.length; i++) {
                    aRankedData[i].Rank = i + 1; // Update Rank starting from 1
                    if (aRankedData[i].sortID !== undefined) {
                        aRankedData[i].sortID = aRankedData[i].Rank; // Update sortID if available
                    }
                }
                // Update the original data array with updated ranks and sortIDs if available
                aData.forEach(function (item) {
                    var found = aRankedData.find(function (rankItem) {
                        return rankItem.ID === item.ID;
                    });
                    if (found) {
                        item.Rank = found.Rank;
                        if (found.sortID !== undefined) {
                            item.sortID = found.Rank; // Update sortID with updated Rank
                        }
                    }
                });

                // Set the modified data back to the model
                oModel.setProperty("/AttributeGroups", aRankedData);
            },

            //Validation check
            onSave: async function () {
                var bValid = true;
                var oNameInput = this.byId("templateNameInput");
                var oDescInput = this.byId("templateDescInput");
                var templateName = oNameInput.getValue();
                var templateDesc = oDescInput.getValue();
                // Template Name: required, max from XML
                const nameMaxLen = oNameInput.getMaxLength ? oNameInput.getMaxLength() : 50;
                if (!templateName || templateName.trim() === "") {
                    oNameInput.setValueState("Error");
                    oNameInput.setValueStateText("This field is required.");
                    bValid = false;
                } else if (templateName.length > nameMaxLen) {
                    oNameInput.setValueState("Error");
                    oNameInput.setValueStateText(`Name must be less than ${nameMaxLen} characters.`);
                    bValid = false;
                } else {
                    oNameInput.setValueState("None");
                }

                // Description: max from XML
                const descMaxLen = oDescInput.getMaxLength ? oDescInput.getMaxLength() : 100;
                if (templateDesc && templateDesc.length > descMaxLen) {
                    oDescInput.setValueState("Error");
                    oDescInput.setValueStateText(`Description must be less than ${descMaxLen} characters.`);
                    bValid = false;
                } else {
                    oDescInput.setValueState("None");
                }
                if (bValid === true) {
                    var oView = this.getView();
                    oView.setBusyIndicatorDelay(0);
                    oView.setBusy(true);
                    try {
                        await this.handleSaveTemplate();
                    } catch (err) {
                        console.error("Save failed:", err);
                        oView.setBusy(false);
                    }
                    this.byId("templateNameInput").setValueState("None");
                    this.byId("templateDescInput").setValueState("None");
                }
            },

            onSearch: function (oEvent) {
                var sValue = oEvent.getParameter("value");
                var oFilter = new Filter("name", FilterOperator.Contains, sValue);
                var oBinding = oEvent.getParameter("itemsBinding");
                oBinding.filter([oFilter]);
            },

            handleSaveTemplate: function () {
                var that = this;
                let oBundle = this.getResourceBundle();
                var oModel = this.getModel("appModel").getData().Template;
                var aAssociatedAttributeGroups = this.getModel("appModel").getData().AttributeGroups;

                // Define the payload with the current attribute groups and their ranks
                var payload = {
                    "name": oModel.name,
                    "desc": oModel.desc,
                    "AdminName":oModel.AdminName,
                    "attribute_groups": []
                };
                console.log("=== Template Save Payload ===");
                console.log("Full appModel Template data:", JSON.stringify(oModel, null, 2));
                console.log("Payload being sent:", JSON.stringify(payload, null, 2));

                // Prepare payload with attribute groups' current ID and rank
                for (var i = 0; i < aAssociatedAttributeGroups.length; i++) {
                    var attrGroup = aAssociatedAttributeGroups[i];

                    // Check if the attribute group has a defined ID, indicating it's not newly added
                    if (attrGroup.Rank > 0) {
                        var attributeGroupsPayload = {
                            "sortID": attrGroup.Rank
                        };

                        // Include attribute_groups_ID if it already exists (for reordering)
                        if (attrGroup.attribute_groups_ID) {
                            attributeGroupsPayload.attribute_groups_ID = attrGroup.attribute_groups_ID;
                        } else {
                            // For new attribute groups, include the ID of the associated attribute group
                            attributeGroupsPayload.attribute_groups_ID = attrGroup.ID; // Assuming 'ID' is the attribute group ID
                        }

                        payload.attribute_groups.push(attributeGroupsPayload);
                    }
                }

                if (payload.attribute_groups.length === 0) {
                    MessageBox.error(oBundle.getText("templateNoAttributeGroupError"));

                    throw new Error("No attribute groups associated with the template.");
                }

                // Creating a new template
                if (oModel.ID === undefined) {
                    var oView = this.getView();
                    this.getModel().resetChanges("$auto", true);
                    var oListBinding = this.getModel().bindList("/Templates", undefined, undefined, undefined, undefined);
                    this.getModel().resetChanges();
                    this.oContext = oListBinding.create(payload, {
                        bSkipRefresh: true
                    });
                    this._refreshMessageManager();
                    this.getModel().submitBatch("$auto").then(function (response) {
                        var aMessages = that.getModel("message").getData();
                        var oErrorMessage = aMessages.slice().reverse().find((message) => message.type === 'Error');
                        if (oErrorMessage) {
                            let backendMsg = '';
                            try {
                                backendMsg = oErrorMessage.message;
                            } catch (e) {
                                backendMsg = "An unexpected error occurred.";
                            }
                            if (backendMsg && backendMsg.toLowerCase().startsWith('unique constraint violated')) {
                                MessageBox.error('Enter Unique Template name');
                            } else {
                                MessageBox.error(`Error: ${backendMsg}`);
                            }
                            that._refreshMessageManager();
                            oView.setBusy(false);
                            return;
                        } else {
                            debugger
                            var sNewGroupPath = that.oContext.getPath();
                            var newTemplateId = that.extractIdFromPath(sNewGroupPath);
                            that._refreshMessageManager();
                            setTimeout(function () {
                                that._fnReadExistingTemplate(newTemplateId).then(function (oData) {
                                    debugger
                                    that.getModel("appModel").setProperty("/Template/template_id", oData.template_id);
                                });
                            }, 1000);
                            MessageBox.success(oBundle.getText("templateSaved"), {
                                actions: [MessageBox.Action.OK],
                                onClose: function (oAction) {
                                    if (oAction === MessageBox.Action.OK) {
                                        that.onNavigation("Templates");
                                    }
                                }
                            });
                            oView.setBusy(false);
                        }
                    });
                } else {
                    // Updating an existing template
                    var oView = this.getView();
                    this.getModel("oDataV2").read("/Templates(" + oModel.ID + ")?$expand=attribute_groups($select=ID,sortID)", {
                        success: function (oData) {
                            // Proceed with the update using the prepared payload directly
                            that.getModel("oDataV2").update("/Templates(" + oModel.ID + ")?$expand=attribute_groups($select=ID,sortID)", payload, {
                                success: function (oData, oResponse) {
                                    MessageBox.success(oBundle.getText("templateUpdated"), {
                                        actions: [MessageBox.Action.OK],
                                        onClose: function (oAction) {
                                            if (oAction === MessageBox.Action.OK) {
                                                that.onNavigation("Templates");
                                            }
                                        }
                                    });
                                    oView.setBusy(false);
                                },
                                error: function (oError) {
                                    let backendMsg = '';
                                    try {
                                        backendMsg = JSON.parse(oError.responseText).error.message.value;
                                    } catch (e) {
                                        backendMsg = oError.message || "An unexpected error occurred.";
                                    }
                                    if (backendMsg && backendMsg.toLowerCase().startsWith('unique constraint violated')) {
                                        MessageBox.error('Enter Unique Template name');
                                    } else {
                                        MessageBox.error(`Error: ${backendMsg}`);
                                    }
                                    oView.setBusy(false);
                                }
                            });
                        },
                        error: function (oError) {
                            MessageBox.error(oBundle.getText("templateReadError"));
                            oView.setBusy(false);
                        }
                    });
                }
            },
            extractIdFromPath: function (sPath) {
                var match = sPath.match(/\(([^)]+)\)/);
                return match ? match[1] : null;
            },
            onDialogClose: function (oEvent) {
                let oBundle = this.getResourceBundle();
                var aContexts = oEvent.getParameter("selectedContexts");

                if (aContexts && aContexts.length) {
                    // Initialize an array to hold selected names
                    var aSelectedNames = [];

                    // Get the app model
                    var oAppModel = this.getModel("appModel");
                    // Get the current AssociatedAttributeGroups
                    var aAssociatedAttributeGroups = oAppModel.getProperty("/AttributeGroups") || [];
                    // Create a map for quick lookup by name
                    var oAssociatedAttributeGroupsMap = new Map(aAssociatedAttributeGroups.map(attrGrp => [attrGrp.name, attrGrp]));
                    // Iterate over each selected context
                    aContexts.forEach(function (oContext) {
                        var oObject = oContext.getObject();
                        if (oAssociatedAttributeGroupsMap.has(oObject.name) && oAssociatedAttributeGroupsMap.get(oObject.name).Rank > 0) {
                        } else {

                            // Update the Rank
                            oObject.Rank = this._iRankCounter++;

                            // Log the new rank counter value

                            // Push the name to the array
                            aSelectedNames.push(oObject.name);

                            // If it's a new attribute, add it to the AssociatedAttributes array
                            if (!oAssociatedAttributeGroupsMap.has(oObject.name)) {
                                aAssociatedAttributeGroups.push(oObject);
                            }
                        }
                    }.bind(this));

                    // Display the selected names
                    // MessageToast.show("You have chosen " + aSelectedNames.join(", "));
                    // Count of selected items to display on UI
                    var aSelectedCount = aSelectedNames.length
                    // Update the app model with the new ranks
                    oAppModel.setProperty("/AttributeGroups", aAssociatedAttributeGroups);
                    oAppModel.refresh();
                    // Count attributes with Rank greater than 0
                    var aAssociatedAttributeGroups = oAppModel.getProperty("/AttributeGroups");
                    var aRankedAttributeGroupsCount = aAssociatedAttributeGroups.filter(function (attribute) {
                        return attribute.Rank > 0;
                    }).length;

                    // // Update the count in the Title text dynamically
                    // var oTable = this.byId("tblAttrGrpTemplate2");
                    // var oTitle = oTable.getHeaderToolbar().getContent()[0]; // Assuming Title is the first element in OverflowToolbar
                    // oTitle.setText("Attribute Groups (" + aRankedAttributeGroupsCount + ")");
                } else {
                    MessageToast.show(oBundle.getText("templateNoNewItemSelected"));
                }

                // Clear any filters applied to the items aggregation of the dialog
                var oSource = oEvent.getSource();

                var oBinding = oSource.getBinding("items");

                if (oBinding) {
                    oBinding.filter([]);
                } else {
                    console.error("Items binding not found.");
                }
                // Re-apply TreeTable binding after model update
                //this.templateRankLogic();
            },
            onTabSelect: function (oEvent) {
                var sKey = oEvent.getParameter("key");
                this.getModel("appModel").setProperty("/selectedTemplateTab", sKey);
                if (sKey === "TemplatePreview") {
                    this._previewLayout();
                }
            },

            onNextToPreview: function () {
                var oIconTabBar = this.byId("templateIconTabBar");
                oIconTabBar.setSelectedKey("TemplatePreview");
                this.getModel("appModel").setProperty("/selectedTemplateTab", "TemplatePreview");
                this._previewLayout();
            },

            _previewLayout: function () {
                var oAppModel = this.getModel("appModel");
                var aGroups = oAppModel.getProperty("/AttributeGroups") || [];
                var oContainer = this.byId("previewAttrGroupsVBox");
                oContainer.removeAllItems();

                // Filter only ranked groups (Rank > 0) and sort by Rank
                var aRankedGroups = aGroups.filter(function (g) { return g.Rank > 0; });
                aRankedGroups.sort(function (a, b) { return a.Rank - b.Rank; });

                oContainer.addItem(new sap.m.Title({
                    text: "Attributes",
                    titleStyle: "H5"
                }).addStyleClass("sapUiSmallMarginTop sapUiSmallMarginBegin"));

                var oList = new sap.m.List({
                    showSeparators: "Inner"
                }).addStyleClass("sapUiSmallMarginBottom");

                aRankedGroups.forEach(function (group) {
                    oList.addItem(new sap.m.StandardListItem({
                        title: group.name || ""
                    }));
                });

                oContainer.addItem(oList);
            },

            onDeleteAttributeGroup: function (oEvent) {
                debugger
                // Get the button that triggered the event
                var oButton = oEvent.getSource();
                // Get the context binding path of the button's parent item
                var sPath = oButton.getBindingContext("appModel").getPath();
                // Get the app model
                var oModel = this.getModel("appModel");
                // Get the data array
                var aData = oModel.getProperty("/AttributeGroups");
                // Find the index of the item to be removed
                var iIndex = parseInt(sPath.split("/").pop(), 10);
                // Remove the item from the array
                aData.splice(iIndex, 1);
                // Reassign the ranks and sortIDs starting from 1
                aData.forEach(function (item, index) {
                    item.Rank = index + 1;
                    if (item.sortID !== undefined) {
                        item.sortID = index + 1;
                    }
                });
                // Update the model with the modified array
                oModel.setProperty("/AttributeGroups", aData);
                // Refresh the model to reflect changes
                oModel.refresh();
            }

        });
    });
