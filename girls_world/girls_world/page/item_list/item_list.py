import frappe
from erpnext.stock.get_item_details import get_item_details

@frappe.whitelist()
def get_items(search_term=None):
    filters = {"disabled": 0}
    if search_term:
        filters["item_code"] = ["like", f"%{search_term}%"]

    items = frappe.get_all("Item", 
        fields=["name as item_code", "item_name", "stock_uom", "image"], 
        filters=filters
    )
    
    # Get all bins at once to be efficient
    bins = frappe.get_all("Bin", fields=["item_code", "actual_qty"])
    bin_dict = {b.item_code: b.actual_qty for b in bins}
    
    # Find a default selling price list
    price_list = frappe.db.get_single_value("Selling Settings", "selling_price_list") or "Standard Selling"
    
    company = frappe.db.get_default("company") or frappe.get_all("Company", limit=1)[0].name
    currency = frappe.get_cached_value("Company", company, "default_currency")

    result = []
    for item in items:
        # Call get_item_details for each item to get the price
        try:
            details = get_item_details({
                "item_code": item.item_code,
                "company": company,
                "qty": 1,
                "price_list": price_list,
                "currency": currency,
                "conversion_rate": 1.0,
                "plc_conversion_rate": 1.0,
                "doctype": "Sales Order" # Context for get_item_details
            })
            price = details.get("price_list_rate") or 0.0
        except Exception:
            price = 0.0
            
        result.append({
            "item_code": item.item_code,
            "item_name": item.item_name,
            "price": price,
            "stock": bin_dict.get(item.item_code, 0.0),
            "image": item.image
        })
        
    return result

@frappe.whitelist()
def update_stock(item_code, qty, warehouse):
    from frappe.utils import flt
    qty = flt(qty)
    
    if qty == 0:
        frappe.throw("Quantity cannot be 0")
        
    stock_entry_type = "Material Receipt" if qty > 0 else "Material Issue"
    
    doc = frappe.new_doc("Stock Entry")
    doc.stock_entry_type = stock_entry_type
    doc.company = frappe.db.get_default("company") or frappe.get_all("Company", limit=1)[0].name
    
    doc.append("items", {
        "item_code": item_code,
        "qty": abs(qty),
        "t_warehouse": warehouse if qty > 0 else None,
        "s_warehouse": warehouse if qty < 0 else None,
        "cost_center": frappe.get_cached_value("Company", doc.company, "cost_center")
    })
    
    doc.insert()
    doc.submit()
    
    return doc.name

@frappe.whitelist()
def update_price(item_code, new_price):
    from frappe.utils import flt
    new_price = flt(new_price)
    
    price_list = frappe.db.get_single_value("Selling Settings", "selling_price_list") or "Standard Selling"
    
    # Check if Item Price already exists
    item_price_name = frappe.db.get_value("Item Price", {
        "item_code": item_code,
        "price_list": price_list
    })
    
    if item_price_name:
        frappe.db.set_value("Item Price", item_price_name, "price_list_rate", new_price)
    else:
        # Create new Item Price
        doc = frappe.new_doc("Item Price")
        doc.item_code = item_code
        doc.price_list = price_list
        doc.price_list_rate = new_price
        doc.insert()
        
    return True

@frappe.whitelist()
def create_item(item_code, price, opening_stock=0, warehouse=None):
    from frappe.utils import flt
    price = flt(price)
    opening_stock = flt(opening_stock)
    
    # Check if Item Group "Products" exists, if not create/find a suitable one
    item_group = "Products"
    if not frappe.db.exists("Item Group", item_group):
        # Fallback to "All Item Groups" or any available group
        item_group = frappe.db.get_value("Item Group", {"is_group": 0}, "name") or "All Item Groups"
        
    # 1. Create Item
    doc = frappe.new_doc("Item")
    doc.item_code = item_code
    doc.item_name = f"Product {item_code}"
    doc.item_group = item_group
    doc.stock_uom = "Nos"
    doc.is_stock_item = 1
    doc.valuation_rate = price
    doc.insert()
    
    # 2. Create Item Price
    update_price(item_code, price)
    
    # 3. Handle Opening Stock
    if opening_stock > 0 and warehouse:
        stock_entry = frappe.new_doc("Stock Entry")
        stock_entry.stock_entry_type = "Material Receipt"
        stock_entry.company = frappe.db.get_default("company") or frappe.get_all("Company", limit=1)[0].name
        
        stock_entry.append("items", {
            "item_code": item_code,
            "qty": opening_stock,
            "basic_rate": price,
            "t_warehouse": warehouse,
            "cost_center": frappe.get_cached_value("Company", stock_entry.company, "cost_center")
        })
        
        stock_entry.insert()
        stock_entry.submit()
        
    return doc.name

@frappe.whitelist()
def update_item(item_code, new_item_code, item_name, image=None):
    if item_code != new_item_code:
        # Rename the item (this updates all linked records)
        frappe.rename_doc("Item", item_code, new_item_code)
        item_code = new_item_code
    
    # Update other fields
    doc = frappe.get_doc("Item", item_code)
    doc.item_name = item_name
    if image:
        doc.image = image
    doc.save()
    
    return True
