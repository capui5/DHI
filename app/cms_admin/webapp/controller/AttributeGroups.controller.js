sap.ui.define([
    "./BaseController",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/table/TablePersoController",
    'sap/ui/model/Filter',
    'sap/ui/model/FilterOperator',
    'sap/ui/model/FilterType'
],
    function (BaseController, MessageBox, MessageToast, TablePersoController, Filter, FilterOperator, FilterType) {
        "use strict";
        
        return BaseController.extend("com.dhi.cms.cmsadmin.controller.AttributeGroups", {
            onInit: function () {
                this.getRouter().getRoute("Attribute Groups").attachPatternMatched(this._onObjectMatched, this);
            },

            _onObjectMatched: async function () {
                await this._refreshTable();
                this._setPersonalization();
                this.clearAllFilters();
                this._getAttributeGrpList();

            },
            
            _getAttributeGrpList: function () {
                var oTable = this.byId("tblAttributeGroups");
                var oMainModel = this.getOwnerComponent().getModel();
                var bindingList = oMainModel.bindList("/getGroupAssociatedTemplates()", undefined, undefined, undefined);
                var appModel = this.getModel("appModel");
                oTable.setBusy(true);
                bindingList.requestContexts().then(function (aContexts) {
                    var attributes = aContexts.map((item) => ({
                        ID: item.getProperty("ID"),
                        ATTRIBUTE_GROUP_ID: item.getProperty("ATTRIBUTE_GROUP_ID"),
                        NAME: item.getProperty("NAME"),
                        DESC: item.getProperty("DESC"),
                        ALIAS: item.getProperty("ALIAS"),
                        TEMPLATE_NAME: item.getProperty("TEMPLATE_NAME")
                    }));
                    appModel.setProperty("/attributeAssociatedTemplates", attributes);
                    oTable.setModel(appModel, "appModel");
                    oTable.bindRows("appModel>/attributeAssociatedTemplates");
                }).catch(function (error) {
                    console.error("Error fetching contexts:", error);
                }).finally(function () {
                    oTable.setBusy(false);
                });
            },

            /**
             * Handler to trigger navigation for Attribute group edit page
             * @memberof com.dhi.cms.cmsadmin.controller.AttributeGroups
             * @public
             * @param {sap.ui.base.Event} event The event object
             */
            onAttributeGroupEdit: function (event) {
                let context = event.getSource().getBindingContext("appModel");
                let { ID } = context.getObject();
                this.getRouter().navTo("Create Attribute Group", {
                    attributeGroupId: ID
                });
            },

            /**
             * Handler to delete Attribute from Attribute group page
             * @memberof com.dhi.cms.cmsadmin.controller.AttributeGroups
             * @public
             * @param {sap.ui.base.Event} event The event object
             */
            onAttributeGroupDelete: function (oEvent) {
                let oBundle = this.getResourceBundle();
                var attributeGroupName = oEvent.getSource().getBindingContext("appModel").getObject().NAME;
                var attributeGroupId = oEvent.getSource().getBindingContext("appModel").getObject().ID;
                var oOwnerComponent = this.getOwnerComponent();
                var oMainModel = oOwnerComponent.getModel();
                let path = `/Attribute_Groups(${attributeGroupId})`;
                var oParameters = {
                    $expand: "templates($expand=templates),attributes($expand=attribute)"
                };
                let contextBinding = oMainModel.bindContext(path, null, oParameters);
                var that = this;
                let sConfirmationMessage = oBundle.getText("attributeGroupDeleteConfirmationMessage", [attributeGroupName]);
                MessageBox.warning(sConfirmationMessage, {
                    icon: MessageBox.Icon.WARNING,
                    actions: [MessageBox.Action.YES, MessageBox.Action.NO],
                    emphasizedAction: MessageBox.Action.YES,
                    initialFocus: MessageBox.Action.NO,
                    dependentOn: this.getView(),
                    onClose: (sAction) => {
                        if (sAction === "YES") {
                            var oTable = this.byId("tblAttributeGroups");
                            oTable.setBusyIndicatorDelay(0);
                            oTable.setBusy(true);
                            let attributeContext = contextBinding.getBoundContext();
                            attributeContext.requestObject().then((data) => {
                                console.log(data);
                                attributeContext.delete().then(function () {
                                    let sSuccessMessage = oBundle.getText("attributeGroupDeleteSuccessMessage", [attributeGroupName]);
                                    MessageToast.show(sSuccessMessage);
                                    that._getAttributeGrpList();
                                    oTable.setBusy(false);
                                }).catch(function (oError) {
                                    var sMsg = (oError && oError.message) ? oError.message : oBundle.getText("attributeGroupDeleteErrorMessage", [attributeGroupName]);
                                    MessageBox.error(sMsg);
                                    oTable.setBusy(false);
                                });
                            });
                        }
                    }
                });
            },

            /**
             * Refresh the Attribute Groups table
             * @memberof com.dhi.cms.cmsadmin.controller.AttributeGroups
             * @private
             */
            _refreshTable: function () {
                this.byId("tblAttributeGroups").getBinding("rows").refresh();
            },

            clearAllFilters: function () {
                var oTable = this.byId("tblAttributeGroups");
                var oFilter = null;

                var aColumns = oTable.getColumns();
                for (var i = 0; i < aColumns.length; i++) {
                    oTable.filter(aColumns[i], null);
                }
                this.byId("tblAttributeGroups").getBinding("rows").filter(oFilter, "Application");
            },

            // onTableFilter: function (oEvent) {
            //     var sQuery = oEvent.getParameter("value");
            //     var oTable = this.byId("tblAttributeGroups");
            //     var oBinding = oTable.getBinding("rows");

            //     if (sQuery) {
            //         // Get all columns from the table
            //         var aColumns = oTable.getColumns();
            //         var aFilters = [];

            //         // Iterate through each column to create filters
            //         aColumns.forEach(function (oColumn) {
            //             var sFilterProperty = oColumn.getFilterProperty();
            //             if (sFilterProperty) {
            //                 // Create a filter for each column
            //                 var oFilter = new Filter({
            //                     path: sFilterProperty,
            //                     operator: FilterOperator.Contains,
            //                     value1: sQuery,
            //                     caseSensitive: false
            //                 });
            //                 aFilters.push(oFilter);
            //             }
            //         });

            //         // Combine filters with OR condition
            //         var oCombinedFilter = new Filter({
            //             filters: aFilters,
            //             and: false
            //         });

            //         // Apply the combined filter to the binding
            //         oBinding.filter(oCombinedFilter,FilterType.Application);
            //         oEvent.preventDefault();

            //     } else {
            //         // Clear all filters
            //         oBinding.filter([], FilterType.Application);
            //     }
            // },

            aGlobalFilters: [],

            onAttributeGroupFilter: function (oEvent) {
                var oTable = this.byId("tblAttributeGroups");

                if (oEvent) {
                    oEvent.preventDefault();
                }
                var oColumn = oEvent.getParameter("column");
                var sFilterValue = oEvent.getParameter("value");
                var sFilterProperty = oColumn.getFilterProperty();

                // Get the default filter operator and case sensitivity from the column
                var sDefaultOperator = oColumn.getDefaultFilterOperator() || sap.ui.model.FilterOperator.Contains;
               

                this.aGlobalFilters = this.aGlobalFilters.filter(function (oFilter) {
                    return oFilter.sPath !== sFilterProperty;
                });

                if (sFilterValue) {
                    var oNewFilter = new sap.ui.model.Filter({
                        path: sFilterProperty,
                        operator: sDefaultOperator,
                        value1: sFilterValue.toLowerCase(),
                        caseSensitive: false
                    });

                    this.aGlobalFilters.push(oNewFilter);
                    oColumn.setFiltered(true);
                } else {
                    oColumn.setFiltered(false);
                }

                var oCombinedFilter = new sap.ui.model.Filter({
                    filters: this.aGlobalFilters,
                    and: true
                });

                var oBinding = oTable.getBinding("rows");
                oBinding.filter(oCombinedFilter, sap.ui.model.FilterType.Application);
            },

            _setPersonalization: function () {
                var oBundle, oDeferred, oPersoService = {
                    oPersoData: {
                        _persoSchemaVersion: "1.0",
                        aColumns: []
                    },
                    getPersData: function () {
                        oDeferred = new jQuery.Deferred();
                        if (!this._oBundle) {
                            this._oBundle = this.oPersoData;
                        }
                        oBundle = this._oBundle;
                        oDeferred.resolve(oBundle);
                        return oDeferred.promise();
                    },
                    setPersData: function (oBundle) {
                        oDeferred = new jQuery.Deferred();
                        this._oBundle = oBundle;
                        oDeferred.resolve();
                        return oDeferred.promise();
                    },
                    delPersData: function () {
                        oDeferred = new jQuery.Deferred();
                        oDeferred.resolve();
                        return oDeferred.promise();
                    }
                };
                if (this.oTablePersoController) {
                    this.oTablePersoController.destroy();
                }
                this.oTablePersoController = new TablePersoController({
                    table: this.byId("tblAttributeGroups"),
                    persoService: oPersoService
                });
            },

            /**
             * Open the dialog for personalization
             * @public
             * @param{sap.ui.base.Event} oEvent change Event
             */
            onPersonalization: function () {
                // Cause the dialog to open when the button is pressed
                this.oTablePersoController.openDialog();
            },

            onRowsUpdated: function () {
                var oTable = this.byId("tblAttributeGroups");
                this.getModel("appModel").setProperty("/AttributeGroupCount", oTable.getBinding("rows").getLength());
            }

        });
    });

