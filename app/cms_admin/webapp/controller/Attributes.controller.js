sap.ui.define([
    "./BaseController",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/table/TablePersoController",
    'sap/ui/model/Filter',
    'sap/ui/model/FilterOperator',
    'sap/ui/model/FilterType',
    "../model/formatter"
], (BaseController, MessageBox, MessageToast, TablePersoController, Filter, FilterOperator, FilterType, formatter) => {
    "use strict";

    return BaseController.extend("com.dhi.cms.cmsadmin.controller.Attributes", {
        formatter: formatter,
        onInit: function () {
            this.getRouter().getRoute("Attributes").attachPatternMatched(this._onObjectMatched, this);
        },
        _onObjectMatched: async function (oEvent) {
            debugger
            await this._refreshTable();
            this._setPersonalization();
            this.clearAllFilters();
        },
        onAttributeDelete: function (oEvent) {
            let oBundle = this.getResourceBundle();
            var attributeName = oEvent.getSource().getBindingContext().getObject().name;
            let sConfirmationMessage = oBundle.getText("attributeDeleteConfirmationMessage", [attributeName]);
            MessageBox.warning(sConfirmationMessage, {
                icon: MessageBox.Icon.WARNING,
                actions: [MessageBox.Action.YES, MessageBox.Action.NO],
                emphasizedAction: MessageBox.Action.YES,
                initialFocus: MessageBox.Action.NO,
                dependentOn: this.getView(),
                onClose: (sAction) => {
                    if (sAction === "YES") {
                        var oTable = this.byId("tblAttributes");
                        oTable.setBusyIndicatorDelay(0);
                        oTable.setBusy(true);
                        oEvent.getSource().getBindingContext().delete("$auto").then(function () {
                            let sSuccessMessage = oBundle.getText("attributeDeleteSuccessMessage", [attributeName]);
                            MessageToast.show(sSuccessMessage);
                            this._refreshTable();
                            oTable.setBusy(false);
                        }.bind(this), function (oError) {
                            let sErrorMessage = oBundle.getText("attributeDeleteErrorMessage", [attributeName]);
                            MessageBox.error(sErrorMessage);
                            oTable.setBusy(false);
                        });
                    }
                }
            });
        },

        /**
         * Refresh the Attributes table
         * @memberof com.dhi.cms.cmsadmin.controller.Attributes
         * @private
         */
        _refreshTable: function () {
            debugger
            this.byId("tblAttributes").getBinding("rows").refresh();
        },

        /**
         * Handler to trigger navigation for Attribute edit page
         * @memberof com.dhi.cms.cmsadmin.controller.Attributes
         * @public
         * @param {sap.ui.base.Event} event The event object
         */
        onAttributeEdit: function (event) {
            let context = event.getSource().getBindingContext();
            let { ID } = context.getObject();
            this.getRouter().navTo("Create Attributes", {
                attributeId: ID
            });
        },

        onClearFilters: function () {
            this.clearAllFilters();
        },

        clearAllFilters: function () {
            var oTable = this.byId("tblAttributes");
            var oFilter = null;

            var aColumns = oTable.getColumns();
            for (var i = 0; i < aColumns.length; i++) {
                oTable.filter(aColumns[i], null);
            }
            this.byId("tblAttributes").getBinding("rows").filter(oFilter, "Application");
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
                table: this.byId("tblAttributes"),
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
            var oTable = this.byId("tblAttributes");
            this.getModel("appModel").setProperty("/AttributeCount", oTable.getBinding("rows").getLength());
        },

        /**
         * Global array to hold filters
         */
        aGlobalFilters: [],

        /**
         * Apply dynamic filters to the Attributes table
         * @memberof com.dhi.cms.cmsadmin.controller.Attributes
         * @public
         * @param {sap.ui.base.Event} oEvent The event object
         */
        onAttributeFilter: function (oEvent) {
            var oTable = this.byId("tblAttributes");

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
        }
    });
});