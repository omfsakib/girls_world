frappe.pages['item-list'].on_page_load = function (wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Item List',
		single_column: true
	});

	// Create persistent containers
	$(page.body).empty().append(`
		<div id="debug-search-area" style="padding: 15px; background: #fff; border-bottom: 1px solid #d1d8dd; display: flex; align-items: center;">
			<div style="flex: 0 0 300px;">
				<div class="input-group">
					<input type="text" class="form-control" id="item-code-search" 
						placeholder="Search Item Code..." 
						style="background-color: #f8fafc; border: 1px solid #d1d8dd; height: 38px; font-size: 14px;">
				</div>
			</div>
			<div style="margin-left: 15px; color: #8d99a6; font-size: 12px;">
				<i class="fa fa-info-circle mr-1"></i> ${__('Filter items by code in real-time')}
			</div>
		</div>
		<div class="item-list-content"></div>
	`);

	// Attach search event
	$(wrapper).on('input', '#item-code-search', frappe.utils.debounce(() => {
		load_items(page);
	}, 300));

	// Add "Add Item" button
	page.set_secondary_action(__('Add Item'), () => {
		open_add_item_dialog(page);
	});

	// Load JsBarcode dynamically
	frappe.require('https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js', () => {
		page.set_primary_action('Refresh', () => {
			load_items(page);
		});
		load_items(page);
	});
}

function load_items(page) {
	const search_term = $('#item-code-search').val();
	
	const container = $(page.body).find('.item-list-content');
	container.empty();
	container.append(`
		<div class="item-list-container">
			<div class="loading-state text-center p-5">
				<div class="spinner-border text-primary" role="status">
					<span class="sr-only">Loading...</span>
				</div>
				<p class="mt-3">Fetching items...</p>
			</div>
		</div>
	`);

	frappe.call({
		method: 'girls_world.girls_world.page.item_list.item_list.get_items',
		args: {
			search_term: search_term
		},
		callback: function (r) {
			if (r.message) {
				render_table(page, r.message);
			}
		}
	});
}

function render_table(page, items) {
	const container = $(page.body).find('.item-list-container');
	container.empty();

	const table_html = `
		<div class="table-responsive">
			<table class="table table-hover table-bordered custom-item-table">
				<thead class="thead-light">
					<tr>
						<th style="width: 15%">Item Code</th>
						<th style="width: 25%">Item Name</th>
						<th style="width: 10%">Price</th>
						<th style="width: 10%">Available Stock</th>
						<th style="width: 40%">Actions</th>
					</tr>
				</thead>
				<tbody>
					${items.map(item => {
		const formatted_price = frappe.format(item.price, { fieldtype: 'Currency' });
		// Strip HTML tags from price for the data-price attribute
		const clean_price = $('<span>').html(formatted_price).text();

		return `
						<tr>
							<td class="font-weight-bold text-primary">${item.item_code}</td>
							<td>${item.item_name || ''}</td>
							<td class="text-right">${formatted_price}</td>
							<td class="text-right">
								<span class="badge ${item.stock > 0 ? 'badge-success' : 'badge-danger'} badge-pill p-2">
									${frappe.format(item.stock, { fieldtype: 'Float' })}
								</span>
							</td>
							<td>
								<div class="btn-group">
									<button class="btn btn-xs btn-outline-primary btn-edit-item" 
										data-item-code="${item.item_code}"
										data-item-name="${item.item_name || ''}"
										data-image="${item.image || ''}">
										<i class="fa fa-edit mr-1"></i> Edit
									</button>
									<button class="btn btn-xs btn-outline-primary btn-barcode" 
										data-item-code="${item.item_code}" 
										data-item-name="${item.item_name || ''}"
										data-price="${clean_price}">
										<i class="fa fa-barcode mr-1"></i> Barcode
									</button>
									<button class="btn btn-xs btn-outline-info btn-update-stock" 
										data-item-code="${item.item_code}">
										<i class="fa fa-plus-circle mr-1"></i> Update Stock
									</button>
									<button class="btn btn-xs btn-outline-success btn-update-price" 
										data-item-code="${item.item_code}"
										data-price="${item.price}">
										<i class="fa fa-money mr-1"></i> Update Price
									</button>
								</div>
							</td>
						</tr>
					`;
	}).join('')}
				</tbody>
			</table>
		</div>
	`;

	container.append(table_html);

	container.find('.btn-edit-item').on('click', function () {
		const item_code = $(this).attr('data-item-code');
		const item_name = $(this).attr('data-item-name');
		const image = $(this).attr('data-image');
		open_edit_item_dialog(item_code, item_name, image, page);
	});

	container.find('.btn-barcode').on('click', function () {
		const item_code = $(this).attr('data-item-code');
		const item_name = $(this).attr('data-item-name');
		const price = $(this).attr('data-price');
		download_barcode(item_code, item_name, price);
	});

	container.find('.btn-update-stock').on('click', function () {
		const item_code = $(this).attr('data-item-code');
		open_stock_update_dialog(item_code, page);
	});

	container.find('.btn-update-price').on('click', function () {
		const item_code = $(this).attr('data-item-code');
		const price = $(this).attr('data-price');
		open_price_update_dialog(item_code, price, page);
	});

	// Add some custom styles
	if (!$('#item-list-styles').length) {
		$('<style id="item-list-styles">').text(`
			.custom-item-table {
				background: white;
				border-radius: 8px;
				overflow: hidden;
				box-shadow: 0 4px 6px rgba(0,0,0,0.05);
			}
			.custom-item-table thead th {
				background-color: #f8f9fa !important;
				border-bottom: 2px solid #dee2e6 !important;
				text-transform: uppercase;
				font-size: 12px;
				letter-spacing: 0.05em;
				color: #64748b;
			}
			.custom-item-table tbody tr:hover {
				background-color: #f8fafc;
				transition: background-color 0.2s ease;
			}
			.badge-pill {
				min-width: 60px;
			}
			.loading-state {
				color: #64748b;
			}
			.btn-group .btn {
				font-weight: 500;
				border-radius: 4px;
				margin-right: 4px;
				padding: 4px 10px;
			}
		`).appendTo('head');
	}
}

function download_barcode(item_code, item_name, price) {
	const logo_url = '/assets/girls_world/images/logo.png';
	const img = new Image();
	img.crossOrigin = "Anonymous";
	img.onload = function () {
		generate_barcode_with_image(item_code, item_name, price, img);
	};
	img.onerror = function () {
		// Fallback to text branding if logo is missing
		console.warn("Logo not found at " + logo_url + ". Using text fallback.");
		generate_barcode_with_image(item_code, item_name, price, null);
	};
	img.src = logo_url;
}

function generate_barcode_with_image(item_code, item_name, price, logo_img) {
	// Generate Barcode using JsBarcode on a temporary canvas first to know its dimensions
	const temp_canvas = document.createElement('canvas');
	try {
		JsBarcode(temp_canvas, item_code, {
			format: "CODE128",
			width: 2, // Thinner bars for small sticker
			height: 60, // Reduced height for tighter layout
			displayValue: true,
			fontSize: 16,
			margin: 0,
			textMargin: 0 // Tighter gap between bars and number
		});

		// Create main canvas with 38:25 ratio (approx 1.52)
		const canvas = document.createElement('canvas');
		const padding_x = 20; // Minimal side padding
		canvas.width = temp_canvas.width + padding_x;
		canvas.height = Math.round(canvas.width / 1.52);
		
		const ctx = canvas.getContext('2d');

		// White background
		ctx.fillStyle = 'white';
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		const centerX = canvas.width / 2;
		const gap = 3; // 2-3px gapping as requested

		if (logo_img) {
			// Draw Logo
			const logo_width = canvas.width * 0.45;
			const logo_height = (logo_img.height / logo_img.width) * logo_width;
			let currentY = 5;
			
			ctx.drawImage(logo_img, (canvas.width - logo_width) / 2, currentY, logo_width, logo_height);
			currentY += logo_height + gap;

			// Draw barcode below logo
			ctx.drawImage(temp_canvas, (canvas.width - temp_canvas.width) / 2, currentY);
			currentY += temp_canvas.height + gap;

			// Draw Item Name below barcode
			ctx.fillStyle = 'black';
			ctx.font = 'bold 16px Inter, "Segoe UI", Roboto, sans-serif';
			ctx.textAlign = 'center';
			ctx.fillText(item_name || '', centerX, currentY + 14);
			currentY += 14 + gap;

			// Add Price text below name
			ctx.font = 'bold 18px Inter, "Segoe UI", Roboto, sans-serif';
			ctx.fillText(`Price: ${price}`, centerX, currentY + 16);
		} else {
			// Fallback text branding
			let currentY = 10;
			ctx.fillStyle = 'black';
			ctx.font = 'bold 22px "Brush Script MT", cursive, sans-serif';
			ctx.textAlign = 'center';
			ctx.fillText('Girls World', centerX, currentY + 18);
			currentY += 18 + gap;

			// Draw barcode
			ctx.drawImage(temp_canvas, (canvas.width - temp_canvas.width) / 2, currentY);
			currentY += temp_canvas.height + gap;

			// Draw Item Name below barcode
			ctx.font = 'bold 16px Inter, "Segoe UI", Roboto, sans-serif';
			ctx.fillText(item_name || '', centerX, currentY + 14);
			currentY += 14 + gap;

			// Price
			ctx.font = 'bold 22px Inter, "Segoe UI", Roboto, sans-serif';
			ctx.fillText(`Price: ${price}`, centerX, currentY + 20);
		}

		// Download the image
		const link = document.createElement('a');
		link.download = `barcode_${item_code}.png`;
		link.href = canvas.toDataURL('image/png');
		link.click();

		frappe.show_alert({
			message: __('Barcode downloaded for {0}', [item_code]),
			indicator: 'pink'
		});
	} catch (e) {
		console.error(e);
		frappe.msgprint(__('Failed to generate barcode. Please check if item code is valid for CODE128.'));
	}
}

function open_stock_update_dialog(item_code, page) {
	const d = new frappe.ui.Dialog({
		title: __('Update Stock for {0}', [item_code]),
		fields: [
			{
				label: __('Quantity'),
				fieldname: 'qty',
				fieldtype: 'Float',
				description: __('Positive for Receipt, Negative for Issue'),
				reqd: 1
			},
			{
				label: __('Warehouse'),
				fieldname: 'warehouse',
				fieldtype: 'Link',
				options: 'Warehouse',
				reqd: 1
			}
		],
		primary_action_label: __('Update'),
		primary_action(values) {
			d.disable_primary_action();
			frappe.call({
				method: 'girls_world.girls_world.page.item_list.item_list.update_stock',
				args: {
					item_code: item_code,
					qty: values.qty,
					warehouse: values.warehouse
				},
				callback: function (r) {
					if (r.message) {
						frappe.show_alert({
							message: __('Stock Entry created: {0}', [r.message]),
							indicator: 'green'
						});
						d.hide();
						load_items(page); // Refresh list
					}
				}
			}).always(() => {
				d.enable_primary_action();
			});
		}
	});

	d.show();
}

function open_price_update_dialog(item_code, current_price, page) {
	const d = new frappe.ui.Dialog({
		title: __('Update Price for {0}', [item_code]),
		fields: [
			{
				label: __('New Price'),
				fieldname: 'new_price',
				fieldtype: 'Currency',
				default: current_price,
				reqd: 1
			}
		],
		primary_action_label: __('Update'),
		primary_action(values) {
			d.disable_primary_action();
			frappe.call({
				method: 'girls_world.girls_world.page.item_list.item_list.update_price',
				args: {
					item_code: item_code,
					new_price: values.new_price
				},
				callback: function (r) {
					if (r.message) {
						frappe.show_alert({
							message: __('Price updated for {0}', [item_code]),
							indicator: 'green'
						});
						d.hide();
						load_items(page); // Refresh list
					}
				}
			}).always(() => {
				d.enable_primary_action();
			});
		}
	});

	d.show();
}

function open_add_item_dialog(page) {
	const d = new frappe.ui.Dialog({
		title: __('Add New Item'),
		fields: [
			{
				label: __('Item Name'),
				fieldname: 'item_name',
				fieldtype: 'Data',
				reqd: 1
			},
			{
				label: __('Price'),
				fieldname: 'price',
				fieldtype: 'Currency',
				reqd: 1
			},
			{
				label: __('Opening Stock'),
				fieldname: 'opening_stock',
				fieldtype: 'Float'
			}
		],
		primary_action_label: __('Create'),
		primary_action(values) {
			d.disable_primary_action();
			frappe.call({
				method: 'girls_world.girls_world.page.item_list.item_list.create_item',
				args: {
					item_name: values.item_name,
					price: values.price,
					opening_stock: values.opening_stock || 0
				},
				callback: function (r) {
					if (r.message) {
						frappe.show_alert({
							message: __('Item created: {0}', [r.message]),
							indicator: 'green'
						});
						d.hide();
						load_items(page); // Refresh list
					}
				}
			}).always(() => {
				d.enable_primary_action();
			});
		}
	});

	d.show();
}

function open_edit_item_dialog(item_code, item_name, image, page) {
	const d = new frappe.ui.Dialog({
		title: __('Edit Item: {0}', [item_code]),
		fields: [
			{
				label: __('Item Code'),
				fieldname: 'new_item_code',
				fieldtype: 'Data',
				default: item_code,
				reqd: 1
			},
			{
				label: __('Item Name'),
				fieldname: 'item_name',
				fieldtype: 'Data',
				default: item_name,
				reqd: 1
			},
			{
				label: __('Picture'),
				fieldname: 'image',
				fieldtype: 'Attach Image',
				default: image
			}
		],
		primary_action_label: __('Update'),
		primary_action(values) {
			d.disable_primary_action();
			frappe.call({
				method: 'girls_world.girls_world.page.item_list.item_list.update_item',
				args: {
					item_code: item_code,
					new_item_code: values.new_item_code,
					item_name: values.item_name,
					image: values.image
				},
				callback: function (r) {
					if (r.message) {
						frappe.show_alert({
							message: __('Item updated successfully'),
							indicator: 'green'
						});
						d.hide();
						load_items(page); // Refresh list
					}
				}
			}).always(() => {
				d.enable_primary_action();
			});
		}
	});

	d.show();
}
