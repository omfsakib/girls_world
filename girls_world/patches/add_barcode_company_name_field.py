import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_field


def execute():
	create_custom_field("Company", {
		"fieldname": "custom_barcode_company_name",
		"label": "Barcode Company Name",
		"fieldtype": "Data",
		"insert_after": "company_name",
		"description": (
			"Brand name printed on generated item barcodes (Item List > Download Barcode). "
			"Falls back to the Company's normal name if left blank."
		),
	})
