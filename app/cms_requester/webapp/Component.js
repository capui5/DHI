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
            var that = this;
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
                    canDeleteContract: bCompanyAdmin
                });

                // Load user's company info based on their email
                that._loadUserCompany(oData.user);
            }).catch(function (oErr) {
                console.error("Failed to load user roles:", oErr);
            });
        },

        _loadUserCompany: function (sUserEmail) {
            var oModel = this.getModel();
            var oRolesModel = this.getModel("roles");
            console.log("=== Loading User Company ===");
            console.log("Filtering Companies by AdminName:", sUserEmail);
            var oListBinding = oModel.bindList("/Companies", undefined, undefined, [
                new sap.ui.model.Filter("AdminName", sap.ui.model.FilterOperator.EQ, sUserEmail)
            ]);
            oListBinding.requestContexts().then(function (aContexts) {
                console.log("Companies found:", aContexts.length);
                if (aContexts.length > 0) {
                    var oCompany = aContexts[0].getObject();
                    console.log("Company data:", JSON.stringify(oCompany));
                    oRolesModel.setProperty("/companyCode", oCompany.CompanyCode);
                    oRolesModel.setProperty("/companyName", oCompany.CompanyName);
                    oRolesModel.setProperty("/adminName", oCompany.AdminName);
                } else {
                    console.log("No company found for this user email!");
                }
                oRolesModel.setProperty("/companyLoaded", true);
            }).catch(function (oErr) {
                console.error("Failed to load user company:", oErr);
                oRolesModel.setProperty("/companyLoaded", true);
            });
        }
    });
});
