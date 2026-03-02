sap.ui.define([
    "sap/ui/core/UIComponent",
    "sap/ui/model/json/JSONModel",
    "com/dhi/cms/cmsrequester/model/models"
], (UIComponent, JSONModel, models) => {
    "use strict";

    return UIComponent.extend("com.dhi.cms.cmsrequester.Component", {
        metadata: {
            manifest: "json",
            interfaces: [
                "sap.ui.core.IAsyncContentCreation"
            ]
        },

        init() {
            // call the base component's init function
            UIComponent.prototype.init.apply(this, arguments);

            // set the device model
            this.setModel(models.createDeviceModel(), "device");

            // initialize roles model with defaults
            var oRolesModel = new JSONModel({
                canCreateContract: false,
                canEditContract: false,
                canDeleteContract: false
            });
            this.setModel(oRolesModel, "roles");

            // fetch user roles
            this._loadUserRoles();

            // enable routing
            this.getRouter().initialize();
        },

        _loadUserRoles: function () {
            var oModel = this.getModel();
            var oRolesModel = this.getModel("roles");
            var oContext = oModel.bindContext("/getUserInfo()");
            oContext.requestObject().then(function (oData) {
                var aRoles = (oData.roles || [])
                    .filter(function (r) { return r.allowed; })
                    .map(function (r) { return r.role; });

                var bCompanyAdmin = aRoles.indexOf("Company_Admin") !== -1;
                var bCompanyEditor = aRoles.indexOf("Company_Editor") !== -1;

                oRolesModel.setData({
                    userEmail: oData.user,
                    canCreateContract: bCompanyAdmin || bCompanyEditor,
                    canEditContract: bCompanyAdmin || bCompanyEditor,
                    canDeleteContract: bCompanyAdmin,
                    companyCode: oData.companyCode || null,
                    companyName: oData.companyName || null,
                    companyLoaded: true
                });
            }).catch(function (oErr) {
                console.error("Failed to load user roles:", oErr);
                oRolesModel.setProperty("/companyLoaded", true);
            });
        }
    });
});
