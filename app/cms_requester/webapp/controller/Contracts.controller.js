
sap.ui.define([
    "./BaseController",
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/table/TablePersoController",
    'sap/ui/model/Filter',
    'sap/ui/model/FilterOperator',
    'sap/ui/model/FilterType',
    "sap/ui/core/Fragment",
    'sap/ui/export/Spreadsheet',
    'sap/ui/export/library',
    "sap/ui/core/BusyIndicator",
    "com/dhi/cms/cmsrequester/model/formatter"
], (BaseController, Controller, MessageBox, MessageToast, TablePersoController, Filter, FilterOperator, FilterType, Fragment, Spreadsheet, exportLibrary, BusyIndicator, formatter) => {
    "use strict";
    var EdmType = exportLibrary.EdmType;
    return BaseController.extend("com.dhi.cms.cmsrequester.controller.Contracts", {
        formatter: formatter,
        onInit() {
            this.getRouter().getRoute("Contracts").attachPatternMatched(this._onObjectMatched, this);
        },
        _onObjectMatched: function (oEvent) {
            this._refreshTable();
            if (this.oTablePersoController) {
                this.oTablePersoController.destroy();
                this.oTablePersoController = null;
            }
            this._setPersonalization();
            this.clearAllFilters();
            this._applyCompanyFilter();
        },

        _applyCompanyFilter: function () {
            var that = this;
            var oRolesModel = this.getOwnerComponent().getModel("roles");
            var oTable = this.byId("tblContracts");
            var oBinding = oTable.getBinding("rows");

            var fnApply = function () {
                var sCompanyCode = oRolesModel.getProperty("/companyCode");
                var oBinding2 = that.byId("tblContracts").getBinding("rows");
                if (!oBinding2) return;

                if (sCompanyCode) {
                    var oCompanyFilter = new Filter("company_CompanyCode", FilterOperator.EQ, sCompanyCode);
                    that._companyFilter = oCompanyFilter;
                    oBinding2.filter([oCompanyFilter]);
                } else {
                    // No company found for this user — show nothing
                    that._companyFilter = null;
                    oBinding2.filter([new Filter("company_CompanyCode", FilterOperator.EQ, "__NO_ACCESS__")]);
                }
            };

            if (oRolesModel.getProperty("/companyLoaded")) {
                fnApply();
            } else {
                // Immediately block all data while company is loading
                if (oBinding) {
                    oBinding.filter([new Filter("company_CompanyCode", FilterOperator.EQ, "__LOADING__")]);
                }
                oRolesModel.attachEventOnce("change", fnApply);
            }
        },

        onGoBtnPress: function (oEvent) {
            var that = this;
            var oFilterbar = this.byId("idFilterBar");
            var aFilterItems = oFilterbar.getAllFilterItems();
            var aAndFilters = [];

            aFilterItems.forEach(function (oFilterItem) {
                var sPropertyName = oFilterItem.getName();

                if (sPropertyName === "ID") {
                    var sValue = oFilterItem.getControl().getValue();
                    if (sValue) {
                        aAndFilters.push(new Filter(sPropertyName, "Contains", sValue));
                    }
                } else if (sPropertyName === "start_date" || sPropertyName === "end_date") {
                    var sDateValue = oFilterItem.getControl().getValue();
                    if (!sDateValue) return;
                    var aDateParts = sDateValue.split(" - ");
                    if (aDateParts.length !== 2) return;
                    var oStartDate = new Date(aDateParts[0]);
                    var oEndDate = new Date(aDateParts[1]);
                    aAndFilters.push(new Filter(sPropertyName, "BT", that.toEdmDateLocal(oStartDate), that.toEdmDateLocal(oEndDate)));
                } else {
                    // MultiComboBox: OR selected keys within the same property
                    var aSelectedKeys = oFilterItem.getControl().getSelectedKeys();
                    if (aSelectedKeys && aSelectedKeys.length > 0) {
                        var aOrFilters = aSelectedKeys.map(function (sKey) {
                            return new Filter(sPropertyName, "EQ", sKey);
                        });
                        aAndFilters.push(aOrFilters.length === 1
                            ? aOrFilters[0]
                            : new Filter({ filters: aOrFilters, and: false }));
                    }
                }
            });

            // Always AND the company filter — enforce even when _companyFilter is not set
            var oRolesModel = this.getOwnerComponent().getModel("roles");
            var sCompanyCode = oRolesModel.getProperty("/companyCode");
            var oActiveCompanyFilter = this._companyFilter;
            if (!oActiveCompanyFilter && sCompanyCode) {
                oActiveCompanyFilter = new Filter("company_CompanyCode", FilterOperator.EQ, sCompanyCode);
                this._companyFilter = oActiveCompanyFilter;
            }
            if (oActiveCompanyFilter) {
                aAndFilters.push(oActiveCompanyFilter);
            } else {
                aAndFilters.push(new Filter("company_CompanyCode", FilterOperator.EQ, "__NO_ACCESS__"));
            }

            var oBinding = this.byId("tblContracts").getBinding("rows");
            oBinding.filter(aAndFilters.length > 0
                ? new Filter({ filters: aAndFilters, and: true })
                : []);
            MessageToast.show("Filters Applied Successfully.");
        },
        toEdmDateLocal(oDate) {
            const year = oDate.getFullYear();
            const month = String(oDate.getMonth() + 1).padStart(2, "0");
            const day = String(oDate.getDate()).padStart(2, "0");
            return `${year}-${month}-${day}`;
        },

        formatDate: function (date) {
            var month = '' + (date.getMonth() + 1);
            var day = '' + date.getDate();
            var year = date.getFullYear();

            if (month.length < 2) month = '0' + month;
            if (day.length < 2) day = '0' + day;

            return [year, month, day].join('-');
        },
        onExportData: function (event) {
            let table = this.byId("tblContracts");
            let binding = table.getBinding('rows');
            let columns = this.createColumnConfig();
            let settings = {
                workbook: {
                    columns: columns,
                    hierarchyLevel: 'Level'
                },
                dataSource: binding,
                fileName: 'Contracts.xlsx',
                worker: false
            };

            let sheet = new Spreadsheet(settings);
            sheet.build().finally(function () {
                sheet.destroy();
            });
        },
        createColumnConfig: function () {
            var columns = [];

            columns.push({
                label: 'ID',
                property: 'ID',
                type: EdmType.String,
                width: 40
            });

            columns.push({
                label: 'Document Name',
                property: 'alias',
                type: EdmType.String,
                width: 30
            });

            columns.push({
                label: 'Description',
                property: 'description',
                type: EdmType.String,
                width: 30
            });

            // navigation property for template name
            columns.push({
                label: 'Contract Type',
                property: 'templates/name',
                type: EdmType.String,
                width: 35
            });

            columns.push({
                label: 'Company',
                property: 'company/CompanyName',
                type: EdmType.String,
                width: 30
            });

            columns.push({
                label: 'Start Date',
                property: 'start_date',
                type: EdmType.String,
                width: 25
            });

            columns.push({
                label: 'End Date',
                property: 'end_date',
                type: EdmType.String,
                width: 25
            });
            columns.push({
                label: 'Status',
                property: 'status',
                type: EdmType.String,
                width: 25
            });

            return columns;
        },
        _refreshTable: function () {
            var oBinding = this.byId("tblContracts").getBinding("rows");
            if (oBinding) {
                oBinding.refresh();
            }
        },


        onClearFilters: function () {
            this.clearAllFilters();
        },

        clearAllFilters: function () {
            var oTable = this.byId("tblContracts");
            // Clear column-level filters
            oTable.getColumns().forEach(function (oCol) { oTable.filter(oCol, null); });
            // Re-apply only the company filter (always enforce it)
            var oRolesModel = this.getOwnerComponent().getModel("roles");
            var sCompanyCode = oRolesModel.getProperty("/companyCode");
            var aFilters;
            if (this._companyFilter) {
                aFilters = [this._companyFilter];
            } else if (sCompanyCode) {
                this._companyFilter = new Filter("company_CompanyCode", FilterOperator.EQ, sCompanyCode);
                aFilters = [this._companyFilter];
            } else {
                aFilters = [new Filter("company_CompanyCode", FilterOperator.EQ, "__NO_ACCESS__")];
            }
            oTable.getBinding("rows").filter(aFilters);

            var oFilterBar = this.byId("idFilterBar");
            if (!oFilterBar) return;
            oFilterBar.getFilterGroupItems().forEach(function (oItem) {
                var oControl = oItem.getControl();
                if (!oControl) return;
                if (oControl.setSelectedKeys) oControl.setSelectedKeys([]);
                if (oControl.setValue) oControl.setValue("");
                if (oControl.setDateValue) oControl.setDateValue(null);
            });
        },
        aGlobalFilters: [],
        onAttributeFilter: function (oEvent) {
            var oTable = this.byId("tblContracts");

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
        onTableFilter: function (oEvent) {
            var sQuery = oEvent.getParameter("value");
            var oTable = this.byId("tblContracts");
            var oBinding = oTable.getBinding("rows");

            if (sQuery) {
                this.byId("clearFilters").setEnabled(true);

                // Get all columns from the table
                var aColumns = oTable.getColumns();
                var aFilters = [];

                // Iterate through each column to create filters
                aColumns.forEach(function (oColumn) {
                    var sFilterProperty = oColumn.getFilterProperty();
                    if (sFilterProperty) {
                        // Create a filter for each column
                        var oFilter = new Filter({
                            path: sFilterProperty,
                            operator: sap.ui.model.FilterOperator.Contains,
                            value1: sQuery,
                            caseSensitive: false
                        });
                        aFilters.push(oFilter);
                    }
                });

                // Combine filters with OR condition
                var oCombinedFilter = new sap.ui.model.Filter({
                    filters: aFilters,
                    and: false
                });

                // Apply the combined filter to the binding
                oBinding.filter(oCombinedFilter, sap.ui.model.FilterType.Application);
                oEvent.preventDefault();

            } else {
                this.byId("clearFilters").setEnabled(false);

                // Clear all filters
                oBinding.filter([], sap.ui.model.FilterType.Application);
            }
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
            this.oTablePersoController = new TablePersoController({
                table: this.byId("tblContracts"),
                persoService: oPersoService
            });
        },

        onPersonalization: function () {
            // Cause the dialog to open when the button is pressed
            this.oTablePersoController.openDialog();
        },

        onRowsUpdated: function () {
            var oTable = this.byId("tblContracts");
            var nCount = oTable.getBinding("rows").getLength();
            this.getModel("appModel").setProperty("/ContractCount", nCount);
            oTable.setVisibleRowCount(Math.max(1, nCount));
        },
        onCreateContract: function (sNavigationTarget) {
            var sNavigationTarget;
            if (sNavigationTarget) {
                this.getRouter().navTo(sNavigationTarget);
            } else {
                console.error("Navigation target not defined.");
            }

        },
        onDeleteContract: function (oEvent) {
            const oView = this.getView();
            const oButton = oEvent.getSource();
            const oContext = oButton.getBindingContext();
            if (!oContext) {
                sap.m.MessageToast.show("No contract selected for delete.");
                return;
            }
            const sAlias = oContext.getProperty("alias") || oContext.getProperty("contract_id") || "this contract";
            const sConfirmText = `Are you sure you want to delete ${sAlias}?`;
            MessageBox.confirm(sConfirmText, {
                title: "Confirm delete",
                onClose: (sAction) => {
                    if (sAction !== sap.m.MessageBox.Action.OK) {
                        return;
                    }
                    oView.setBusy(true);
                    oContext.delete().then(() => {
                        oView.setBusy(false);
                        MessageToast.show("Contract deleted");
                        const oModel = oView.getModel();
                        try { oModel.refresh(true); } catch (e) { }
                    }).catch((oError) => {
                        oView.setBusy(false);
                        const sMsg = (oError && oError.message) ? oError.message : "Delete failed";
                        MessageBox.error("Failed to delete contract: " + sMsg);
                        try { oView.getModel().refresh(true); } catch (e) { }
                    });
                }
            });
        },
        onEditContract: function (event) {
            let context = event.getSource().getBindingContext();
            let { ID } = context.getObject();
            this.getRouter().navTo("ContractDetails", {
                contractId: ID,
                "?query": { mode: "edit" }
            });
        },
        onViewContract: function (event) {
            let context = event.getSource().getBindingContext();
            let { ID } = context.getObject();
            this.getRouter().navTo("ContractDetails", {
                contractId: ID,
                "?query": { mode: "view" }
            });
        },

    });
});