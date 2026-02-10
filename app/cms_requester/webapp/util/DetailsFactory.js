sap.ui.define([
    "sap/ui/base/Object",
    "sap/m/VBox",
    "sap/m/Label",
    "sap/m/Input",
    "sap/m/CheckBox",
    "sap/m/DatePicker",
    "sap/m/ComboBox",
    "sap/ui/core/Item",
    "sap/ui/core/ListItem"
], function (BaseObject, VBox, Label, Input, CheckBox, DatePicker, ComboBox, Item, ListItem) {

    "use strict";

    var DetailsFactory = BaseObject.extend("com.dhi.cms.util.DetailsFactory", {});

    DetailsFactory.renderDetailsControls = function (id, context) {

        var data = context.getObject();
        var detailsModel = context.getModel("Details"); // named local model
        let dynamicControlIds=context.getModel("Details").getProperty("/dynamicControlIds");
        if(!dynamicControlIds){
            context.getModel("Details").setProperty("/dynamicControlIds",[]);
            dynamicControlIds=[];
        }
        debugger
        // defensive defaults
        data = data || {};
        data.AttributeType = data.AttributeType || "String";
        data.AttributeValue = data.AttributeValue || "";
        data.Value = data.Value;

        // create safe unique control id
        var safeName = (data.Attribute_Name || "attr").replace(/\s+/g, "_").replace(/[^\w\-]/g, "");
        var controlId = id + "-" + (data.Attribute_ID || safeName);

        // Label
        var label = new Label({ required: !!data.IsMandatory, text: data.Attribute_Name || "Attribute", showColon: true });
        label.addStyleClass("sapUiTinyMarginBottom");

        var control = null;
        var controlWidth = "350px";

        switch ((data.AttributeType || "").toLowerCase()) {
            case "text":
            case "string":
                control = new Input(controlId, {
                    type: "Text",
                    editable: "{appModel>/isFieldEditable}",
                    change:"onControlValueChange"
                });
                control.bindProperty("value", { path: 'Value', model: 'Details' });
                break;

            case "number":
            case "integer":
                control = new Input(controlId, {
                    type: "Number",
                    editable: "{appModel>/isFieldEditable}",
                    change:"onControlValueChange"
                });
                control.bindProperty("value", { path: 'Value', model: 'Details' });
                break;

            case "date":
                if(data.Value===""){
                    data.Value=null;
                }
                control = new DatePicker(controlId, {
                    width: controlWidth,
                    editable: "{appModel>/isFieldEditable}",
                    change:"onControlValueChange"
                });
                control.bindProperty("dateValue", { path: 'Value', model: 'Details' });
                break;

            case "boolean":
                if(data.Value==="true"){
                    data.Value=true;
                }
                else if(data.Value==="false"){
                    data.Value=false;
                }
                else{
                    data.Value=null;
                }
                control = new CheckBox(controlId, {text:"If Yes Tick Here.",
                    editable: "{appModel>/isFieldEditable}",
                    change:"onControlValueChange"
                });
                control.bindProperty("selected", { path: 'Value', model: 'Details' });
                break;

            case "select":
                // if AttributeTypeAssociation already an array, use it
                var assoc = data.AttributeTypeAssociation || [];
                context.getModel("ComboBoxModel").setProperty("/AttributeSelection" + controlId, assoc);

                control = new ComboBox(controlId, {
                    width: controlWidth,
                    showSecondaryValues: true,
                    selectedKey: "{Details>Value}",
                    editable: "{appModel>/isFieldEditable}",
                    change:"onControlValueChange"
                });
                var oAssociationItems = new ListItem({
                    key: "{Details>ID}",
                    text: "{Details>value}"
                });
                control.bindItems({
                    path: "Details>/AttributeSelection" + controlId,
                    template: oAssociationItems,
                    templateShareable: true
                });
                break;

            default:
                // fallback to text input
                control = new Input(controlId, {
                    type: "Text",
                    editable: "{appModel>/isFieldEditable}",
                    change:"onControlValueChange"
                });
                control.bindProperty("value", { path: 'Value', model: 'Details' });
                break;
        }

        // set the Details model on control if it's not inherited (harmless if already present)
        if (control && !control.getModel("Details")) {
            control.setModel(detailsModel, "Details");
        }

        var container = new VBox({
            width: controlWidth,
            items: [label, control]
        });
        container.addStyleClass("sapUiTinyMargin");
        // important: set the binding context to the attribute context and the correct model name
        if(data.IsMandatory){
        container.setBindingContext(context, "Details");
        dynamicControlIds.push(controlId);}
        context.getModel("Details").setProperty("/dynamicControlIds",dynamicControlIds);
        return container;
    };

    return DetailsFactory;
});
