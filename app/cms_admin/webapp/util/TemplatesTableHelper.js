sap.ui.define([
    "sap/ui/base/Object",
    'sap/ui/export/library',
    'sap/ui/export/Spreadsheet'
], function (BaseObject, exportLibrary, Spreadsheet, TablePersoController) {

    var EdmType = exportLibrary.EdmType;

    /**
     * Constructor for Table Helper object
     * @memberof com.dhi.cms.cmsadmin.util.TemplatesTableHelper
     * @public
     */
    var TableHelper = BaseObject.extend("com.dhi.cms.cmsadmin.util.TemplatesTableHelper", {});

    /**
     * Exit handler to destroy the instance
     * @memberof com.dhi.cms.cmsadmin.util.TemplatesTableHelper
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
     * @memberof com.dhi.cms.cmsadmin.util.TemplatesTableHelper
     * @public
     * @param {sap.ui.base.Event} event The event object 
     */
    TableHelper.onExportData = function (event) {
        let table = this.byId("tblTemplates");
        let binding = table.getBinding('rows');
        let columns = TableHelper.createColumnConfig();
        let settings = {
            workbook: {
                columns: columns,
                hierarchyLevel: 'Level'
            },
            dataSource: binding,
            fileName: 'Templates.xlsx',
            worker: false // We need to disable worker because we are using a MockServer as OData Service
        };

        let sheet = new Spreadsheet(settings);
        sheet.build().finally(function () {
            sheet.destroy();
        });
    }

    /**
     * Returns the columns array of table
     * @memberof com.dhi.cms.cmsadmin.util.TemplatesTableHelper
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
            label: 'Template Name',
            property: 'name',
            type: EdmType.String
        });
        columns.push({
            label: 'Description',
            property: 'desc',
            type: EdmType.String
        });
        return columns;
    }

    return TableHelper;
});

