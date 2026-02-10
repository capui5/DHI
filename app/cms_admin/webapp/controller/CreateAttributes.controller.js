sap.ui.define([
    "./BaseController",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    'sap/m/Token',
    "../model/formatter"
],

    function (BaseController, MessageToast, MessageBox, Token, formatter) {
        "use strict";

        return BaseController.extend("com.dhi.cms.cmsadmin.controller.CreateAttributes", {
            formatter: formatter,
            onCancel: function () {
                // Reset main input value states
                ["attributeNameInput", "AttributeTypeSelect", "aliasNameAttrInput", "descriptionInput", "associationsSelect", "attributeTypeInput", "descriptionTextArea", "attributeMaxLength", "attributeMinLength"].forEach(function (id) {
                    var oCtrl = this.byId(id);
                    if (oCtrl && oCtrl.setValueState) {
                        oCtrl.setValueState("None");
                        oCtrl.setValueStateText("");
                    }
                }.bind(this));

                // Reset value states for all table inputs
                var oTable = this.byId("valuesGridTable");
                if (oTable && oTable.getRows) {
                    var aTableRows = oTable.getRows();
                    aTableRows.forEach(function (oRow) {
                        var oInput = oRow && oRow.getAggregation && oRow.getAggregation("cells")[0];
                        if (oInput && oInput.setValueState) {
                            oInput.setValueState("None");
                            oInput.setValueStateText("");
                        }
                    });
                }
                // Now navigate after reset
                this.onNavigation("Attributes");
            },

            onInit: function () {
                this.getRouter().getRoute("Create Attributes").attachPatternMatched(this._onObjectMatched, this);
            },
            onDeleteRow: function (oEvent) {
                debugger
                const oModel = this.getView().getModel("appModel");

                // Get row index in the table
                const oContext = oEvent.getSource().getBindingContext("appModel");
                const iIndex = oContext.getPath().split("/").pop();

                const aRows = oModel.getProperty("/Attributes/combovalues/results");

                aRows.splice(iIndex, 1);

                oModel.setProperty("/Attributes/combovalues/results", aRows);

                // Reset value states for all table inputs
                var oTable = this.byId("valuesGridTable");
                if (oTable && oTable.getRows) {
                    var aTableRows = oTable.getRows();
                    aTableRows.forEach(function (oRow) {
                        var oInput = oRow && oRow.getAggregation && oRow.getAggregation("cells")[0];
                        if (oInput && oInput.setValueState) {
                            oInput.setValueState("None");
                            oInput.setValueStateText("");
                        }
                    });
                }
            },
            onAddRow: function () {
                const oModel = this.getView().getModel("appModel");
                let aRows = oModel.getProperty("/Attributes/combovalues/results");
                if (!aRows) {
                    let pay = {
                        "results": []
                    }
                    oModel.setProperty("/Attributes/combovalues", pay);
                    aRows = pay.results;
                }
                // Create array if not defined
                if (!Array.isArray(aRows)) {
                    aRows = [];
                }
                // Prevent adding more than 100 rows
                if (aRows.length >= 100) {
                    MessageBox.error("You cannot add more than 100 Combo Values.");
                    return;
                }
                aRows.push({ value: "" });
                oModel.setProperty("/Attributes/combovalues/results", aRows);
            },
            _onObjectMatched: function (oEvent) {
                var sRouteName = oEvent.getParameter("name");
                this.attributeId = oEvent.getParameter("arguments").attributeId;
                var isEditMode = !!this.attributeId;
                this.getModel("appModel").setProperty("/isEditMode", isEditMode);
                // this._updateBreadcrumbs(sRouteName);
                var sTitle = isEditMode
                    ? this.getResourceBundle().getText("Update_Attribute_Title")
                    : this.getResourceBundle().getText("Create_Attribute_Title");
                this.getView().byId("createAttributeTitle").setText(sTitle);
                if (!this.attributeId) {
                    this.getModel("appModel").setProperty("/Attributes", {});
                    this.getModel("appModel").setProperty("/Attributes/type", "string");
                } else {
                    this._fnReadAttributes(this.attributeId);
                }
                // this._fnReadAssociation();
                this._fnRegisterMessageManager();
                // this.getModel("appModel").setProperty("/showVersionHistory", "0%");
            },

            _fnReadAttributes: function (attributeId) {
                debugger
                var that = this;
                this.getModel("oDataV2").read("/Attributes(" + attributeId + ")", {
                    urlParameters: {
                        "$expand": "combovalues"
                    },
                    success: function (oData, oResponce) {
                        debugger
                        // var aSystems = oData.integration.results.map(function (item) {
                        //     return item.system;
                        // });
                        that.getModel("appModel").setProperty("/Attributes", oData);
                        // that.getModel("appModel").setProperty("/Client", aSystems);
                        // that.setTags(oData.tags);
                        // if (oData.integration.results.length !== 0) {
                        //     that.getModel("appModel").setProperty("/isIntegrationVisible", true);
                        // } else {
                        //     that.getModel("appModel").setProperty("/isIntegrationVisible", false);
                        // }
                    },
                    error: function (oError) {
                        MessageBox.error(`${oError.message}: ${oError.statusCode} ${JSON.parse(oError.responseText).error.message.value}`);
                    }
                });
            },

            onSave: async function () {
                // Centralized validation using appModel data
                const oAppModel = this.getView().getModel("appModel");
                const attrData = oAppModel.getProperty("/Attributes");
                let bValid = true;
                // Input controls
                const oNameInput = this.byId("attributeNameInput");
                const oTypeSelect = this.byId("AttributeTypeSelect");
                const oAliasInput = this.byId("aliasNameAttrInput");
                const oDescInput = this.byId("descriptionInput");
                const oAssocSelect = this.byId("associationsSelect");
                const oValueInput = this.byId("attributeTypeInput");

                // Helper for required, min, and max length/values
                const validateField = (value, control, requiredMsg, maxLen, maxLenMsg, minLen, minLenMsg) => {
                    if (!value || value.toString().trim() === "") {
                        control.setValueState("Error");
                        control.setValueStateText(requiredMsg);
                        return false;
                    }
                    if (minLen && value.length < minLen) {
                        control.setValueState("Error");
                        control.setValueStateText(minLenMsg);
                        return false;
                    }
                    if (maxLen && value.length > maxLen) {
                        control.setValueState("Error");
                        control.setValueStateText(maxLenMsg);
                        return false;
                    }
                    control.setValueState("None");
                    return true;
                };

                // Attribute Name: required, min/max from XML
                const nameMaxLen = oNameInput.getMaxLength ? oNameInput.getMaxLength() : 50;
                const nameMinLen = oNameInput.getMinLength ? oNameInput.getMinLength() : 0;
                bValid &= validateField(
                    attrData.name,
                    oNameInput,
                    "Attribute Name is required.",
                    nameMaxLen,
                    `Attribute Name must be less than ${nameMaxLen} characters.`,
                    nameMinLen,
                    nameMinLen > 0 ? `Attribute Name must be at least ${nameMinLen} characters.` : undefined
                );
                // Attribute Type: required
                bValid &= validateField(attrData.type, oTypeSelect, "Attribute Type is required.");
                // Alias Name: required, min/max from XML
                const aliasMaxLen = oAliasInput.getMaxLength ? oAliasInput.getMaxLength() : 50;
                const aliasMinLen = oAliasInput.getMinLength ? oAliasInput.getMinLength() : 0;
                bValid &= validateField(
                    attrData.alias,
                    oAliasInput,
                    "Alias Name is required.",
                    aliasMaxLen,
                    `Alias Name must be less than ${aliasMaxLen} characters.`,
                    aliasMinLen,
                    aliasMinLen > 0 ? `Alias Name must be at least ${aliasMinLen} characters.` : undefined
                );
                // Description: min/max from XML, only check length if value is present
                const descTextArea = this.byId("descriptionTextArea");
                const descMaxLen = descTextArea && descTextArea.getMaxLength ? descTextArea.getMaxLength() : 100;
                const descMinLen = descTextArea && descTextArea.getMinLength ? descTextArea.getMinLength() : 0;
                if (descTextArea && attrData.desc) {
                    bValid &= validateField(
                        attrData.desc,
                        descTextArea,
                        "",
                        descMaxLen,
                        `Description must be less than ${descMaxLen} characters.`,
                        descMinLen,
                        descMinLen > 0 ? `Description must be at least ${descMinLen} characters.` : undefined
                    );
                } else if (descTextArea) {
                    descTextArea.setValueState("None");
                    descTextArea.setValueStateText("");
                }

                // Min/max logic for min/max fields (should be non-negative and min <= max)
                const minInput = this.byId("attributeMinLength");
                const maxInput = this.byId("attributeMaxLength");
                let minVal = attrData.minlength !== undefined && attrData.minlength !== null && attrData.minlength !== "" ? parseFloat(attrData.minlength) : undefined;
                let maxVal = attrData.maxlength !== undefined && attrData.maxlength !== null && attrData.maxlength !== "" ? parseFloat(attrData.maxlength) : undefined;
                let minError = false, maxError = false;
                if (minVal !== undefined && minVal < 0) {
                    bValid = false;
                    minError = true;
                    if (minInput) {
                        minInput.setValueState("Error");
                        minInput.setValueStateText("Minimum value cannot be negative.");
                    }
                } else if (minInput) {
                    minInput.setValueState("None");
                    minInput.setValueStateText("");
                }
                if (maxVal !== undefined && maxVal < 0) {
                    bValid = false;
                    maxError = true;
                    if (maxInput) {
                        maxInput.setValueState("Error");
                        maxInput.setValueStateText("Maximum value cannot be negative.");
                    }
                } else if (maxInput) {
                    maxInput.setValueState("None");
                    maxInput.setValueStateText("");
                }
                if (!minError && !maxError && minVal !== undefined && maxVal !== undefined && minVal > maxVal) {
                    bValid = false;
                    if (minInput) {
                        minInput.setValueState("Error");
                        minInput.setValueStateText("Minimum value cannot be greater than maximum value.");
                    }
                    if (maxInput) {
                        maxInput.setValueState("Error");
                        maxInput.setValueStateText("Maximum value cannot be less than minimum value.");
                    }
                }
                // If type is number, value must be >= min and <= max
                if ((attrData.type === "number") && oValueInput && attrData.value) {
                    const min = attrData.minlength !== undefined && attrData.minlength !== null && attrData.minlength !== "" ? parseFloat(attrData.minlength) : undefined;
                    const max = attrData.maxlength !== undefined && attrData.maxlength !== null && attrData.maxlength !== "" ? parseFloat(attrData.maxlength) : undefined;
                    const val = parseFloat(attrData.value);
                    if (max !== undefined && val > max) {
                        bValid = false;
                        oValueInput.setValueState("Error");
                        oValueInput.setValueStateText("Value must be less than or equal to Max Length.");
                    } else if (min !== undefined && val < min) {
                        bValid = false;
                        oValueInput.setValueState("Error");
                        oValueInput.setValueStateText("Value must be greater than or equal to Min Length.");
                    } else {
                        oValueInput.setValueState("None");
                        oValueInput.setValueStateText("");
                    }
                }
                // Min/max length validation for string type
                if ((attrData.type === "string") && oValueInput && attrData.value) {
                    const min = attrData.minlength !== undefined && attrData.minlength !== null && attrData.minlength !== "" ? parseInt(attrData.minlength) : undefined;
                    const max = attrData.maxlength !== undefined && attrData.maxlength !== null && attrData.maxlength !== "" ? parseInt(attrData.maxlength) : undefined;
                    if (max !== undefined && attrData.value.length > max) {
                        bValid = false;
                        oValueInput.setValueState("Error");
                        oValueInput.setValueStateText("String length must be less than or equal to Max Length.");
                    } else if (min !== undefined && attrData.value.length < min) {
                        bValid = false;
                        oValueInput.setValueState("Error");
                        oValueInput.setValueStateText("String length must be greater than or equal to Min Length.");
                    } else {
                        oValueInput.setValueState("None");
                        oValueInput.setValueStateText("");
                    }
                }

                // Combo values table validation (if exists)
                const comboValues = (attrData.combovalues && attrData.combovalues.results) || [];
                if (Array.isArray(comboValues)) {
                    // Prevent saving if more than 100 rows
                    if (comboValues.length > 100) {
                        MessageBox.error("You cannot have more than 100 Combo Values.");
                        return;
                    }
                    var oTable = this.byId("valuesGridTable");
                    if (oTable && oTable.getRows) {
                        var aRows = oTable.getRows();
                        comboValues.forEach((row, idx) => {
                            var oRow = aRows[idx];
                            var oInput = oRow && oRow.getAggregation && oRow.getAggregation("cells")[0];
                            if (!row.value || row.value.toString().trim() === "") {
                                bValid = false;
                                if (oInput && oInput.setValueState) {
                                    oInput.setValueState("Error");
                                    oInput.setValueStateText("Value is required.");
                                }
                            } else {
                                if (oInput && oInput.setValueState) {
                                    oInput.setValueState("None");
                                    oInput.setValueStateText("");
                                }
                            }
                        });
                        // If type is 'select', table must have at least one record
                        if (attrData.type === "select" && comboValues.length === 0) {
                            bValid = false;
                            MessageBox.error("At least one Select value is required for type 'select'.");
                        }
                    }
                }

                if (!bValid) return;

                // Save + Navigate
                var oView = this.getView();
                oView.setBusyIndicatorDelay(0);
                oView.setBusy(true);
                try {
                    await this.handleSaveAttribute();
                } catch (err) {
                    oView.setBusy(false);
                    console.error("Save failed:", err);
                }
            },


            //Validation check
            // onSave:async function () {
            //     var bValid = true;
            //     var attributeName = this.byId("attributeNameInput").getValue();
            //     var attributeType = this.byId("AttributeTypeSelect").getSelectedKey();
            //     var aliasName = this.byId("aliasNameAttrInput").getValue();
            //     var association = this.byId("associationsSelect").getValue();
            //     var associationReq = this.getView().getModel("appModel").getProperty("/Attributes/type");

            //     if (attributeName === "") {
            //         this.byId("attributeNameInput").setValueState("Error");
            //         this.byId("attributeNameInput").setValueStateText("This field is required.");
            //         bValid = false;
            //     } else {
            //         this.byId("attributeNameInput").setValueState("None");
            //     }
            //     if (attributeType === "") {
            //         this.byId("AttributeTypeSelect").setValueState("Error");
            //         this.byId("AttributeTypeSelect").setValueStateText("This field is required.");
            //         bValid = false;
            //     } else {
            //         this.byId("AttributeTypeSelect").setValueState("None");
            //     }
            //     if (aliasName === "") {
            //         this.byId("aliasNameAttrInput").setValueState("Error");
            //         this.byId("aliasNameAttrInput").setValueStateText("This field is required.");
            //         bValid = false;
            //     } else {
            //         this.byId("aliasNameAttrInput").setValueState("None");
            //     }
            //     if (associationReq === "Association" && association === "") {
            //         this.byId("associationsSelect").setValueState("Error");
            //         this.byId("associationsSelect").setValueStateText("This field is required.");
            //         bValid = false;
            //     } else {
            //         this.byId("associationsSelect").setValueState("None");
            //     }
            //     if (bValid === true) {

            //         await this.byId("attributeNameInput").setValueState("None");
            //         await this.byId("AttributeTypeSelect").setValueState("None");
            //         await this.byId("aliasNameAttrInput").setValueState("None");
            //         await this.byId("associationsSelect").setValueState("None");
            //         this.handleSaveAttribute().then(()=>{
            //             debugger
            //             this.onNavigation('Attributes')
            //         });

            //         // this.resetValueStates("Save");
            //     }
            // },

            attributeTypeChange: function (oEvent) {
                debugger
                var selectedKey = oEvent.getParameter("selectedItem").getKey();
                var oComboBox = this.byId("associationsSelect");
                var oComboInput = this.byId("attributeTypeInput");
                oComboBox.setValue("");
                if (selectedKey == "number" || selectedKey == "integer")
                    oComboInput.setType("Number");
                else
                    oComboInput.setType("Text");
                if (selectedKey == 'boolean' || selectedKey == 'select' || selectedKey == 'date') {
                    this.getModel("appModel").setProperty("/Attributes/maxlength", null);
                    this.getModel("appModel").setProperty("/Attributes/minlength", null);
                }

            },

            resetValueStates: function (oEvent) {
                if (oEvent.getSource().getText("text") !== "Save") {
                    this.onNavigation("Attributes");
                }
                this.byId("attributeNameInput").setValueState("None");
                this.byId("AttributeTypeSelect").setValueState("None");
                this.byId("aliasNameAttrInput").setValueState("None");
            },

            handleSaveAttribute: function (oEvent) {
                var that = this;
                var oView = this.getView();
                var oBundle = this.getResourceBundle();
                var oODataModel = this.getModel();
                var oModel = this.getModel("appModel").getData().Attributes;
                // if (oModel.type === "date" || oModel.value instanceof Date) {
                //     oModel.value = this.formatter.formatDateToString(oModel.value);
                // }

                var payload = {
                    "ID": oModel.ID,
                    // "attribute_id": oModel.attribute_id,
                    "name": oModel.name,
                    "desc": oModel.desc,
                    "alias": oModel.alias,
                    "type": oModel.type,
                    // For 'select' type, use the selectedKey from 'associationsSelect' (which is the ID), otherwise use the value
                    "value": oModel.type === 'select' ? this.byId("associationsSelect").getSelectedKey() : oModel.value,
                    // "regex": oModel.regex,
                    "status": oModel.status,
                    "is_mandatory": this.byId("isMandatorySwitch").getState(),
                    "minlength": oModel.minlength,
                    "maxlength": oModel.maxlength,
                    "combovalues": oModel.type === 'select' ? (oModel.combovalues && oModel.combovalues.results ? oModel.combovalues.results : []) : []
                };

                debugger

                //Creating a new attribute 
                if (oModel.ID === undefined) {
                    var oListBinding = oODataModel.bindList("/Attributes", undefined, undefined, undefined, undefined);
                    oODataModel.resetChanges("$auto",true);
                    this.oContext = oListBinding.create(payload, {
                        bSkipRefresh: true
                    });
                    this._refreshMessageManager();
                    this.getModel().submitBatch("$auto").then(function (response) {
                        var aMessages = that.getModel("message").getData();
                        var oErrorMessage = aMessages.slice().reverse().find((message) => message.type === 'Error');
                        if (oErrorMessage) {
                            debugger
                            let backendMsg = '';
                            try {
                                backendMsg = oErrorMessage.message;
                            } catch (e) {
                                backendMsg = "An unexpected error occurred.";
                            }
                            if (backendMsg && backendMsg.toLowerCase().startsWith('unique constraint violated')) {
                                MessageBox.error('Enter Unique Attribute name');
                            } else {
                                MessageBox.error(`Error: ${backendMsg}`);
                            }
                            that._refreshMessageManager();
                            oView.setBusy(false);
                            return;
                        } else {
                            debugger
                            var oBindingContext = that.getModel().bindContext(`/Attributes`, undefined, undefined, undefined, undefined);
                            oBindingContext.requestObject().then((aContexts) => {
                                console.log(aContexts);
                                var oModel = that.getModel("appModel").getData().Attributes;
                                var oContext = aContexts.value.filter((data) => { return data.name == oModel.name });
                                console.log(oContext);
                                MessageBox.success(oBundle.getText("attributeSaveSuccess"), {
                                    actions: [MessageBox.Action.OK],
                                    onClose: function (oAction) {
                                        if (oAction === MessageBox.Action.OK) {
                                            that.onNavigation("Attributes");
                                        }
                                    }
                                });
                                that._fnReadAttributes(oContext[0].ID);
                                that._refreshMessageManager();
                                oView.setBusy(false);
                            })
                        }
                    });
                    // this.oContext.created().then(function () {
                    //     MessageToast.show("Attributes have been saved.");
                    //     that._fnReadAttributes(that.oContext.getObject().ID);
                    // }, function (oError) {
                    //     MessageBox.error("Due to an error, attributes have not been saved.");
                    // });
                } 
                else {
                    //Updating the attribute.
                    this._refreshMessageManager();
                    this.getModel("oDataV2").update("/Attributes(guid'" + oModel.ID + "')", payload, {
                        success: function (oData, oResponce) {
                            MessageBox.success(oBundle.getText("attributeUpdateSuccess"), {
                                actions: [MessageBox.Action.OK],
                                onClose: function (oAction) {
                                    if (oAction === MessageBox.Action.OK) {
                                        that.onNavigation("Attributes");
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
                                backendMsg = oError.message;
                            }
                            if (backendMsg && backendMsg.toLowerCase().startsWith('unique constraint violated')) {
                                MessageBox.error('Enter Unique Attribute name');
                            } else {
                                MessageBox.error(`${oError.message}: ${oError.statusCode} ${backendMsg}`);
                            }
                            oView.setBusy(false);
                        }
                    });
                }
            },

            // setTags: function (tags) {
            //     var multiInputTags = this.byId("multiInputTags");

            //     if (tags !== undefined && tags !== null && tags !== "") {
            //         multiInputTags.setTokens([
            //             new Token({ text: tags, key: tags })
            //         ]);
            //     }
            // },

            // onTagsChange: function (oEvent) {
            //     var value = oEvent.getParameter("value");
            //     var multiInputTags = this.byId("multiInputTags");
            //     multiInputTags.setTokens([
            //         new Token({ text: value, key: value })
            //     ]);
            // },

            // onIntegrationChange: function (oEvent) {
            //     var bValue = oEvent.getParameter("state");

            //     if (bValue === true) {
            //         this.getModel("appModel").setProperty("/isIntegrationVisible", true);
            //     } else {
            //         this.getModel("appModel").setProperty("/isIntegrationVisible", false);
            //     }
            // },

            // _fnReadAssociation: function () {
            //     var that = this;
            //     var oModel = this.getModel();

            //     oModel.bindList("/Configuration", undefined, undefined, undefined, {
            //         $select: "targetTable,code,name"
            //     }).requestContexts().then(function (aContexts) {
            //         var aResults = aContexts.map(function (oContext) {
            //             return oContext.getObject();
            //         });
            //         that.getModel("appModel").setProperty("/Association", aResults);
            //     }).catch(function (oError) {
            //         MessageBox.error(`${oError.message}: ${oError.statusCode} ${oError.statusText}`);
            //     });
            // },

            // onVersionHistory: function (oEvent) {
            //     var that = this;
            //     var oTable = this.byId("tblVersionHistory");
            //     var paneSize = oEvent.getSource().data("footer");
            //     paneSize = paneSize === "ShowPane" ? "30%" : "0%";
            //     this.getModel("appModel").setProperty("/showVersionHistory", paneSize);
            //     oTable.getRowMode().setRowCount(5);
            //     oTable.getRowMode().setMinRowCount(5);

            //     var oModel = this.getModel();
            //     oModel.bindContext(`/getVersionHistory(ENTITY='Attributes',ID=${this.attributeId})`).requestObject().then(function (oData) {
            //         that.getModel("appModel").setProperty("/AttributesHistory", oData.value);
            //     }).catch(function (oError) {
            //         MessageBox.error(`${oError.message}: ${oError.statusCode} ${oError.statusText}`);
            //     });
            //     oTable.bindRows({
            //         path: "appModel>/AttributesHistory",
            //         sorter: [new sap.ui.model.Sorter("ON", true)]
            //     });
            // }


        });
    });
