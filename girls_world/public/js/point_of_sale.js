frappe.provide("erpnext.taxes_and_totals");
frappe.provide("erpnext.PointOfSale");
frappe.provide("girls_world.point_of_sale");

// Override JS taxes_and_totals calculation
const original_set_discount_amount = erpnext.taxes_and_totals.prototype.set_discount_amount;
erpnext.taxes_and_totals.prototype.set_discount_amount = function() {
	let base_discount = 0;
	if (this.frm.doc.additional_discount_percentage) {
		base_discount = flt(
			(flt(this.frm.doc[frappe.scrub(this.frm.doc.apply_discount_on)]) *
				this.frm.doc.additional_discount_percentage) /
				100,
			precision("discount_amount")
		);
	}
	
	let custom_discount = flt(this.frm.doc.custom_additional_discount_amount);
	this.frm.doc.discount_amount = base_discount + custom_discount;
};

frappe.pages["point-of-sale"].on_page_load = function (wrapper) {
	frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Point of Sale"),
		single_column: true,
	});

	frappe.require("point-of-sale.bundle.js", function () {
		wrapper.pos = new erpnext.PointOfSale.Controller(wrapper);
		window.cur_pos = wrapper.pos;

		girls_world.point_of_sale.PointOfSale = function () {
			const OriginalController = erpnext.PointOfSale.ItemCart;
			girls_world.CustomItemCart = class extends OriginalController {
				constructor({ wrapper, events, settings }) {
					super({ wrapper, events, settings });
				}

				show_discount_control() {
					this.$add_discount_elem.css({ padding: "0px", border: "none" });
					this.$add_discount_elem.html(
						`<div class="add-discount-field-percentage" style="width: 50%; display: inline-block;"></div>
						 <div class="add-discount-field-amount" style="width: 50%; display: inline-block;"></div>`
					);
					const me = this;
					const frm = me.events.get_frm();
					let discount = frm.doc.additional_discount_percentage;
					let discount_amount = frm.doc.custom_additional_discount_amount;

					this.discount_field = frappe.ui.form.make_control({
						df: {
							label: __("Discount %"),
							fieldtype: "Data",
							placeholder: discount ? discount + "%" : __("Percentage"),
							input_class: "input-xs",
							onchange: function () {
								this.value = flt(this.value);
								if (this.value > 100) {
									frappe.msgprint({
										title: __("Invalid Discount"),
										indicator: "red",
										message: __("Discount cannot be greater than 100%."),
									});
									this.value = 0;
								}
								frappe.model.set_value(
									frm.doc.doctype,
									frm.doc.name,
									"additional_discount_percentage",
									flt(this.value)
								).then(() => {
									setTimeout(() => {
										me.hide_discount_control(frm.doc.additional_discount_percentage);
									}, 100);
								});
							},
						},
						parent: this.$add_discount_elem.find(".add-discount-field-percentage"),
						render_input: true,
					});

					this.discount_amount_field = frappe.ui.form.make_control({
						df: {
							label: __("Discount Amount"),
							fieldtype: "Currency",
							placeholder: discount_amount ? format_currency(discount_amount, frm.doc.currency) : __("Amount"),
							input_class: "input-xs",
							change: function () {
								this.value = flt(this.value);
								console.log(this.value);
								frappe.model.set_value(
									frm.doc.doctype,
									frm.doc.name,
									"custom_additional_discount_amount",
									flt(this.value)
								).then(() => {
									if (frm.cscript && frm.cscript.calculate_taxes_and_totals) {
										frm.cscript.calculate_taxes_and_totals();
									}
									setTimeout(() => {
										me.hide_discount_control(frm.doc.additional_discount_percentage);
									}, 100);
								});
							},
						},
						parent: this.$add_discount_elem.find(".add-discount-field-amount"),
						render_input: true,
					});

					this.discount_field.toggle_label(false);
					this.discount_amount_field.toggle_label(false);
					this.discount_field.set_focus();
				}

				hide_discount_control(discount) {
					let custom_discount_amount = this.events.get_frm().doc.custom_additional_discount_amount;
					let total_discount_amount = this.events.get_frm().doc.discount_amount;

					if (!flt(discount) && !flt(custom_discount_amount)) {
						this.$add_discount_elem.css({
							border: "1px dashed var(--gray-500)",
							padding: "var(--padding-sm) var(--padding-md)",
						});
						this.$add_discount_elem.html(`${this.get_discount_icon()} ${__("Add Discount")}`);
						this.discount_field = undefined;
						this.discount_amount_field = undefined;
					} else {
						this.$add_discount_elem.css({
							border: "1px dashed var(--dark-green-500)",
							padding: "var(--padding-sm) var(--padding-md)",
						});

						let msg = `${__("Discount Applied:")}&nbsp;`;
						msg += `${format_currency(total_discount_amount, this.events.get_frm().doc.currency).bold()}`;

						this.$add_discount_elem.html(
							`<div class="edit-discount-btn">
								${this.get_discount_icon()} ${msg}
							</div>`
						);
					}
				}
			}
			erpnext.PointOfSale.ItemCart = girls_world.CustomItemCart;
		};

		girls_world.point_of_sale.PointOfSale()
	});
};

frappe.pages["point-of-sale"].refresh = function (wrapper) {
	if (document.scannerDetectionData) {
		onScan.detachFrom(document);
		wrapper.pos.wrapper.html("");
		wrapper.pos.check_opening_entry();
	}
};
