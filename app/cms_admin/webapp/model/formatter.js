sap.ui.define([], () => {
	"use strict";

	return {
		booleanToString: function (bValue) {
			debugger
		    return bValue=="Yes" ? "true" : "false";
		},
		toDate: function (sValue) {
			if (!sValue) return null;
			// Converts yyyy-MM-dd → JS Date
			const parts = sValue.split("-");
			return new Date(parts[0], parts[1] - 1, parts[2]);
		},
		formatDateToString: function (oDate) {
			if (!oDate) return null;
			// Convert Date → "yyyy-MM-dd"
			let yyyy = oDate.getFullYear();
			let mm = String(oDate.getMonth() + 1).padStart(2, "0");
			let dd = String(oDate.getDate()).padStart(2, "0");
			return `${yyyy}-${mm}-${dd}`;
		},

		disableButton: function (status, userRole) {
			if ((status === "Draft" && (userRole === "catManager" || userRole === "supplier" || userRole === "admin")) ||
				((status === "Prepare for Sale" || status === "Approved") && (userRole === "catManager" || userRole === "admin")) ||
				(status === "In Review" && (userRole === "catManager" || userRole === "supChain" || userRole === "admin")) ||
				(status === "Published" && (userRole === "catManager" || userRole === "admin"))) {
				return true;
			} else {
				return false;
			}
		},

		displayIcon: function (status, userRole) {
			if ((status === "Draft" && (userRole === "supplier" || userRole === "admin")) ||
				((status === "Prepare for Sale" || status === "Approved") && userRole === "catManager") ||
				(status === "In Review" && (userRole === "supChain" || userRole === "admin"))) {
				return 'sap-icon://edit';
			} else {
				return 'sap-icon://show';
			}
		},

		getStatusDescription: function (statusID) {
			switch (statusID) {
				case "612a01a5-ca4e-403b-b358-e43cd0cf228c":
					return "Draft";
				case "6373c2d9-f719-4845-b16d-a6ed5496b609":
					return "Prepare for Sale";
				case "a9d410e9-7828-4a65-a7f6-74c44437b40c":
					return "In Review";
				case "4e733f83-ae76-4fc8-9748-9c0afe081da8":
					return "Approved";
				case "01d5823f-2ac8-4d36-80b9-0e515fb971a3":
					return "Published";
			}
		},

		formatDateProducts: function (dValue) {
			if (dValue) {
				return dValue.split("T")[0];
			} else {
				const i18nModel = this.getView().getModel("i18n");
				return i18nModel.getResourceBundle().getText("Dashboard_DateNotAvailable");
			}
		},

		formatDateVersionHistory: function (dValue) {
			if (dValue) {
				const date = new Date(dValue);
				// Format the date and time using Intl.DateTimeFormat
				return new Intl.DateTimeFormat("en-US", {
					month: "short",
					day: "2-digit",
					year: "numeric",
					hour: "numeric",
					minute: "2-digit",
					second: "2-digit",
					hour12: true
				}).format(date);
			}
		},

		getTranslatedText: function (key) {
			const i18nModel = this.getView().getModel("i18n");
			return i18nModel.getResourceBundle().getText(key);
		},

		formatValueJson: function (jsonString) {
			if (!jsonString) {
				return "0.00";
			}

			try {
				const oValue = jsonString.replace(/\\"/g, '"');
				const parsed = JSON.parse(oValue);

				if (!parsed || parsed.value == null) {
					return "0.00";
				}

				const numericValue = parseFloat(parsed.value);
				if (isNaN(numericValue)) {
					return "0.00";
				}

				return `${numericValue.toFixed(2)}`;
			} catch (e) {
				// In case parsing fails
				return "€0.00";
			}
		},

		formatDescription: function (description) {
			if (!description || description.trim() === "") {
				return "There is no information available for this product right now.";
			}
			return description;
		},

		isImageOrPlaceholder: function (media_type, file_url, placeholder) {
			if (media_type && media_type.toLowerCase().includes("image")) {
				return file_url;
			}
			return placeholder;
		}

	};
});