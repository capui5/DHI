sap.ui.define([
    "sap/ui/core/UIComponent",
    "sap/ui/model/json/JSONModel",
    "com/dhi/cms/cmsadmin/model/models"
], (UIComponent, JSONModel, models) => {
    "use strict";

    return UIComponent.extend("com.dhi.cms.cmsadmin.Component", {
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
                canCreateAttribute: false,
                canEditAttribute: false,
                canDeleteAttribute: false,
                canCreateAttributeGroup: false,
                canEditAttributeGroup: false,
                canDeleteAttributeGroup: false,
                canCreateTemplate: false,
                canEditTemplate: false,
                canDeleteTemplate: false,
                canSubmitTemplate: false
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

                var bAdmin = aRoles.indexOf("DHI_Admin") !== -1;
                var bPowerUser = aRoles.indexOf("DHI_PowerUser") !== -1;

                oRolesModel.setData({
                    canCreateAttribute: bAdmin,
                    canEditAttribute: bAdmin,
                    canDeleteAttribute: bAdmin,
                    canCreateAttributeGroup: bAdmin,
                    canEditAttributeGroup: bAdmin,
                    canDeleteAttributeGroup: bAdmin,
                    canCreateTemplate: bAdmin || bPowerUser,
                    canEditTemplate: bAdmin || bPowerUser,
                    canDeleteTemplate: bAdmin,
                    canSubmitTemplate: bAdmin || bPowerUser
                });
            }).catch(function (oErr) {
                console.error("Failed to load user roles:", oErr);
            });
        }
    });
});
