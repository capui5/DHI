
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
    "sap/ui/core/BusyIndicator"
], (BaseController, Controller, MessageBox, MessageToast, TablePersoController, Filter, FilterOperator, FilterType, Fragment, Spreadsheet, exportLibrary, BusyIndicator) => {
    "use strict";
    var EdmType = exportLibrary.EdmType;
    return BaseController.extend("com.dhi.cms.cmsrequester.controller.Contracts", {
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

            // Wait for company data to be loaded
            var fnApply = function () {
                var sCompanyCode = oRolesModel.getProperty("/companyCode");
                var sCompanyName = oRolesModel.getProperty("/companyName");
                if (!sCompanyCode) {
                    return;
                }

                // Filter Contracts table: only show contracts belonging to the user's company
                var oTable = that.byId("tblContracts");
                var oBinding = oTable.getBinding("rows");
                if (oBinding) {
                    var oCompanyFilter = new Filter("company_CompanyCode", FilterOperator.EQ, sCompanyCode);
                    that._companyFilter = oCompanyFilter;
                    oBinding.filter(oCompanyFilter);
                }

                // Filter Templates MultiComboBox in filter bar by company name
                var oTemplateCombo = that.byId("contractTypeFilter");
                if (oTemplateCombo) {
                    var oTemplateBinding = oTemplateCombo.getBinding("items");
                    if (oTemplateBinding) {
                        oTemplateBinding.filter(new Filter("AdminName", FilterOperator.EQ, sCompanyName));
                    }
                }
            };

            if (oRolesModel.getProperty("/companyLoaded")) {
                fnApply();
            } else {
                // Wait for company data to load
                var fnHandler = function () {
                    if (oRolesModel.getProperty("/companyLoaded")) {
                        oRolesModel.detachPropertyChange(fnHandler);
                        fnApply();
                    }
                };
                oRolesModel.attachPropertyChange(fnHandler);
            }
        },
        onGoBtnPress: function (oEvent) {
            let oFilterbar = this.byId("idFilterBar")
            let aFilterItems = oFilterbar.getAllFilterItems();
            let aFilters = []

            aFilterItems.forEach((aFilterItem) => {
                let sPropertyName = aFilterItem.getName();
                let aSelectedKeys;
                if (sPropertyName === "ID") {
                    let sValue = aFilterItem.getControl().getValue();
                    if (sValue) {
                        aFilters.push(new Filter(sPropertyName, "Contains", sValue));
                    }

                }
                else if (sPropertyName === "start_date" || sPropertyName === "end_date") {
                    // let sValue = aFilterItem.getControl().getValue();
                    //  var aDateParts = sValue.split(' - ');
                    //         var sStartDateString = aDateParts[0];
                    //         var sEndDateString = aDateParts[1];
                    //         var oStartDate = new Date(sStartDateString);
                    //         var oEndDate = new Date(sEndDateString);
                    //         var sFormattedStartDate = this.formatDate(oStartDate);
                    //         var sFormattedEndDate = this.formatDate(oEndDate);
                    let sValue = aFilterItem.getControl().getValue();
                    if (!sValue) {
                        return;
                    }

                    const aDateParts = sValue.split(" - ");
                    if (aDateParts.length !== 2) {
                        return;
                    }

                    const oStartDate = new Date(aDateParts[0]);
                    const oEndDate = new Date(aDateParts[1]);
                    var oDateFilter = new sap.ui.model.Filter(sPropertyName, "BT", this.toEdmDateLocal(oStartDate), this.toEdmDateLocal(oEndDate));
                    aFilters.push(oDateFilter);

                }
                else {
                    aSelectedKeys = aFilterItem.getControl().getSelectedKeys();
                    if (aSelectedKeys) {
                        aSelectedKeys.forEach(sValue => {
                            aFilters.push(new Filter(sPropertyName, "EQ", sValue));
                        }
                        )
                    }
                }

            });
            // Always include the company filter
            if (this._companyFilter) {
                aFilters.push(this._companyFilter);
            }
            let oTable = this.byId("tblContracts");
            let oBinding = oTable.getBinding("rows");
            oBinding.filter(aFilters);
            this.byId("clearFilters").setEnabled(true);
            MessageToast.show("Filters Applied Sucessfully.")

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
            this.byId("clearFilters").setEnabled(false);
            this.clearAllFilters();
        },

        clearAllFilters: function () {
            var oTable = this.byId("tblContracts");
            var aColumns = oTable.getColumns();
            for (var i = 0; i < aColumns.length; i++) {
                oTable.filter(aColumns[i], null);
            }
            // Re-apply company filter after clearing
            var aFilters = this._companyFilter ? [this._companyFilter] : [];
            this.byId("tblContracts").getBinding("rows").filter(aFilters, "Application");
            this.byId("tblContracts").getBinding("rows").filter(aFilters);
            const oFilterBar = this.byId("idFilterBar");

            if (!oFilterBar) {
                console.warn("FilterBar not found");
                return;
            }
            const aFilterItems = oFilterBar.getFilterGroupItems();

            aFilterItems.forEach(item => {
                const oControl = item.getControl();

                if (!oControl) return;

                // Reset Input
                if (oControl.setValue) {
                    oControl.setValue("");
                }

                // Reset MultiComboBox
                if (oControl.setSelectedKeys) {
                    oControl.setSelectedKeys([]);
                }

                // Reset DatePicker (if you add one later)
                if (oControl.setDateValue) {
                    oControl.setDateValue(null);
                }

                // Reset Checkboxes (if added later)
                if (oControl.setSelected) {
                    oControl.setSelected(false);
                }
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
            this.getModel("appModel").setProperty("/ContractCount", oTable.getBinding("rows").getLength());
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
                contractId: ID
            });



        },
        onViewContract: function (event) {
            let context = event.getSource().getBindingContext();
            let { ID } = context.getObject();
            this.getRouter().navTo("ContractDetails", {
                contractId: ID
            });

        },

    });
});