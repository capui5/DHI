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

        // Global array to hold filters
        var aGlobalFilters = [];

        return BaseController.extend("com.dhi.cms.cmsadmin.controller.Templates", {
            onInit: function () {
                this.getRouter().getRoute("Templates").attachPatternMatched(this._onObjectMatched, this);

            },

            _onObjectMatched: function (oEvent) {

                this._refreshTable();
                this._setPersonalization();
                this.clearAllFilters();
            },

            onTableFilter: function () {
                this.clearAllFilters();
            },

            clearAllFilters: function () {
                var oTable = this.byId("tblTemplates");
                var oFilter = null;

                var aColumns = oTable.getColumns();
                for (var i = 0; i < aColumns.length; i++) {
                    oTable.filter(aColumns[i], null);
                }
                this.byId("tblTemplates").getBinding("rows").filter(oFilter, sap.ui.model.FilterType.Application);
            },


            onTemplateDelete: function (oEvent) {
                let oBundle = this.getResourceBundle();
                let templateName = oEvent.getSource().getBindingContext().getObject().name;
                MessageBox.warning(oBundle.getText("templateDeleteWarning", [templateName]), {
                    icon: MessageBox.Icon.WARNING,
                    actions: [MessageBox.Action.YES, MessageBox.Action.NO],
                    emphasizedAction: MessageBox.Action.YES,
                    initialFocus: MessageBox.Action.NO,
                    dependentOn: this.getView(),
                    onClose: (sAction) => {
                        if (sAction === "YES") {
                            var oTable = this.byId("tblTemplates");
                            oTable.setBusyIndicatorDelay(0);
                            oTable.setBusy(true);
                            oEvent.getSource().getBindingContext().delete("$auto").then(function () {
                                MessageToast.show(oBundle.getText("templateDeleteSuccess", [templateName]));
                                this._refreshTable();
                                oTable.setBusy(false);
                            }.bind(this), function (oError) {
                                MessageBox.error(oBundle.getText("templateDeleteError", [templateName]));
                                oTable.setBusy(false);
                            });
                        }
                    }
                });
            },

            onTemplateEdit: function (event) {
                let context = event.getSource().getBindingContext();
                let { ID } = context.getObject();
                this.getRouter().navTo("Create Template", {
                    templateId: ID
                });
            },

            _refreshTable: function () {
                this.byId("tblTemplates").getBinding("rows").refresh();
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
                    table: this.byId("tblTemplates"),
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
                var oTable = this.byId("tblTemplates");
                this.getModel("appModel").setProperty("/TemplateCount", oTable.getBinding("rows").getLength());
            },

            onTemplateFilter: function (oEvent) {
                var oTable = this.byId("tblTemplates");

                // Prevent default filter behavior if oEvent is provided
                if (oEvent) {
                    oEvent.preventDefault();
                }
                var oColumn = oEvent.getParameter("column");
                var sFilterValue = oEvent.getParameter("value");
                var sFilterProperty = oColumn.getFilterProperty();

                aGlobalFilters = aGlobalFilters.filter(function (oFilter) {
                    return oFilter.sPath !== sFilterProperty;
                });

                if (sFilterValue) {
                    var oNewFilter;

                    if (sFilterProperty === "ID") {
                        oNewFilter = new sap.ui.model.Filter({
                            path: sFilterProperty,
                            operator: sap.ui.model.FilterOperator.EQ,
                            value1: sFilterValue
                        });
                    } else {
                        oNewFilter = new sap.ui.model.Filter({
                            path: sFilterProperty,
                            operator: sap.ui.model.FilterOperator.Contains,
                            value1: sFilterValue.toLowerCase(),
                            caseSensitive: false
                        });
                    }

                    aGlobalFilters.push(oNewFilter);

                    oColumn.setFiltered(true);
                } else {

                    oColumn.setFiltered(false);
                }

                var oCombinedFilter = new sap.ui.model.Filter({
                    filters: aGlobalFilters,
                    and: true // Use 'true' for AND, 'false' for OR
                });

                var oBinding = oTable.getBinding("rows");
                oBinding.filter(oCombinedFilter, sap.ui.model.FilterType.Application);
            }
        });
    });
