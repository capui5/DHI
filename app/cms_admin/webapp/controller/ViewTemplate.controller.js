sap.ui.define([
    "./BaseController",
    "sap/m/MessageBox"
],
    function (BaseController, MessageBox) {
        "use strict";

        return BaseController.extend("com.dhi.cms.cmsadmin.controller.ViewTemplate", {
            onInit: function () {
                this.getRouter().getRoute("View Template").attachPatternMatched(this._onObjectMatched, this);
            },

            _onObjectMatched: function (oEvent) {
                var oArgs = oEvent.getParameter("arguments");
                var templateId = oArgs.templateId;
                if (templateId) {
                    this._loadTemplatePreview(templateId);
                }
            },

            _loadTemplatePreview: function (templateId) {
                var that = this;
                var oView = this.getView();
                oView.setBusyIndicatorDelay(0);
                oView.setBusy(true);

                var sPath = "/Templates(" + templateId + ")";
                var oParameters = {
                    $expand: "attribute_groups($select=ID,sortID;$expand=attribute_groups($select=ID,attribute_group_id,name,desc;$expand=attributes($select=sortID;$expand=attribute)))"
                };

                var oBindingContext = this.getModel().bindContext(sPath, null, oParameters);

                oBindingContext.requestObject().then(function (oData) {
                    // Set basic template info
                    that.getModel("appModel").setProperty("/ViewTemplate", oData);

                    // Build attribute groups preview
                    var aGroups = [];
                    if (Array.isArray(oData.attribute_groups)) {
                        oData.attribute_groups.forEach(function (group) {
                            var oGroup = {
                                name: "",
                                desc: "",
                                Rank: group.sortID || 0,
                                attributes: []
                            };

                            if (group.attribute_groups) {
                                oGroup.name = group.attribute_groups.name || "";
                                oGroup.desc = group.attribute_groups.desc || "";

                                if (Array.isArray(group.attribute_groups.attributes)) {
                                    oGroup.attributes = group.attribute_groups.attributes.map(function (attrWrapper) {
                                        var attr = attrWrapper.attribute || {};
                                        attr.sortID = attrWrapper.sortID;
                                        return attr;
                                    });
                                    oGroup.attributes.sort(function (a, b) {
                                        return (a.sortID || 0) - (b.sortID || 0);
                                    });
                                }
                            }

                            if (oGroup.Rank > 0) {
                                aGroups.push(oGroup);
                            }
                        });

                        // Sort groups by Rank
                        aGroups.sort(function (a, b) {
                            return a.Rank - b.Rank;
                        });
                    }

                    that._buildPreviewLayout(aGroups);
                    oView.setBusy(false);
                }).catch(function (oError) {
                    console.error("Error loading template preview:", oError);
                    MessageBox.error("Failed to load template preview.");
                    oView.setBusy(false);
                });
            },

            _buildPreviewLayout: function (aGroups) {
                var oContainer = this.byId("previewAttributeGroupsVBox");
                oContainer.removeAllItems();

                oContainer.addItem(new sap.m.Title({
                    text: "Attributes",
                    titleStyle: "H5"
                }).addStyleClass("sapUiSmallMarginTop sapUiSmallMarginBegin"));

                var oList = new sap.m.List({
                    showSeparators: "Inner"
                }).addStyleClass("sapUiSmallMarginBottom");

                aGroups.forEach(function (group) {
                    oList.addItem(new sap.m.StandardListItem({
                        title: group.name || ""
                    }));
                });

                oContainer.addItem(oList);
            }
        });
    });
