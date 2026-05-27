import frappe
from frappe.utils import flt
from erpnext.controllers.taxes_and_totals import calculate_taxes_and_totals

def patch_taxes_and_totals():
    # We completely override set_discount_amount to avoid accumulation bugs
    def custom_set_discount_amount(self):
        base_discount = 0
        if self.doc.additional_discount_percentage:
            from frappe import scrub
            base_discount = flt(
                flt(self.doc.get(scrub(self.doc.apply_discount_on)))
                * self.doc.additional_discount_percentage
                / 100,
                self.doc.precision("discount_amount"),
            )
        
        custom_discount = 0
        if self.doc.meta.has_field("custom_additional_discount_amount") and self.doc.custom_additional_discount_amount:
            custom_discount = flt(self.doc.custom_additional_discount_amount)
            
        self.doc.discount_amount = base_discount + custom_discount

    calculate_taxes_and_totals.set_discount_amount = custom_set_discount_amount

patch_taxes_and_totals()
