sap.ui.define([
    "sap/ui/base/Object",
    'sap/ui/export/library',
    'sap/ui/export/Spreadsheet',
    "sap/ui/table/TablePersoController"
], function (BaseObject, exportLibrary, Spreadsheet, TablePersoController) {

    var EdmType = exportLibrary.EdmType;

    /**
     * Constructor for Table Helper object
     * @memberof com.dhi.cms.cmsadmin.util.AttributesTableHelper
     * @public
     */
    var TableHelper = BaseObject.extend("com.dhi.cms.cmsadmin.util.AttributesTableHelper", {});

    /**
     * Open the dialog for Table personalization
     * @public
     * @param{sap.ui.base.Event} oEvent change Event
     */
     TableHelper.onPersonalization = function () {
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
            table: this.byId("tblAttributes"),
            persoService: oPersoService
        });

        this.oTablePersoController.openDialog();
    }


    /**
     * Exit handler to destroy the instance
     * @memberof com.dhi.cms.cmsadmin.util.AttributesTableHelper
     * @public
     */
    TableHelper.onExit = function () {
        if (this.oTablePersoController) {
            this.oTablePersoController.destroy();
            this.oTablePersoController = null;
        }
    }

    /**
     * Export the data from the Products table
     * @memberof com.dhi.cms.cmsadmin.util.AttributesTableHelper
     * @public
     * @param {sap.ui.base.Event} event The event object 
     */
    TableHelper.onExportData = function (event) {

        
        let table = this.byId("tblAttributes");
        let binding = table.getBinding('rows');
        let columns = TableHelper.createColumnConfig();
        let settings = {
            workbook: {
                columns: columns,
                hierarchyLevel: 'Level'
            },
            dataSource: binding,
            fileName: 'Attributes.xlsx',
            worker: false // We need to disable worker because we are using a MockServer as OData Service
        };

        let sheet = new Spreadsheet(settings);
        sheet.build().finally(function () {
            sheet.destroy();
        });
    }

    /**
     * Returns the columns array of table
     * @memberof com.dhi.cms.cmsadmin.util.AttributesTableHelper
     * @public
     * @static
     * @returns {Array} columns - Table columns array
     */
    TableHelper.createColumnConfig = function () {
        var columns = [];
        columns.push({
            label: 'ID',
            property: 'ID',
            type: EdmType.String
        });
        columns.push({
            label: 'Attribute Name',
            property: 'name',
            type: EdmType.String
        });
        columns.push({
            label: 'Value',
            property: 'value',
            type: EdmType.String
        });
        columns.push({
            label: 'Description',
            property: 'desc',
            type: EdmType.String
        });
        columns.push({
            label: 'Alias Name',
            property: 'alias',
            type: EdmType.String
        });
        columns.push({
            label: 'Attribute Type',
            property: 'type',
            type: EdmType.String
        });
        columns.push({
            label: 'Min Length',
            property: 'minlength',
            type: EdmType.String
        });
        columns.push({
            label: 'Max Length',
            property: 'maxlength',
            type: EdmType.String
        });
        columns.push({
            label: 'Mandatory',
            property: 'is_mandatory',
            type: EdmType.String
        });
        return columns;
    }
    return TableHelper;
});

