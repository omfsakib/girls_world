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

    # Buying prices in one query
    buying_rows = frappe.get_all("Item Price",
        fields=["item_code", "price_list_rate"],
        filters={"price_list": _buying_price_list()}
    )
    buying_dict = {b.item_code: b.price_list_rate for b in buying_rows}

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
            "buying_price": buying_dict.get(item.item_code, 0.0),
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

def _buying_price_list():
    return frappe.db.get_single_value("Buying Settings", "buying_price_list") or "Standard Buying"

@frappe.whitelist()
def update_price(item_code, new_price, buying_price=None):
    from frappe.utils import flt

    price_list = frappe.db.get_single_value("Selling Settings", "selling_price_list") or "Standard Selling"
    _set_item_price(item_code, flt(new_price), price_list)

    # Buying price is optional: left blank means keep the current one
    if buying_price not in (None, ""):
        buying_price = flt(buying_price)
        _set_item_price(item_code, buying_price, _buying_price_list())
        # Default cost for future stock receipts (existing stock valuation is unchanged)
        frappe.db.set_value("Item", item_code, "valuation_rate", buying_price)

    return True

def _set_item_price(item_code, new_price, price_list):
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

@frappe.whitelist()
def create_item(item_name, price, buying_price=0, opening_stock=0, warehouse=None):
    from frappe.utils import flt
    price = flt(price)
    buying_price = flt(buying_price)
    opening_stock = flt(opening_stock)
    # Stock is valued at cost; fall back to selling price if no buying price was given
    valuation_rate = buying_price or price
    
    # Generate item_code: 189438-XXXX
    prefix = "189438"
    last_item = frappe.db.sql("""
        SELECT name FROM `tabItem` 
        WHERE name LIKE %s 
        ORDER BY name DESC LIMIT 1
    """, (f"{prefix}-%",), as_dict=True)
    
    if last_item:
        last_code = last_item[0].name
        try:
            # Extract the last part and increment
            last_num_str = last_code.split('-')[-1]
            next_number = int(last_num_str) + 1
        except (ValueError, IndexError):
            next_number = 1
    else:
        next_number = 1
        
    item_code = f"{prefix}-{next_number:04d}"

    # Check if Item Group "Products" exists, if not create/find a suitable one
    item_group = "Products"
    if not frappe.db.exists("Item Group", item_group):
        # Fallback to "All Item Groups" or any available group
        item_group = frappe.db.get_value("Item Group", {"is_group": 0}, "name") or "All Item Groups"
        
    # 1. Create Item
    doc = frappe.new_doc("Item")
    doc.item_code = item_code
    doc.item_name = item_name
    doc.item_group = item_group
    doc.stock_uom = "Nos"
    doc.is_stock_item = 1
    doc.valuation_rate = valuation_rate
    doc.insert()

    # 2. Create Item Prices (selling + buying)
    update_price(item_code, price)
    if buying_price:
        _set_item_price(item_code, buying_price, _buying_price_list())
    
    # 3. Handle Opening Stock
    if opening_stock > 0:
        if not warehouse:
            warehouse = frappe.db.get_value("Warehouse", {"warehouse_name": "Stores"}, "name") or "Stores - GW"
            
        stock_entry = frappe.new_doc("Stock Entry")
        stock_entry.stock_entry_type = "Material Receipt"
        stock_entry.company = frappe.db.get_default("company") or frappe.get_all("Company", limit=1)[0].name
        
        stock_entry.append("items", {
            "item_code": item_code,
            "qty": opening_stock,
            "basic_rate": valuation_rate,
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

@frappe.whitelist()
def get_sales_summary(from_date, to_date):
    """Sold qty, buying cost (Standard Buying price x qty), selling amount and profit per item.

    Uses submitted Sales Invoices only; returns are netted (negative qty/amount).
    Selling amount is net of invoice discounts and excludes taxes.
    """
    from frappe.utils import flt, getdate

    if not frappe.has_permission("Sales Invoice", "read"):
        frappe.throw("Not permitted to view sales", frappe.PermissionError)

    from_date, to_date = getdate(from_date), getdate(to_date)
    if from_date > to_date:
        frappe.throw("From date cannot be after To date")

    rows = frappe.db.sql("""
        SELECT sii.item_code,
               MAX(sii.item_name) AS item_name,
               SUM(sii.stock_qty) AS qty,
               SUM(sii.base_net_amount) AS selling_amount
        FROM `tabSales Invoice Item` sii
        INNER JOIN `tabSales Invoice` si ON si.name = sii.parent
        WHERE si.docstatus = 1
          AND si.posting_date BETWEEN %(from_date)s AND %(to_date)s
        GROUP BY sii.item_code
        ORDER BY qty DESC, selling_amount DESC
    """, {"from_date": from_date, "to_date": to_date}, as_dict=True)

    buying = {
        b.item_code: b.price_list_rate
        for b in frappe.get_all("Item Price",
            fields=["item_code", "price_list_rate"],
            filters={"price_list": _buying_price_list(),
                     "item_code": ["in", [r.item_code for r in rows] or [""]]})
    }

    totals = {"qty": 0.0, "buying_amount": 0.0, "selling_amount": 0.0, "profit": 0.0}
    missing_buying_price = 0
    items = []
    for r in rows:
        unit_buying = buying.get(r.item_code)
        has_buying = unit_buying is not None
        qty = flt(r.qty)
        buying_amount = flt(unit_buying) * qty
        selling_amount = flt(r.selling_amount)
        profit = selling_amount - buying_amount
        if not has_buying:
            missing_buying_price += 1

        items.append({
            "item_code": r.item_code,
            "item_name": r.item_name,
            "qty": qty,
            "buying_price": flt(unit_buying) if has_buying else None,
            "buying_amount": buying_amount,
            "selling_amount": selling_amount,
            "profit": profit,
        })
        totals["qty"] += qty
        totals["buying_amount"] += buying_amount
        totals["selling_amount"] += selling_amount
        totals["profit"] += profit

    return {"totals": totals, "items": items, "missing_buying_price": missing_buying_price}
