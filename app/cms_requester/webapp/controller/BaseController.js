sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/Link",
    "sap/ui/core/Fragment",
    "sap/m/MessageBox"
], function (Controller, Link, Fragment, MessageBox) {
    "use strict";

    return Controller.extend("com.dhi.cms.cmsrequester.controller.BaseController", {


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

        onNavigation: function (sNavigationTarget) {
            var oRouter = this.getOwnerComponent().getRouter();
            var sNavigationTarget;
            if (sNavigationTarget) {
                oRouter.navTo(sNavigationTarget);
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
        getBusyDialog: function () {
            if (!this._oBusyDialog) {
                this._oBusyDialog = sap.ui.xmlfragment(this.getView().getController().createId("busyDialogId"),
                    "com.dhi.cms.cmsrequester.fragments.BusyDialog",
                    this);
                this.getView().addDependent(this._oBusyDialog);
            }
            return this._oBusyDialog;
        },

        getAppModulePathBaseURL: function () {
            var appId = this.getOwnerComponent().getManifestEntry("/sap.app/id");
            var appPath = appId.replaceAll(".", "/");
            var appModulePath = jQuery.sap.getModulePath(appPath);

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
        ODataPost: function (sPath, oNewData) {
            return new Promise((resolve, reject) => {
                var oModel = this.getView().getModel();
                var sGroupId = "batchCreate" + Date.now();
                var oDataBinding = oModel.bindList(sPath, undefined, undefined, undefined, {
                    $$updateGroupId: sGroupId
                });

                oDataBinding.attachCreateCompleted(function (oEvent) {
                    var bSuccess = oEvent.getParameter("success");
                    var oCtx = oEvent.getParameter("context");
                    if (bSuccess) {
                        try {
                            var oData = oCtx.getObject();
                            console.log("New entity created:", oData);
                            if (oData && oData.ID) {
                                resolve(oData.ID);
                            } else {
                                reject(new Error("No ID returned from backend"));
                            }
                        } catch (err) {
                            reject(err);
                        }
                    } else {
                        // Extract backend error message
                        var sErrorMsg = "An unexpected error occurred.";
                        try {
                            var aMessages = sap.ui.getCore().getMessageManager().getMessageModel().getData();
                            var oErrorMessage = aMessages.slice().reverse().find(function (msg) {
                                return msg.type === "Error";
                            });
                            if (oErrorMessage && oErrorMessage.message) {
                                sErrorMsg = oErrorMessage.message;
                            }
                        } catch (e) { /* use default */ }
                        // Clean up the failed transient context
                        try { oCtx.delete(); } catch (e) { /* ignore */ }
                        try { oModel.resetChanges(sGroupId); } catch (e) { /* ignore */ }
                        reject(new Error(sErrorMsg));
                    }
                });

                oDataBinding.create(oNewData);
                oModel.submitBatch(sGroupId);
            });
        },
        _getfiledata: async function (item) {
            let fileItem = {};
            fileItem.file_name = item.getFileName();
            fileItem.file_size = item._oFileObject.size.toString();
            let fileString = await this.getBase64(item._oFileObject);
            fileItem.media_type = this.getFileType(fileString.split(",")[0]);
            fileItem.file_content = fileString.split(",")[1];
            return fileItem;
        },
        getBase64: function (file) {
            return new Promise((resolve, reject) => {
                var reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = function () {
                    resolve(reader.result);
                };
            });
        },

        /**
         * Delete the file
         * @namespace com.dhi.cms.cmsrequester.util.transaction.AttachmentsHandler
         * @param {sap.ui.model.v4.Context} context Context to be deleted
         * @returns Promise<void>
         */
        deleteFile: function (context) {
            return context.delete();
        },
        getFileType: function (fileType) {
            const regex = /data:([^;]+);base64/;
            const match = fileType.match(regex);
            if (match) {
                return match[1];
            } else {
                return 'unknown';
            }
        },
        _getCombovalues: async function (Attribute_ID) {
            let oModel = this.getModel();
            let sPath = "/Attributes('" + Attribute_ID + "')";
            let oContext = oModel.bindContext(sPath, undefined, { $expand: "combovalues" });
            let oDetail = await oContext.requestObject().then(function (oData) {
                console.log(oData);
                return oData;
            })
            return oDetail

        }

    });

});