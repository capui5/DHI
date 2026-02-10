sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/Link",
    "sap/ui/core/Fragment",
    "sap/m/MessageBox",
    "sap/ui/core/Core"
], function (Controller, Link, Fragment, MessageBox, Core) {
    "use strict";

    return Controller.extend("com.dhi.cms.cmsadmin.controller.BaseController", {

        /**
         * Convenience method for accessing the controrls
         * @param {string} sId - ID of the Control
         * @returns sap.ui.core.Control
         */
        // byId: function(sId) {
        //     return this.getView().byId(sId);
        // },

        /**
         * Convenience method for accessing the router in every controller of the application.
         * @public
         * @returns {sap.ui.core.routing.Router} the router for this component
         */
        getRouter: function () {
            return this.getOwnerComponent().getRouter();
        },

        /**
         * Convenience method for getting the view model by name in every controller of the application.
         * @public
         * @param {string} sName the model name
         * @returns {sap.ui.model.Model} the model instance
         */
        getModel: function (sName) {
            return this.getView().getModel(sName);
        },

        /**
         * Convenience method for setting the view model in every controller of the application.
         * @public
         * @param {sap.ui.model.Model} oModel the model instance
         * @param {string} sName the model name
         * @returns {sap.ui.mvc.View} the view instance
         */
        setModel: function (oModel, sName) {
            return this.getView().setModel(oModel, sName);
        },

        /**
         * Convenience method for getting the resource bundle.
         * @public
         * @returns {sap.ui.model.resource.ResourceModel} the resourceModel of the component
         */
        getResourceBundle: function () {
            return this.getOwnerComponent().getModel("i18n").getResourceBundle();
        },

        /**
         * Convenience method for getting the fragment by id in every controller of the application.
         * @public
         * @returns {string} the unique ID for the fragment
         */
        _getFragmentId: function (sComponentId, sViewName, sFragmentName) {
            return sComponentId + `---${sViewName}--${sFragmentName}`;
        },
        onNavigation: async function (sNavigationTarget) {
            var oRouter = this.getOwnerComponent().getRouter();
            var sNavigationTarget;
            if (sNavigationTarget) {
                await oRouter.navTo(sNavigationTarget);
            } else {
                console.error("Navigation target not defined.");
            }
        },

       
        confirmAction: function (sMessage, actions) {
            let promise = new Promise((resolve, reject) => {
                let defaultactions = [MessageBox.Action.YES, MessageBox.Action.NO];
                if (actions) {
                    defaultactions = actions;
                }
                MessageBox.confirm(sMessage, {
                    actions: defaultactions,
                    emphasizedAction: MessageBox.Action.YES,
                    onClose: (sAction) => {
                        if (sAction === MessageBox.Action.YES) {
                            resolve(sAction);
                        }
                    },
                    dependentOn: this.getView()
                });
            });
            return promise;
        },

        /**
       * Register message manager specific to the view
       * @private 
       * @memberof com.dhi.cms.cmsadmin
       */
        _fnRegisterMessageManager: function () {
            Core
                .getMessageManager()
                .registerObject(this.getView(), true);
            var oMessagesModel = Core
                .getMessageManager()
                .getMessageModel();
            this.getView().setModel(oMessagesModel, "message");
        },

        _refreshMessageManager: function () {
            Core.getMessageManager().getMessageModel().setData([]);
            Core.getMessageManager().getMessageModel().refresh();
            this.getModel("message").setData([]);
            this.getModel("message").refresh();
        },

        getAppModulePathBaseURL: function () {
            var appId = this.getOwnerComponent().getManifestEntry("/sap.app/id");
            var appPath = appId.replaceAll(".", "/");
            var appModulePath = sap.ui.require.toUrl((appPath)?.replaceAll(".", "/"));

            return appModulePath;
        },

        /**
         * Convenience method for retrieving a translatable text.
         * @param {string} sTextId - the ID of the text to be retrieved.
         * @param {Array} [aArgs] - optional array of texts for placeholders.
         * @returns {string} the text belonging to the given ID.
         */
        getText: function (sTextId, aArgs) {
            let oBundle = this.getResourceBundle();
            return oBundle.getText(sTextId, aArgs);
        },

    });

});