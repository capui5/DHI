sap.ui.define([
    "sap/ui/base/Object",
    'sap/ui/export/library',
    'sap/ui/export/Spreadsheet',
    "sap/ui/table/TablePersoController"
], function (BaseObject, exportLibrary, Spreadsheet, TablePersoController) {

    var EdmType = exportLibrary.EdmType;

    /**
     * Constructor for Table Helper object
     * @memberof com.dhi.cms.cmsadmin.util.AttributeGroupTableHelper
     * @public
     */
    var TableHelper = BaseObject.extend("com.dhi.cms.cmsadmin.util.AttributeGroupTableHelper", {});

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
            table: this.byId("tblAttributeGroups"),
            persoService: oPersoService
        });

        this.oTablePersoController.openDialog();
    }


    /**
     * Exit handler to destroy the instance
     * @memberof com.dhi.cms.cmsadmin.util.AttributeGroupTableHelper
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
     * @memberof com.dhi.cms.cmsadmin.util.AttributeGroupTableHelper
     * @public
     * @param {sap.ui.base.Event} event The event object 
     */
    TableHelper.onExportData = function (event) {

        
        let table = this.byId("tblAttributeGroups");
        let binding = table.getBinding('rows');
        let columns = TableHelper.createColumnConfig();
        let settings = {
            workbook: {
                columns: columns,
                hierarchyLevel: 'Level'
            },
            dataSource: binding,
            fileName: 'AttributeGroups.xlsx',
            worker: false // We need to disable worker because we are using a MockServer as OData Service
        };

        let sheet = new Spreadsheet(settings);
        sheet.build().finally(function () {
            sheet.destroy();
        });
    }

    /**
     * Returns the columns array of table
     * @memberof com.dhi.cms.cmsadmin.util.AttributeGroupTableHelper
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
            label: 'Attribute Group Name',
            property: 'NAME',
            type: EdmType.String
        });
        columns.push({
            label: 'Attribute Group Alias Name',
            property: 'ALIAS',
            type: EdmType.String
        });
        columns.push({
            label: 'Associated Templates',
            property: 'TEMPLATE_NAME',
            type: EdmType.String
        });
        return columns;
    }

    return TableHelper;
});

