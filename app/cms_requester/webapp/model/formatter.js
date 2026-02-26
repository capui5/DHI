sap.ui.define([], function () {
    "use strict";
    return {
        statusState: function (status) {
            if (!status) return "None";
            var s = status.toLowerCase();
            if (s === "approved") return "Success";
            if (s === "rejected") return "Error";
            if (s.indexOf("expired") !== -1) return "Error";
            if (s.indexOf("renewal due") !== -1 || s.indexOf("renewal pending") !== -1) return "Warning";
            if (s.indexOf("renewal completed") !== -1) return "Success";
            if (s === "submitted") return "Information";
            return "None";
        }
    };
});
